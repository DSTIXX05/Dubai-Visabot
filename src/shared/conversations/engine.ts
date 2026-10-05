// Conversation engine — the explicit state machine.
//
// Flow per message:
//   1. load (or create) the conversation record
//   2. extract intent + slots via DeepSeek (or fallback)
//   3. merge slots into context
//   4. route by current state + intent, running only verified business logic
//   5. persist the transition + append to the rolling transcript (Option B)
//   6. return a SafeResponse the worker enqueues for delivery

import { AppConfig } from "../config";
import {
  extractIntent,
  normalizeDateWithLlm,
  normalizePassportWithLlm,
} from "../ai/deepseek";
import {
  ConversationRecord,
  getApplication,
  getConversation,
  saveConversation,
} from "../db/dynamo";
import {
  ChatMessage,
  ConversationState,
  Intent,
  NormalizedMessage,
  SafeResponse,
  Slots,
} from "../types";
import {
  formatProductReply,
  formatVisaOptions,
  formatVisaRequirements,
  lookupVisaInfo,
  resolveVisaChoice,
} from "../domain/catalogue";
import { normalizeDate } from "../domain/dates";
import { normalizePassport } from "../domain/passport";
import { assessEligibility } from "../domain/assessments";
import {
  formatApplicationSummary,
  formatStatusReply,
  submitApplication,
} from "../domain/applications";

const MAIN_MENU: Array<{ intent: Intent; label: string }> = [
  { intent: "visa_enquiry", label: "Ask about visa requirements or prices" },
  { intent: "assessment", label: "Check your eligibility" },
  { intent: "application", label: "Start an application" },
  { intent: "status_check", label: "Check an application status" },
];

const GREETING_TEXT =
  "Hi! I'm your visa assistant. I can help you:\n" +
  MAIN_MENU.map((item, i) => `${i + 1}. ${item.label}`).join("\n") +
  "\n\nHow can I help?\n\nSend /restart anytime to start over.";

const HANDOFF_TEXT =
  "I've flagged your conversation for a human agent. Someone will reach out shortly.";

