// DynamoDB single-table data access layer.
// Keys follow the pattern documented in the architecture:
//   USER#<phone>      -> PROFILE | CONVERSATION#active | APPLICATION#<id>
//   PRODUCT#<dest>    -> TYPE#<visaType>
//   EVENT#<meta_id>   -> RECEIPT
//   JOB#<id>          -> STATUS

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { ChatMessage, ConversationContext, ConversationState } from "../types";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const pk = {
  user: (phone: string) => `USER#${phone}`,
  product: (destination: string) => `PRODUCT#${destination.toLowerCase()}`,
  event: (eventId: string) => `EVENT#${eventId}`,
  job: (jobId: string) => `JOB#${jobId}`,
};

// --- Records ----------------------------------------------------------------

export interface UserRecord {
  pk: string;
  sk: string; // 'PROFILE'
  userId: string;
  language?: string;
  consent?: boolean;
  createdAt: string;
}

export interface ConversationRecord {
  pk: string;
  sk: string; // 'CONVERSATION#active'
  userId: string;
  state: ConversationState;
  context: ConversationContext;
  history: ChatMessage[]; // rolling transcript (Option B)
  updatedAt: string;
  expiresAt: number; // TTL epoch seconds
}

export interface ProductRecord {
  pk: string;
  sk: string; // 'TYPE#<visaType>'
  destination: string;
  visaType: string;
  priceUsd: number;
  currency: string;
  requirements: string[];
  processingTime: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface ApplicationRecord {
  pk: string;
  sk: string; // 'APPLICATION#<id>'
  applicationId: string;
  userId: string;
  stage: string;
  answers: Record<string, unknown>;
  totalUsd?: number;
  currency?: string;
  paymentUrl?: string;
  assignedReviewer?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Users ------------------------------------------------------------------

export async function getUser(
  userId: string,
  table: string,
): Promise<UserRecord | null> {
  const res = await client.send(
    new GetCommand({
      TableName: table,
      Key: { pk: pk.user(userId), sk: "PROFILE" },
    }),
  );
  return (res.Item as UserRecord) ?? null;
}

export async function saveUser(user: UserRecord, table: string): Promise<void> {
  await client.send(new PutCommand({ TableName: table, Item: user }));
}

// --- Conversations ----------------------------------------------------------

export async function getConversation(
  userId: string,
  table: string,
): Promise<ConversationRecord | null> {
  const res = await client.send(
    new GetCommand({
      TableName: table,
      Key: { pk: pk.user(userId), sk: "CONVERSATION#active" },
    }),
  );
  return (res.Item as ConversationRecord) ?? null;
}

export async function saveConversation(
  conv: ConversationRecord,
  table: string,
): Promise<void> {
  await client.send(new PutCommand({ TableName: table, Item: conv }));
}

// --- Idempotency ------------------------------------------------------------

/** Returns true if the event was already seen (duplicate). Records it otherwise. */
export async function dedupeEvent(
  eventId: string,
  table: string,
): Promise<boolean> {
  try {
    await client.send(
      new PutCommand({
        TableName: table,
        Item: {
          pk: pk.event(eventId),
          sk: "RECEIPT",
          eventId,
          createdAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    return false;
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException")
      return true;
    throw err;
  }
}

// --- Products (visa catalogue) ----------------------------------------------

export async function listProductsForDestination(
  destination: string,
  table: string,
): Promise<ProductRecord[]> {
  const res = await client.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk.product(destination) },
    }),
  );
  return (res.Items as ProductRecord[]) ?? [];
}

/** Admin-only: scan the catalogue. Acceptable for a small, low-frequency table. */
export async function listProducts(table: string): Promise<ProductRecord[]> {
  const res = await client.send(
    new ScanCommand({
      TableName: table,
      FilterExpression: "begins_with(pk, :prefix)",
      ExpressionAttributeValues: { ":prefix": "PRODUCT#" },
    }),
  );
  return (res.Items as ProductRecord[]) ?? [];
}

export async function putProduct(
  product: ProductRecord,
  table: string,
): Promise<void> {
  await client.send(new PutCommand({ TableName: table, Item: product }));
}

export async function deleteProduct(
  destination: string,
  visaType: string,
  table: string,
): Promise<void> {
  await client.send(
    new DeleteCommand({
      TableName: table,
      Key: { pk: pk.product(destination), sk: `TYPE#${visaType}` },
    }),
  );
}

// --- Applications -----------------------------------------------------------

export async function createApplication(
  app: ApplicationRecord,
  table: string,
): Promise<void> {
  await client.send(new PutCommand({ TableName: table, Item: app }));
}

export async function getApplication(
  userId: string,
  applicationId: string,
  table: string,
): Promise<ApplicationRecord | null> {
  const res = await client.send(
    new GetCommand({
      TableName: table,
      Key: { pk: pk.user(userId), sk: `APPLICATION#${applicationId}` },
    }),
  );
  return (res.Item as ApplicationRecord) ?? null;
}

/** Admin-only: scan applications. Acceptable for a small, low-frequency table. */
export async function listApplications(
  table: string,
): Promise<ApplicationRecord[]> {
  const res = await client.send(
    new ScanCommand({
      TableName: table,
      FilterExpression: "begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":prefix": "APPLICATION#" },
    }),
  );
  return (res.Items as ApplicationRecord[]) ?? [];
}
