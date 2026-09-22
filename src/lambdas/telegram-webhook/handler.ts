// Telegram webhook Lambda — receives updates, normalizes, enqueues, returns 200 fast.

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { loadConfig } from "../../shared/config";
import {
  normalizeTelegramUpdate,
  TelegramUpdate,
} from "../../shared/telegram/schemas";
import { dedupeEvent } from "../../shared/db/dynamo";

const sqs = new SQSClient({});

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const config = loadConfig();

  const update = JSON.parse(event.body ?? "{}") as TelegramUpdate;
  const messages = normalizeTelegramUpdate(update);

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