/** Map a numeric main-menu selection (e.g. "3" or "option 2") to an intent. */
export function resolveMainMenu(text: string): Intent | null {
  const m = text
    .trim()
    .toLowerCase()
    .match(/^(?:option\s*)?#?\s*(\d+)\s*[.)\-:]?\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= MAIN_MENU.length ? MAIN_MENU[n - 1].intent : null;
}

export async function handleMessage(
  message: NormalizedMessage,
  config: AppConfig,
): Promise<SafeResponse> {
  const now = new Date().toISOString();
  let conv = await getConversation(message.userId, config.dynamoTable);

  if (!conv) {
    conv = newConversation(message.userId, now, config);
  }

  // Global reset commands work from any state (e.g. Telegram /start, /restart).
  // Reset the record in place so the next message starts from a blank slate.
  if (isResetCommand(message.text)) {
    conv.state = "IDLE";
    conv.context = { slots: {} };
    conv.history = [];
    conv.updatedAt = now;
    conv.expiresAt = ttlEpoch(config);
    await saveConversation(conv, config.dynamoTable);
    return {
      status: "ok",
      intent: "greeting",
      replyText: GREETING_TEXT,
      nextState: "IDLE",
    };
  }

  let result: SafeResponse;
  let intent: Intent;
  let mergedSlots: Slots;

  if (
    conv.state === "APPLICATION" ||
    conv.state === "VISA_SELECTION" ||
    conv.state === "CONFIRM_APPLICATION" ||
    conv.state === "STATUS_CHECK"
  ) {
    // Mid-flow: the user's raw text is the answer (or confirmation).
    // Deliberately skip DeepSeek here — it can't reliably extract names, dates,
    // emails, or visa choices, and its slots must never overwrite captured fields.
    intent =
      conv.state === "VISA_SELECTION"
        ? "visa_enquiry"
        : conv.state === "STATUS_CHECK"
          ? "status_check"
          : "application";
    mergedSlots = { ...conv.context.slots };

    if (isCancelCommand(message.text)) {
      clearApplicationSlots(mergedSlots);
      result = {
        status: "ok",
        intent,
        replyText: `Cancelled. ${GREETING_TEXT}`,
        nextState: "IDLE",
      };
    } else if (isHandoffCommand(message.text)) {
      intent = "human_handoff";
      result = {
        status: "ok",
        intent,
        replyText: HANDOFF_TEXT,
        nextState: "HANDOFF",
      };
    } else if (conv.state === "VISA_SELECTION") {
      mergedSlots.visa = message.text.trim();
      result = await handleVisaSelection(mergedSlots, config);
    } else if (conv.state === "CONFIRM_APPLICATION") {
      result = await handleApplicationConfirmation(
        message.text,
        mergedSlots,
        message.userId,
        config,
      );
      if (result.nextState === "IDLE") {
        // Submitted — drop form fields so stale data doesn't leak into the next flow.
        clearApplicationSlots(mergedSlots);
      }
    } else if (conv.state === "STATUS_CHECK") {
      result = await handleStatusLookup(message.text, message.userId, config);
    } else {
      const pending = nextApplicationField(mergedSlots);
      if (pending) {
        mergedSlots[pending] = message.text.trim();
      }
      result = await handleApplication(mergedSlots, message.userId, config);
    }
  } else {
    const { intent: extractedIntent, slots } = await extractIntent(
      message.text,
      conv.history,
      config,
    );
    intent = extractedIntent;
    mergedSlots = { ...conv.context.slots, ...slots };

    // Numeric main-menu selection ("1".."4") works from IDLE/GREETING.
    if (conv.state === "IDLE" || conv.state === "GREETING") {
      const menuIntent = resolveMainMenu(message.text);
      if (menuIntent) intent = menuIntent;
    }

    if (intent === "human_handoff") {
      result = {
        status: "ok",
        intent,
        replyText: HANDOFF_TEXT,
        nextState: "HANDOFF",
      };
    } else {
      result = await route(
        conv.state,
        intent,
        mergedSlots,
        message.userId,
        config,
      );
    }
  }

  // Persist transition + append to rolling transcript.
  const userMsg: ChatMessage = { role: "user", text: message.text, at: now };
  const botMsg: ChatMessage = {
    role: "assistant",
    text: result.replyText,
    at: now,
  };
  conv.state = result.nextState;
  conv.context = { intent, slots: mergedSlots };
  conv.history = [...conv.history, userMsg, botMsg].slice(
    -config.maxHistoryMessages * 2,
  );
  conv.updatedAt = now;
  conv.expiresAt = ttlEpoch(config);

  await saveConversation(conv, config.dynamoTable);

  return result;
}

function newConversation(
  userId: string,
  now: string,
  config: AppConfig,
): ConversationRecord {
  return {
    pk: `USER#${userId}`,
    sk: "CONVERSATION#active",
    userId,
    state: "IDLE",
    context: { slots: {} },
    history: [],
    updatedAt: now,
    expiresAt: ttlEpoch(config),
  };
}

function ttlEpoch(config: AppConfig): number {
  return Math.floor(Date.now() / 1000) + config.conversationTtlHours * 3600;
}

async function route(
  currentState: ConversationState,
  intent: Intent,
  slots: Slots,
  userId: string,
  config: AppConfig,
): Promise<SafeResponse> {
  switch (currentState) {
    case "ENQUIRY":
      return handleEnquiry(slots, config);
    case "VISA_SELECTION":
      // Normally handled in handleMessage (raw capture); fall back to enquiry.
      return handleEnquiry(slots, config);
    case "STATUS_CHECK":
      return {
        status: "ok",
        replyText:
          "Please share your application reference number (e.g. VISA-7K2M9Q).",
        nextState: "STATUS_CHECK",
      };
    case "ASSESSMENT":
      return handleAssessment(slots, config);
    case "HANDOFF":
      return {
        status: "ok",
        replyText:
          "An agent will reach out soon. Is there anything else I can help with?",
        nextState: "IDLE",
      };
    case "GREETING":
    case "IDLE":
    default:
      return handleIdle(intent, slots, userId, config);
  }
}

async function handleIdle(
  intent: Intent,
  slots: Slots,
  userId: string,
  config: AppConfig,
): Promise<SafeResponse> {
  switch (intent) {
    case "greeting":
    case "help":
      return {
        status: "ok",
        intent,
        replyText: GREETING_TEXT,
        nextState: "GREETING",
      };
    case "visa_enquiry":
      return handleEnquiry(slots, config);
    case "assessment":
      return handleAssessment(slots, config);
    case "application":
      return handleApplication(slots, userId, config);
    case "status_check":
      return {
        status: "ok",
        intent,
        replyText:
          "Please share your application reference number (e.g. VISA-7K2M9Q) and I'll look it up.",
        nextState: "STATUS_CHECK",
      };
    default:
      return {
        status: "ok",
        replyText: `I'm not sure I understood that. ${GREETING_TEXT}`,
        nextState: "IDLE",
      };
  }
}

async function handleEnquiry(
  slots: Slots,
  config: AppConfig,
): Promise<SafeResponse> {
  const destination = slots.destination;
  if (!destination) {
    return {
      status: "ok",
      replyText: "Which country would you like a visa for?",
      nextState: "ENQUIRY",
    };
  }
  const products = await lookupVisaInfo(destination, config);
  if (products.length === 0) {
    return {
      status: "ok",
      intent: "visa_enquiry",
      facts: { destination },
      replyText: formatProductReply(products, destination),
      nextState: "IDLE",
    };
  }

  const replyText = `${formatProductReply(
    products,
    destination,
  )}\n\nReply with the number or name of the visa you'd like.`;
  return {
    status: "ok",
    intent: "visa_enquiry",
    facts: {
      destination,
      currency: products[0]?.currency,
      price: products[0]?.priceUsd,
    },
    replyText,
    nextState: "VISA_SELECTION",
  };
}

/** Handle the user's answer to the numbered visa list shown after an enquiry. */
async function handleVisaSelection(
  slots: Slots,
  config: AppConfig,
): Promise<SafeResponse> {
  const destination = slots.destination;
  const products = destination
    ? await lookupVisaInfo(destination, config)
    : [];

  if (products.length === 0) {
    return handleEnquiry(slots, config);
  }

  const selected = resolveVisaChoice(slots.visa ?? "", products);
  if (!selected) {
    return {
      status: "ok",
      intent: "visa_enquiry",
      replyText: `I didn't recognize that visa. Please choose one of:\n\n${formatVisaOptions(products)}`,
      nextState: "VISA_SELECTION",
    };
  }

  // Normalize the captured choice so a later "apply" can continue from here.
  slots.visa = selected.visaType;

  return {
    status: "ok",
    intent: "visa_enquiry",
    facts: {
      destination: selected.destination,
      visa: selected.visaType,
      currency: selected.currency,
      price: selected.priceUsd,
    },
    replyText: `${formatVisaRequirements(selected)}\n\nWould you like to start an application? Reply "apply".`,
    nextState: "IDLE",
  };
}

async function handleAssessment(
  slots: Slots,
  config: AppConfig,
): Promise<SafeResponse> {
  const { destination, purpose, nationality } = slots;
  if (!destination) {
    return {
      status: "ok",
      replyText: "Which country are you assessing eligibility for?",
      nextState: "ASSESSMENT",
    };
  }
  if (!purpose) {
    return {
      status: "ok",
      replyText:
        "What's the purpose of your visit (tourism, business, study, family)?",
      nextState: "ASSESSMENT",
    };
  }
  if (!nationality) {
    return {
      status: "ok",
      replyText: "What's your nationality?",
      nextState: "ASSESSMENT",
    };
  }

  const outcome = assessEligibility(slots);
  const replyText = outcome.eligible
    ? `Based on your profile (${nationality} national, ${purpose} visit to ${destination}), you appear eligible. Would you like to start an application?`
    : `Based on your profile, this case needs additional review. I'll flag it for an agent.`;

  return {
    status: "ok",
    intent: "assessment",
    facts: { eligible: outcome.eligible, reason: outcome.reason },
    replyText,
    nextState: outcome.eligible ? "IDLE" : "HANDOFF",
  };
}

type ApplicationField =
  | "destination"
  | "visa"
  | "passport"
  | "travelDate"
  | "name"
  | "email";

const APPLICATION_FIELDS: ApplicationField[] = [
  "destination",
  "visa",
  "passport",
  "travelDate",
  "name",
  "email",
];

function nextApplicationField(slots: Slots): ApplicationField | null {
  return APPLICATION_FIELDS.find((f) => !slots[f]) ?? null;
}

function clearApplicationSlots(slots: Slots): void {
  for (const f of APPLICATION_FIELDS) {
    delete slots[f];
  }
}

/** Normalize a travel date: deterministic rules first, DeepSeek as fallback. */
async function normalizeTravelDate(
  raw: string,
  config: AppConfig,
): Promise<string> {
  const ruled = normalizeDate(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ruled)) return ruled;
  const llm = await normalizeDateWithLlm(raw, config);
  return llm ?? ruled;
}

