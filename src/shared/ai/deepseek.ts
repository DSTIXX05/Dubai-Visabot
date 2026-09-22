// DeepSeek client — structured intent/slot extraction only.

import { AppConfig } from "../config";
import { ChatMessage, Intent, Slots } from "../types";
import { buildIntentMessages } from "./prompts";

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

  const messages = buildIntentMessages(
    history
      .slice(-maxHistoryMessages)
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
  if (/status|progress|update on|where is my/.test(t))
    return { intent: "status_check", slots: {}, confidence: 1 };
  if (/eligible|eligib|assess|can i|am i able/.test(t))
    return { intent: "assessment", slots: {}, confidence: 1 };
  return { intent: "visa_enquiry", slots: {}, confidence: 1 };
}
