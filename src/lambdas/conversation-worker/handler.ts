// Conversation worker Lambda — the brain.
// Pulls state from DynamoDB, calls DeepSeek, runs verified business logic,
// then enqueues the reply for the outbound sender.

import { SQSEvent } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { loadConfig } from "../../shared/config";
import { handleMessage } from "../../shared/conversations/engine";
import { NormalizedMessage } from "../../shared/types";

const sqs = new SQSClient({});

export async function handler(event: SQSEvent): Promise<void> {
  const config = loadConfig();

  for (const record of event.Records) {
    const message = JSON.parse(record.body) as NormalizedMessage;

    try {
      const result = await handleMessage(message, config);

      await sqs.send(
        new SendMessageCommand({
          QueueUrl: config.outboundQueueUrl,
          MessageBody: JSON.stringify({
            to: message.userId,
            text: result.replyText,
            channel: message.channel,
          }),
        }),
      );
    } catch (err) {
      // Let SQS retry via visibility timeout / DLQ. Log with correlation id.
      console.error("[worker] failed for", message.userId, err);
      throw err;
    }
  }
}
