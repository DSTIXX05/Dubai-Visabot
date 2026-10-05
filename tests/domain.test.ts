import { describe, it, expect } from "vitest";
import {
  normalizeDestination,
  resolveVisaChoice,
} from "../src/shared/domain/catalogue";
import { normalizePassport } from "../src/shared/domain/passport";
import {
  formatApplicationSummary,
  formatStatusReply,
  generateReference,
} from "../src/shared/domain/applications";
import { ProductRecord, ApplicationRecord } from "../src/shared/db/dynamo";

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

  it("resolves plain numbers, including trailing punctuation", () => {
    expect(resolveVisaChoice("1.", products)?.visaType).toBe(
      "48-Hour Transit Visa",
    );
    expect(resolveVisaChoice("2)", products)?.visaType).toBe(
      "30-Day Tourist Visa",
    );
    expect(resolveVisaChoice("option 2", products)?.visaType).toBe(
      "30-Day Tourist Visa",
    );
  });

  it("resolves a fully pasted numbered line by its number", () => {
    expect(
      resolveVisaChoice(
        "2. 30-Day Tourist Visa - USD 95",
        products,
      )?.visaType,
    ).toBe("30-Day Tourist Visa");
  });

  it("resolves a pasted name with a trailing price suffix", () => {
    expect(
      resolveVisaChoice("30-Day Tourist Visa - USD 95", products)?.visaType,
    ).toBe("30-Day Tourist Visa");
  });

  it("returns null for out-of-range numbers", () => {
    expect(resolveVisaChoice("99", products)).toBeNull();
  });
});

describe("normalizePassport", () => {
  it("extracts a country from full sentences", () => {
    expect(normalizePassport("I hold the Nigerian passport.")).toBe("Nigeria");
    expect(normalizePassport("I'm a British citizen")).toBe("United Kingdom");
    expect(normalizePassport("USA")).toBe("United States");
  });

  it("keeps the raw value when the country is unknown", () => {
    expect(normalizePassport("something unknown")).toBe("something unknown");
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

describe("generateReference", () => {
  it("produces a VISA- prefixed code", () => {
    expect(generateReference()).toMatch(/^VISA-[A-Z0-9]{8}$/);
  });
});

describe("formatStatusReply", () => {
  it("renders reference, stage and payment link", () => {
    const app: ApplicationRecord = {
      pk: "USER#1",
      sk: "APPLICATION#VISA-7K2M9QX4",
      applicationId: "VISA-7K2M9QX4",
      userId: "1",
      stage: "awaiting_payment",
      answers: {
        destination: "United Arab Emirates",
        visa: "5-Year Multiple-Entry Tourist Visa",
      },
      totalUsd: 650,
      currency: "USD",
      paymentUrl: "https://pay.example.com/checkout?applicationId=VISA-7K2M9QX4",
      createdAt: "2026-10-05T12:00:00.000Z",
      updatedAt: "2026-10-05T12:00:00.000Z",
    };

    const out = formatStatusReply(app);
    expect(out).toContain("Application reference: VISA-7K2M9QX4");
    expect(out).toContain("Status: awaiting payment");
    expect(out).toContain("Visa: 5-Year Multiple-Entry Tourist Visa");
    expect(out).toContain("Total: USD 650");
    expect(out).toContain("Complete your payment here:");
  });
});
