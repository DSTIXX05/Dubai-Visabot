// Application lifecycle. Creates application records in DynamoDB.

import { randomUUID } from "crypto";
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

export async function submitApplication(
  userId: string,
  answers: Slots,
  config: AppConfig,
  options: SubmitOptions = {},
): Promise<SubmitApplicationResult> {
  const applicationId = randomUUID();
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
