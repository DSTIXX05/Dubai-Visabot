// Telegram Bot API payload shapes + normalization.

import { NormalizedMessage } from "../types";

export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: unknown;
}

/** Flatten a Telegram update into normalized messages (text only for now). */
export function normalizeTelegramUpdate(
  update: TelegramUpdate,
): NormalizedMessage[] {
  const msg = update.message ?? update.edited_message;
  if (!msg?.text || msg.text.length === 0) return [];

  return [
    {
      eventId: String(update.update_id),
      userId: String(msg.chat.id),
      channel: "telegram",
      type: "text",
      text: msg.text,
      receivedAt: new Date(msg.date * 1000).toISOString(),
    },
  ];
}
