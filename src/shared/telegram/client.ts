// Telegram Bot API outbound client.

import { AppConfig } from "../config";

const TELEGRAM_API = "https://api.telegram.org";

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  config: AppConfig,
): Promise<void> {
  const { telegramBotToken } = config;
  if (!telegramBotToken) {
    // Stub — no bot token configured yet.
    console.log("[telegram:stub] would send to", chatId, ":", text);
    return;
  }

  const url = `${TELEGRAM_API}/bot${telegramBotToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!res.ok) {
    throw new Error(`Telegram send failed: ${res.status} ${await res.text()}`);
  }
}