/** Normalize a passport answer: deterministic rules first, DeepSeek as fallback. */
async function normalizePassportValue(
  raw: string,
  config: AppConfig,
): Promise<string> {
  const ruled = normalizePassport(raw);
  if (ruled !== raw.trim()) return ruled;
  const llm = await normalizePassportWithLlm(raw, config);
  return llm ?? ruled;
}

const EDITABLE_FIELDS: Array<{ field: ApplicationField; keywords: string[] }> = [
  { field: "passport", keywords: ["passport", "nationality"] },
  { field: "travelDate", keywords: ["travel date", "date", "travel"] },
  { field: "name", keywords: ["name"] },
  { field: "email", keywords: ["email", "e-mail", "mail"] },
];

/** Detect which field the user wants to edit during confirmation. */
export function detectEditField(text: string): ApplicationField | null {
  const t = text.toLowerCase();
  for (const { field, keywords } of EDITABLE_FIELDS) {
    for (const keyword of keywords) {
      if (new RegExp(`\\b${keyword}\\b`, "i").test(t)) return field;
    }
  }
  return null;
}

function promptForField(field: ApplicationField): string {
  switch (field) {
    case "passport":
      return "Which passport do you hold? (e.g. Nigeria, India, United Kingdom)";
    case "travelDate":
      return "What is your intended travel date? (e.g. 15 October 2026)";
    case "name":
      return "What's your full name?";
    case "email":
      return "What's your email address?";
    default:
      return "Which country would you like a visa for?";
  }
}

