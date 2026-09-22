// Webhook Lambda — fast acknowledge.
// Verifies Meta, dedupes by event id, enqueues normalized messages, returns 200 quickly.

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { loadConfig } from "../../shared/config";
import {
  normalizePayload,
  MetaWebhookPayload,
} from "../../shared/whatsapp/schemas";
import { dedupeEvent } from "../../shared/db/dynamo";

const sqs = new SQSClient({});

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const config = loadConfig();

  // GET /webhook — Meta verification handshake.
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters ?? {};
    const mode = params["hub.mode"];
    const token = params["hub.verify_token"];
    const challenge = params["hub.challenge"];
    if (mode === "subscribe" && token === config.whatsappVerifyToken) {
      return { statusCode: 200, body: challenge ?? "" };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  // POST /webhook — message event.
  const payload = JSON.parse(event.body ?? "{}") as MetaWebhookPayload;
  const messages = normalizePayload(payload);

  for (const msg of messages) {
    const seen = await dedupeEvent(msg.eventId, config.dynamoTable);
    if (seen) continue;

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: config.inboundQueueUrl,
        MessageBody: JSON.stringify(msg),
      }),
    );
  }

  return { statusCode: 200, body: "OK" };
}
