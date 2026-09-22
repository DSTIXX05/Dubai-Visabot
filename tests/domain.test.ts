import { describe, it, expect } from "vitest";
import {
  normalizeDestination,
  resolveVisaChoice,
} from "../src/shared/domain/catalogue";
import { formatApplicationSummary } from "../src/shared/domain/applications";
import { ProductRecord } from "../src/shared/db/dynamo";

const uaeProduct = (visaType: string, priceUsd: number): ProductRecord => ({
  pk: "PRODUCT#united arab emirates",
  sk: `TYPE#${visaType}`,
  destination: "United Arab Emirates",
  visaType,
  priceUsd,
  currency: "USD",
  requirements: ["Valid passport"],
  processingTime: "5-7 business days",
  effectiveFrom: "2026-01-01",
});

describe("normalizeDestination", () => {
  it("maps common aliases to canonical names", () => {
    expect(normalizeDestination("UAE")).toBe("United Arab Emirates");
    expect(normalizeDestination("dubai")).toBe("United Arab Emirates");
    expect(normalizeDestination("uk")).toBe("United Kingdom");
  });

  it("passes through unknown destinations", () => {
    expect(normalizeDestination("Canada")).toBe("Canada");
  });
});

describe("resolveVisaChoice", () => {
  const products = [
    uaeProduct("48-Hour Transit Visa", 30),
    uaeProduct("30-Day Tourist Visa", 95),
  ];

  it("resolves by number", () => {
    expect(resolveVisaChoice("2", products)?.visaType).toBe("30-Day Tourist Visa");
  });

  it("resolves by exact name (case-insensitive)", () => {
    expect(resolveVisaChoice("48-hour transit visa", products)?.visaType).toBe(
      "48-Hour Transit Visa",
    );
  });

  it("returns null for unrecognized input", () => {
    expect(resolveVisaChoice("not a visa", products)).toBeNull();
  });
});

describe("formatApplicationSummary", () => {
  it("renders the summary with a standard total", () => {
    const out = formatApplicationSummary({
      destination: "United Arab Emirates",
      visa: "30-Day Tourist Visa",
      passport: "Nigeria",
      travelDate: "2026-10-15",
      name: "John Doe",
      email: "john@example.com",
      totalUsd: 95,
      currency: "USD",
    });

    expect(out).toContain("Destination: United Arab Emirates");
    expect(out).toContain("Visa: 30-Day Tourist Visa");
    expect(out).toContain("Passport: Nigeria");
    expect(out).toContain("Total (standard): USD 95");
  });
});
