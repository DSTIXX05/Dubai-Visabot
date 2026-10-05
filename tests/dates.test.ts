import { describe, it, expect } from "vitest";
import { normalizeDate } from "../src/shared/domain/dates";
import {
  formatVisaOptions,
  formatVisaRequirements,
} from "../src/shared/domain/catalogue";
import { ProductRecord } from "../src/shared/db/dynamo";

describe("normalizeDate", () => {
  it("keeps ISO dates unchanged", () => {
    expect(normalizeDate("2026-10-15")).toBe("2026-10-15");
  });
  it("normalizes DD/MM/YYYY", () => {
    expect(normalizeDate("15/10/2026")).toBe("2026-10-15");
  });
  it("normalizes month names", () => {
    expect(normalizeDate("15 October 2026")).toBe("2026-10-15");
    expect(normalizeDate("October 15, 2026")).toBe("2026-10-15");
  });
  it("normalizes dates embedded in sentences and relative phrases", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(
      normalizeDate("I want to leave on the 14 of this month", now),
    ).toBe("2026-10-14");
    expect(normalizeDate("14th of next month", now)).toBe("2026-11-14");
    expect(normalizeDate("tomorrow", now)).toBe("2026-10-06");
    expect(normalizeDate("sometime next month", now)).toBe("2026-11-05");
  });
  it("returns raw for unparseable input", () => {
    expect(normalizeDate("whenever")).toBe("whenever");
  });
});

describe("visa formatting", () => {
  const product: ProductRecord = {
    pk: "PRODUCT#uae",
    sk: "TYPE#tourist",
    destination: "United Arab Emirates",
    visaType: "30-Day Tourist Visa",
    priceUsd: 95,
    currency: "USD",
    requirements: ["Valid passport", "Passport photo"],
    processingTime: "5-7 business days",
    effectiveFrom: "2026-01-01",
  };

  it("formats options without em-dashes", () => {
    const out = formatVisaOptions([product]);
    expect(out).toContain("1. 30-Day Tourist Visa - USD 95");
    expect(out).not.toContain("—");
  });

  it("formats requirements without em-dashes", () => {
    const out = formatVisaRequirements(product);
    expect(out).toContain("Requirements:");
    expect(out).toContain("- Valid passport");
    expect(out).toContain("Total (standard): USD 95");
    expect(out).not.toContain("—");
  });
});
