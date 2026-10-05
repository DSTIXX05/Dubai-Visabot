// DeepSeek client — structured intent/slot extraction only.

import { AppConfig } from "../config";
import { ChatMessage, Intent, Slots } from "../types";
import { buildIntentMessages } from "./prompts";

export const DATE_NORMALIZE_PROMPT = `Convert the user's travel date to ISO format YYYY-MM-DD.
Use "today's date" to resolve relative expressions such as "this month", "next week", "tomorrow", "14th", or "the 14 of this month".
If the year is missing, choose the next upcoming occurrence.
Respond with valid JSON only, in this exact shape:
{"date":"YYYY-MM-DD"}`;

export const PASSPORT_NORMALIZE_PROMPT = `Extract the country/nationality from the user's passport answer.
Return just the country name (e.g. "Nigeria", "United Kingdom"). Ignore filler words like "I hold", "passport", or "citizen".
Respond with valid JSON only, in this exact shape:
{"country":"Nigeria"}`;

export interface IntentResult {
  intent: Intent;
  slots: Slots;
  confidence: number;
}

export async function extractIntent(
  message: string,
  history: ChatMessage[],
  config: AppConfig,
): Promise<IntentResult> {
  const { deepseekApiKey, deepseekBaseUrl, deepseekModel, maxHistoryMessages } =
    config;

  if (!deepseekApiKey) {
    // Stub — no API key configured yet. Use a deterministic fallback.
    return fallbackIntent(message);
  }

  // maxHistoryMessages = number of recent *user* turns to keep. Multiply by 2
  // so each turn carries its assistant reply — the model needs both to
  // understand short answers like "6" or "the first one".
  const messages = buildIntentMessages(
    history
      .slice(-(maxHistoryMessages * 2))
      .map((m) => ({ role: m.role, text: m.text })),
    message,
  );

  const res = await fetch(`${deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deepseekApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: deepseekModel,
      messages,
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek error: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawContent = json.choices?.[0]?.message?.content ?? "";

  const parsed = extractJson(rawContent);
  if (!parsed) {
    console.warn(
      "[deepseek] could not parse content, falling back to keyword intent:",
      rawContent.slice(0, 200),
    );
    return fallbackIntent(message);
  }

  const p = parsed as Partial<IntentResult>;
  return {
    intent: (p.intent as Intent) ?? "unknown",
    slots: (p.slots as Slots) ?? {},
    confidence: typeof p.confidence === "number" ? p.confidence : 0,
  };
}

/** Safely extract a JSON object from a model response (handles empty, fenced, or wrapped output). */
function extractJson(content: string): unknown | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const obj = candidate.match(/\{[\s\S]*\}/);
    if (obj) {
      try {
        return JSON.parse(obj[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Deterministic keyword fallback used when no DeepSeek key is configured. */
export function fallbackIntent(message: string): IntentResult {
  const t = message.toLowerCase();
  if (/hi\b|hello|hey|help|start|begin/.test(t))
    return { intent: "greeting", slots: {}, confidence: 1 };
  if (/human|agent|person|talk to|representative/.test(t))
    return { intent: "human_handoff", slots: {}, confidence: 1 };
  if (/apply|application|start application/.test(t))
    return { intent: "application", slots: {}, confidence: 1 };
  if (/status|progress|update on|where is my|track/.test(t))
    return { intent: "status_check", slots: {}, confidence: 1 };
  if (/eligible|eligib|assess|can i|am i able/.test(t))
    return { intent: "assessment", slots: {}, confidence: 1 };
  return { intent: "visa_enquiry", slots: {}, confidence: 1 };
}

/**
 * Ask DeepSeek to normalize a free-form travel date to ISO (YYYY-MM-DD).
 * Returns null when no key is configured or the model can't produce a valid date,
 * so callers can fall back to the rule-based normalizer.
 */
export async function normalizeDateWithLlm(
  raw: string,
  config: AppConfig,
): Promise<string | null> {
  if (!config.deepseekApiKey) return null;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.deepseekApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.deepseekModel,
        messages: [
          { role: "system", content: DATE_NORMALIZE_PROMPT },
          {
            role: "user",
            content: `Today's date: ${today}\nUser's travel date: "${raw}"`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });

    if (!res.ok) return null;

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content) as { date?: string } | null;
    const date = parsed?.date?.trim();
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  } catch {
    return null;
  }
}

/**
 * Ask DeepSeek to extract a country from a free-form passport answer.
 * Returns null when no key is configured or the model can't produce a value.
 */
export async function normalizePassportWithLlm(
  raw: string,
  config: AppConfig,
): Promise<string | null> {
  if (!config.deepseekApiKey) return null;

  try {
    const res = await fetch(`${config.deepseekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.deepseekApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.deepseekModel,
        messages: [
          { role: "system", content: PASSPORT_NORMALIZE_PROMPT },
          { role: "user", content: `Passport answer: "${raw}"` },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });

    if (!res.ok) return null;

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content) as { country?: string } | null;
    const country = parsed?.country?.trim();
    return country ? country : null;
  } catch {
    return null;
  }
}
