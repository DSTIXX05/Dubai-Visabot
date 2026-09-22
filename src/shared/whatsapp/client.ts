// WhatsApp Cloud API outbound client.
// Stubbed until Meta credentials are registered — logs instead of sending.

import { AppConfig } from "../config";

export interface SendMessageInput {
  to: string; // WhatsApp phone identifier
  text: string;
}

export async function sendTextMessage(
  input: SendMessageInput,
  config: AppConfig,
): Promise<{ messageId?: string }> {
  const {
    whatsappAccessToken,
    whatsappPhoneNumberId,
    whatsappApiVersion,
    whatsappBaseUrl,
  } = config;

  if (!whatsappAccessToken || !whatsappPhoneNumberId) {
    // Stub — no Meta credentials configured yet.
    console.log("[whatsapp:stub] would send to", input.to, ":", input.text);
    return {};
  }

  const url = `${whatsappBaseUrl}/${whatsappApiVersion}/${whatsappPhoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${whatsappAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: input.to,
      type: "text",
      text: { body: input.text },
    }),
  });

  if (!res.ok) {
    throw new Error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { messages?: Array<{ id: string }> };
  return { messageId: json.messages?.[0]?.id };
}