async function handleApplicationConfirmation(
  text: string,
  slots: Slots,
  userId: string,
  config: AppConfig,
): Promise<SafeResponse> {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.,!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    /^(yes|yep|y|confirm|submit|ok|okay|correct|good|sure|go ahead|proceed|continue|yes please|yes submit|please submit|that'?s correct)$/.test(
      t,
    )
  ) {
    return submitApplicationFromSlots(slots, userId, config);
  }

  const field = detectEditField(t);
  if (field) {
    delete slots[field];
    return {
      status: "ok",
      intent: "application",
      replyText: promptForField(field),
      nextState: "APPLICATION",
    };
  }

  return {
    status: "ok",
    intent: "application",
    replyText:
      'Reply "yes" to submit, or tell me which field to change: passport, travel date, name, or email.',
    nextState: "CONFIRM_APPLICATION",
  };
}

async function submitApplicationFromSlots(
  slots: Slots,
  userId: string,
  config: AppConfig,
): Promise<SafeResponse> {
  const products = slots.destination
    ? await lookupVisaInfo(slots.destination, config)
    : [];
  const selected = resolveVisaChoice(slots.visa ?? "", products);

  if (!selected) {
    // Safety net — shouldn't happen after a confirmed form; recover gracefully.
    return handleApplication(slots, userId, config);
  }

  const totalUsd = selected.priceUsd;
  const currency = selected.currency;
  const cleanAnswers: Slots = {
    ...slots,
    destination: selected.destination,
    visa: selected.visaType,
  };

  const { applicationId, paymentUrl } = await submitApplication(
    userId,
    cleanAnswers,
    config,
    { totalUsd, currency },
  );

  const summary = formatApplicationSummary({
    destination: selected.destination,
    visa: selected.visaType,
    passport: slots.passport ?? "",
    travelDate: slots.travelDate ?? "",
    name: slots.name ?? "",
    email: slots.email ?? "",
    totalUsd,
    currency,
  });

  return {
    status: "ok",
    intent: "application",
    facts: { applicationId, totalUsd, currency },
    replyText: `${summary}\n\nApplication reference: ${applicationId}\n\nComplete your payment here:\n${paymentUrl}`,
    nextState: "IDLE",
  };
}

const REFERENCE_PATTERN = /\bVISA-[A-Z0-9]{4,12}\b/i;

/** Extract an application reference from a status-check message. */
export function extractReference(text: string): string | null {
  const m = text.match(REFERENCE_PATTERN);
  if (m) return m[0].toUpperCase();

  const bare = text.trim().match(/^([A-Z0-9-]{4,20})$/i);
  if (bare && /\d/.test(bare[1])) {
    const code = bare[1].toUpperCase();
    return code.startsWith("VISA-") ? code : `VISA-${code}`;
  }
  return null;
}

