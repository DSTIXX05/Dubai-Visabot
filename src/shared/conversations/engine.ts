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
import { extractIntent } from "../ai/deepseek";
import {
  ConversationRecord,
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
  lookupVisaInfo,
  resolveVisaChoice,
} from "../domain/catalogue";
import { assessEligibility } from "../domain/assessments";
import {
  formatApplicationSummary,
  submitApplication,
} from "../domain/applications";

const GREETING_TEXT =
  "Hi! I'm your visa assistant. I can help you:\n" +
  "1. Ask about visa requirements or prices\n" +
  "2. Check your eligibility\n" +
  "3. Start an application\n" +
  "4. Check an application status\n\n" +
  "How can I help?";

export async function handleMessage(
  message: NormalizedMessage,
  config: AppConfig,
): Promise<SafeResponse> {
  const now = new Date().toISOString();
  let conv = await getConversation(message.userId, config.dynamoTable);

  if (!conv) {
    conv = newConversation(message.userId, now, config);
  }

  const { intent, slots } = await extractIntent(
    message.text,
    conv.history,
    config,
  );
  const mergedSlots: Slots = { ...conv.context.slots, ...slots };

  let result: SafeResponse;

  if (intent === "human_handoff") {
    result = {
      status: "ok",
      intent,
      replyText:
        "I've flagged your conversation for a human agent. Someone will reach out shortly.",
      nextState: "HANDOFF",
    };
  } else if (conv.state === "APPLICATION") {
    // Mid-form: the user's raw text is the answer to the pending field.
    if (isCancelCommand(message.text)) {
      clearApplicationSlots(mergedSlots);
      result = {
        status: "ok",
        replyText: `Application cancelled. ${GREETING_TEXT}`,
        nextState: "IDLE",
      };
    } else {
      const pending = nextApplicationField(mergedSlots);
      if (pending) {
        mergedSlots[pending] = message.text.trim();
      }
      result = await handleApplication(mergedSlots, message.userId, config);
    }
  } else {
    result = await route(
      conv.state,
      intent,
      mergedSlots,
      message.userId,
      config,
    );
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
          "Please share your application reference number and I'll look it up.",
        nextState: "IDLE",
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
  const replyText = formatProductReply(products, destination);
  return {
    status: "ok",
    intent: "visa_enquiry",
    facts: {
      destination,
      currency: products[0]?.currency,
      price: products[0]?.priceUsd,
    },
    replyText,
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

function isCancelCommand(text: string): boolean {
  return /^(cancel|restart|start over|reset|quit)$/i.test(text.trim());
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
      replyText:
        "Which passport do you hold? (e.g. Nigeria, India, United Kingdom)",
      nextState: "APPLICATION",
    };
  }
  // 4. Travel date
  if (!slots.travelDate) {
    return {
      status: "ok",
      replyText: "What is your intended travel date? (e.g. 2026-10-15)",
      nextState: "APPLICATION",
    };
  }
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

  // All fields collected — submit and show summary + payment link.
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
    replyText: `${summary}\n\nComplete your payment here:\n${paymentUrl}`,
    nextState: "IDLE",
  };
}
