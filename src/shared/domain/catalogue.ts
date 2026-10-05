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
    .map((p, i) => `${i + 1}. ${p.visaType} - ${p.currency} ${p.priceUsd}`)
    .join("\n");
}

/** Detailed requirements block shown once the user picks a specific visa. */
export function formatVisaRequirements(product: ProductRecord): string {
  const reqs = product.requirements.map((r) => `- ${r}`).join("\n");
  return [
    product.visaType,
    "",
    "Requirements:",
    reqs,
    "",
    `Total (standard): ${product.currency} ${product.priceUsd}`,
  ].join("\n");
}

/** Resolve a user's raw answer (number or name, with optional pasted formatting) to a catalogue product. */
export function resolveVisaChoice(
  raw: string,
  products: ProductRecord[],
): ProductRecord | null {
  const input = raw.trim();
  if (!input) return null;

  // 1. Plain number selection: "6", "6.", "6)", "option 6", "#6"
  const numberOnly = input.match(/^(?:option\s*)?#?\s*(\d+)\s*[.)\-:]?\s*$/i);
  if (numberOnly) {
    const num = Number(numberOnly[1]);
    if (num >= 1 && num <= products.length) return products[num - 1];
  }

  // 2. Numbered pasted line: "6. 5-Year Multiple-Entry Tourist Visa - USD 650"
  const numberedLine = input.match(
    /^(?:option\s*)?#?\s*(\d+)\s*[.)\-:]\s+(.+)$/i,
  );
  if (numberedLine) {
    const num = Number(numberedLine[1]);
    if (num >= 1 && num <= products.length) return products[num - 1];
  }

  // 3. Exact name, optionally with a trailing price suffix.
  const nameOnly = input
    .replace(/[-–—]\s*(?:USD|EUR|GBP|AED)\s*\d+(?:\.\d+)?\s*$/i, "")
    .trim();
  const exact = products.find(
    (p) => p.visaType.toLowerCase() === nameOnly.toLowerCase(),
  );
  if (exact) return exact;

  // 4. Name contained in the pasted text (covers stray prefixes/suffixes).
  const byName = products.find((p) =>
    input.toLowerCase().includes(p.visaType.toLowerCase()),
  );
  if (byName) return byName;

  return null;
}

export function formatProductReply(
  products: ProductRecord[],
  destination: string,
): string {
  if (products.length === 0) {
    return `I don't have visa information for ${destination} yet. Would you like me to connect you with an agent?`;
  }
  return formatVisaOptions(products);
}