async function handleStatusLookup(
  text: string,
  userId: string,
  config: AppConfig,
): Promise<SafeResponse> {
  const ref = extractReference(text);

  if (!ref) {
    return {
      status: "ok",
      intent: "status_check",
      replyText:
        "Please share your application reference number (e.g. VISA-7K2M9Q).",
      nextState: "STATUS_CHECK",
    };
  }

  const app = await getApplication(userId, ref, config.dynamoTable);

  if (!app) {
    return {
      status: "ok",
      intent: "status_check",
      replyText: `I couldn't find an application with reference "${ref}". Please double-check the number and try again.`,
      nextState: "STATUS_CHECK",
    };
  }

  return {
    status: "ok",
    intent: "status_check",
    facts: { applicationId: app.applicationId, stage: app.stage },
    replyText: formatStatusReply(app),
    nextState: "IDLE",
  };
}

function isCancelCommand(text: string): boolean {
  return /^(cancel|restart|start over|reset|quit)$/i.test(text.trim());
}

/** Global reset commands — Telegram /start and /restart (with optional @botname suffix). */
export function isResetCommand(text: string): boolean {
  return /^\/(?:start|restart)(?:@\w+)?$/i.test(text.trim());
}

function isHandoffCommand(text: string): boolean {
  return /(talk|speak)\s+to\s+(a\s+)?(human|agent|person|representative)|customer\s+service|real\s+person/i.test(
    text.trim(),
  );
}

async function handleApplication(
  slots: Slots,
  userId: string,
  config: AppConfig,
): Promise<SafeResponse> {
  // 1. Destination
  if (!slots.destination) {
    return {
      status: "ok",
      replyText: "Which country would you like a visa for?",
      nextState: "APPLICATION",
    };
  }

  const products = await lookupVisaInfo(slots.destination, config);

  // 2. Visa type (show options)
  if (!slots.visa) {
    if (products.length === 0) {
      return {
        status: "ok",
        replyText: `I don't have visa options for ${slots.destination} yet. Would you like to talk to an agent?`,
        nextState: "APPLICATION",
      };
    }
    return {
      status: "ok",
      replyText: `Here are the visa options for ${slots.destination}:\n\n${formatVisaOptions(products)}\n\nReply with the number or name of the visa you'd like.`,
      nextState: "APPLICATION",
    };
  }

  const selected = resolveVisaChoice(slots.visa, products);
  if (!selected) {
    return {
      status: "ok",
      replyText: `I didn't recognize that visa. Please choose one of:\n\n${formatVisaOptions(products)}`,
      nextState: "APPLICATION",
    };
  }

  // 3. Passport
  if (!slots.passport) {
    return {
      status: "ok",
      replyText: `${formatVisaRequirements(selected)}\n\nWhich passport do you hold? (e.g. Nigeria, India, United Kingdom)`,
      nextState: "APPLICATION",
    };
  }
  slots.passport = await normalizePassportValue(slots.passport, config);

  // 4. Travel date
  if (!slots.travelDate) {
    return {
      status: "ok",
      replyText: "What is your intended travel date? (e.g. 15 October 2026)",
      nextState: "APPLICATION",
    };
  }
  slots.travelDate = await normalizeTravelDate(slots.travelDate, config);
  // 5. Name
  if (!slots.name) {
    return {
      status: "ok",
      replyText: "What's your full name?",
      nextState: "APPLICATION",
    };
  }
  // 6. Email
  if (!slots.email) {
    return {
      status: "ok",
      replyText: "What's your email address?",
      nextState: "APPLICATION",
    };
  }

  // All fields collected — show a confirmation before creating the application.
  const summary = formatApplicationSummary({
    destination: selected.destination,
    visa: selected.visaType,
    passport: slots.passport ?? "",
    travelDate: slots.travelDate ?? "",
    name: slots.name ?? "",
    email: slots.email ?? "",
    totalUsd: selected.priceUsd,
    currency: selected.currency,
  });

  return {
    status: "ok",
    intent: "application",
    facts: {
      destination: selected.destination,
      visa: selected.visaType,
      totalUsd: selected.priceUsd,
      currency: selected.currency,
    },
    replyText: `${summary}\n\nReply "yes" to submit, or tell me what to change (passport, travel date, name, or email).`,
    nextState: "CONFIRM_APPLICATION",
  };
}
