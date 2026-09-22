// Central domain types shared across the whole service.

export type ConversationState =
  | "IDLE"
  | "GREETING"
  | "ENQUIRY"
  | "ASSESSMENT"
  | "APPLICATION"
  | "HANDOFF";

export type Intent =
  | "greeting"
  | "help"
  | "visa_enquiry"
  | "assessment"
  | "application"
  | "status_check"
  | "human_handoff"
  | "unknown";

export interface Slots {
  destination?: string;
  nationality?: string;
  purpose?: string;
  duration?: string;
  visa?: string;
  passport?: string;
  travelDate?: string;
  name?: string;
  email?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  at: string; // ISO-8601
}

export interface ConversationContext {
  intent?: Intent;
  slots: Slots;
}

export type Channel = "whatsapp" | "telegram";

/** Normalized incoming message (after webhook parsing + dedupe). */
export interface NormalizedMessage {
  eventId: string;
  userId: string; // channel recipient id (phone for WhatsApp, chat id for Telegram)
  channel: Channel;
  type: "text" | "image" | "document" | "unknown";
  text: string;
  receivedAt: string; // ISO-8601
}

/** Safe backend response — facts come from verified data, not the model. */
export interface SafeResponse {
  status: "ok" | "error";
  intent?: Intent;
  facts?: Record<string, unknown>;
  replyText: string;
  nextState: ConversationState;
}
