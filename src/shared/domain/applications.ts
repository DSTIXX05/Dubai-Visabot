// Application lifecycle. Creates application records in DynamoDB.

import { randomBytes } from "crypto";
import { AppConfig } from "../config";
import { ApplicationRecord, createApplication, pk } from "../db/dynamo";
import { Slots } from "../types";

export interface SubmitApplicationResult {
  applicationId: string;
  paymentUrl: string;
}

export interface SubmitOptions {
  totalUsd?: number;
  currency?: string;
  paymentUrl?: string;
}

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Generate a short, human-friendly application reference like "VISA-7K2M9QX4". */
export function generateReference(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < bytes.length; i++) {
    code += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  }
  return `VISA-${code}`;
}

export async function submitApplication(
  userId: string,
  answers: Slots,
  config: AppConfig,
  options: SubmitOptions = {},
): Promise<SubmitApplicationResult> {
  const applicationId = generateReference();
  const now = new Date().toISOString();
  const paymentUrl =
    options.paymentUrl ?? buildPaymentUrl(applicationId, config);

  const record: ApplicationRecord = {
    pk: pk.user(userId),
    sk: `APPLICATION#${applicationId}`,
    applicationId,
    userId,
    stage: "awaiting_payment",
    answers,
    totalUsd: options.totalUsd,
    currency: options.currency,
    paymentUrl,
    createdAt: now,
    updatedAt: now,
  };

  await createApplication(record, config.dynamoTable);
  return { applicationId, paymentUrl };
}

export function buildPaymentUrl(
  applicationId: string,
  config: AppConfig,
): string {
  return `${config.paymentBaseUrl}/checkout?applicationId=${applicationId}`;
}

export interface ApplicationSummary {
  destination: string;
  visa: string;
  passport: string;
  travelDate: string;
  name: string;
  email: string;
  totalUsd: number;
  currency: string;
}

export function formatApplicationSummary(args: ApplicationSummary): string {
  return [
    "Here is your application summary:",
    "",
    `Destination: ${args.destination}`,
    `Visa: ${args.visa}`,
    `Passport: ${args.passport}`,
    `Travel date: ${args.travelDate}`,
    `Name: ${args.name}`,
    `Email: ${args.email}`,
    `Total (standard): ${args.currency} ${args.totalUsd}`,
  ].join("\n");
}

function humanStage(stage: string): string {
  switch (stage) {
    case "awaiting_payment":
      return "awaiting payment";
    case "paid":
      return "paid";
    case "under_review":
      return "under review";
    default:
      return stage;
  }
}

/** Render an application's current status for the status-check reply. */
export function formatStatusReply(app: ApplicationRecord): string {
  const answers = app.answers as Record<string, unknown>;
  const lines = [
    `Application reference: ${app.applicationId}`,
    `Status: ${humanStage(app.stage)}`,
  ];
  if (answers.destination) lines.push(`Destination: ${answers.destination}`);
  if (answers.visa) lines.push(`Visa: ${answers.visa}`);
  if (app.totalUsd != null && app.currency) {
    lines.push(`Total: ${app.currency} ${app.totalUsd}`);
  }
  if (app.createdAt) lines.push(`Submitted: ${app.createdAt.slice(0, 10)}`);
  if (app.paymentUrl) {
    lines.push("", "Complete your payment here:", app.paymentUrl);
  }
  return lines.join("\n");
}
