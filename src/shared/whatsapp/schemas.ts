// Meta WhatsApp Cloud API payload shapes + normalization.

import { NormalizedMessage } from "../types";

export interface MetaMessage {
  id: string;
  from: string;
  type: string;
  timestamp: string;
  text?: { body: string };
}

export interface MetaChangeValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  messages?: MetaMessage[];
  statuses?: unknown[];
}

export interface MetaWebhookEntry {
  id: string;
  changes: Array<{ field: string; value: MetaChangeValue }>;
}

export interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

/** Flatten a Meta webhook payload into normalized messages (text only for now). */
export function normalizePayload(
  payload: MetaWebhookPayload,
): NormalizedMessage[] {
  const out: NormalizedMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (change.field !== "messages" || !value?.messages) continue;
      for (const msg of value.messages) {
        out.push({
          eventId: msg.id,
          userId: msg.from,
          channel: "whatsapp",
          type: (msg.type as NormalizedMessage["type"]) ?? "unknown",
          text: msg.text?.body ?? "",
          receivedAt: new Date(Number(msg.timestamp) * 1000).toISOString(),
        });
      }
    }
  }
  return out;
}
