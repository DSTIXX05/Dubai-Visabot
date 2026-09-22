// Outbound sender Lambda — sends replies via the configured channel (WhatsApp or Telegram).
// Isolated so retries and delivery-status handling stay out of conversation logic.

import { SQSEvent } from "aws-lambda";
import { loadConfig } from "../../shared/config";
import { sendTextMessage } from "../../shared/whatsapp/client";
import { sendTelegramMessage } from "../../shared/telegram/client";
import { Channel } from "../../shared/types";

export async function handler(event: SQSEvent): Promise<void> {
  const config = loadConfig();

  for (const record of event.Records) {
    const { to, text, channel } = JSON.parse(record.body) as {
      to: string;
      text: string;
      channel?: Channel;
    };

    try {
      if (channel === "telegram") {
        await sendTelegramMessage(to, text, config);
      } else {
        await sendTextMessage({ to, text }, config);
      }
    } catch (err) {
      console.error("[outbound] failed to send to", to, err);
      throw err; // SQS retries → DLQ
    }
  }
}
