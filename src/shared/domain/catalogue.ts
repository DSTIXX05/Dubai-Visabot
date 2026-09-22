// Verified visa catalogue lookups. Facts come from DynamoDB, never from the model.

import { AppConfig } from "../config";
import { ProductRecord, listProductsForDestination } from "../db/dynamo";

// Common destination aliases so users can type "UAE", "UK", etc.
const DESTINATION_ALIASES: Record<string, string> = {
  uae: "United Arab Emirates",
  dubai: "United Arab Emirates",
  "abu dhabi": "United Arab Emirates",
  uk: "United Kingdom",
  britain: "United Kingdom",
  usa: "United States",
  us: "United States",
};

export function normalizeDestination(raw: string): string {
  const key = raw.trim().toLowerCase();
  return DESTINATION_ALIASES[key] ?? raw.trim();
}

export async function lookupVisaInfo(
  destination: string,
  config: AppConfig,
): Promise<ProductRecord[]> {
  return listProductsForDestination(
    normalizeDestination(destination),
    config.dynamoTable,
  );
}

/** Numbered, human-readable list of visa options for a destination. */
export function formatVisaOptions(products: ProductRecord[]): string {
  return products
    .map((p, i) => `${i + 1}. ${p.visaType} — ${p.currency} ${p.priceUsd}`)
    .join("\n");
}

/** Resolve a user's raw answer (number or exact name) to a catalogue product. */
export function resolveVisaChoice(
  raw: string,
  products: ProductRecord[],
): ProductRecord | null {
  const trimmed = raw.trim();

  const num = Number(trimmed);
  if (!Number.isNaN(num) && num >= 1 && num <= products.length) {
    return products[num - 1];
  }

  return (
    products.find((p) => p.visaType.toLowerCase() === trimmed.toLowerCase()) ??
    null
  );
}

export function formatProductReply(
  products: ProductRecord[],
  destination: string,
): string {
  if (products.length === 0) {
    return `I don't have visa information for ${destination} yet. Would you like me to connect you with an agent?`;
  }
  return products
    .map((p) => {
      const req = p.requirements.join(", ");
      return `• ${p.visaType} visa: ${p.currency} ${p.priceUsd} (~${p.processingTime}). Requirements: ${req}.`;
    })
    .join("\n");
}
