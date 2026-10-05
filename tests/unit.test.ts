import { describe, it, expect } from "vitest";
import {
  normalizePayload,
  MetaWebhookPayload,
} from "../src/shared/whatsapp/schemas";
import { fallbackIntent } from "../src/shared/ai/deepseek";
import {
  detectEditField,
  extractReference,
  isResetCommand,
  resolveMainMenu,
} from "../src/shared/conversations/engine";

describe("normalizePayload", () => {
  it("flattens a Meta message event into normalized messages", () => {
    const payload: MetaWebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                messages: [
                  {
                    id: "wamid.HbgL",
                    from: "2348012345678",
                    type: "text",
                    timestamp: "1726750000",
                    text: { body: "I want to visit Australia" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = normalizePayload(payload);
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("2348012345678");
    expect(result[0].text).toBe("I want to visit Australia");
    expect(result[0].type).toBe("text");
  });

  it("ignores non-message fields (e.g. status updates)", () => {
    const payload: MetaWebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [{ field: "statuses", value: { statuses: [] } }],
        },
      ],
    };
    expect(normalizePayload(payload)).toHaveLength(0);
  });
});

describe("fallbackIntent", () => {
  it("classifies greetings", () => {
    expect(fallbackIntent("hi there").intent).toBe("greeting");
  });
  it("classifies handoff requests", () => {
    expect(fallbackIntent("I want to talk to a human").intent).toBe(
      "human_handoff",
    );
  });
  it("defaults to visa enquiry", () => {
    expect(fallbackIntent("what visa do I need for Canada").intent).toBe(
      "visa_enquiry",
    );
  });
});

describe("isResetCommand", () => {
  it("matches /start and /restart (with optional botname)", () => {
    expect(isResetCommand("/start")).toBe(true);
    expect(isResetCommand("/restart")).toBe(true);
    expect(isResetCommand("/start@MyVisaBot")).toBe(true);
    expect(isResetCommand("/restart@MyVisaBot")).toBe(true);
  });

  it("ignores other messages", () => {
    expect(isResetCommand("start")).toBe(false);
    expect(isResetCommand("I want a visa")).toBe(false);
    expect(isResetCommand("/help")).toBe(false);
  });
});

describe("detectEditField", () => {
  it("detects editable fields from confirmation replies", () => {
    expect(detectEditField("change passport")).toBe("passport");
    expect(detectEditField("the travel date is wrong")).toBe("travelDate");
    expect(detectEditField("my name")).toBe("name");
    expect(detectEditField("email please")).toBe("email");
  });

  it("does not confuse 'date' with 'update'", () => {
    expect(detectEditField("I want to update my name")).toBe("name");
  });

  it("returns null for non-edit answers", () => {
    expect(detectEditField("yes")).toBeNull();
    expect(detectEditField("no idea")).toBeNull();
  });
});

describe("extractReference", () => {
  it("extracts a reference from a message", () => {
    expect(extractReference("VISA-7K2M9QX4")).toBe("VISA-7K2M9QX4");
    expect(extractReference("status of visa-7k2m9qx4 please")).toBe(
      "VISA-7K2M9QX4",
    );
    expect(extractReference("7K2M9QX4")).toBe("VISA-7K2M9QX4");
  });

  it("returns null when no reference is present", () => {
    expect(extractReference("hello")).toBeNull();
    expect(extractReference("")).toBeNull();
  });
});

describe("resolveMainMenu", () => {
  it("maps numbers to intents", () => {
    expect(resolveMainMenu("1")).toBe("visa_enquiry");
    expect(resolveMainMenu("2")).toBe("assessment");
    expect(resolveMainMenu("3")).toBe("application");
    expect(resolveMainMenu("4")).toBe("status_check");
  });

  it("accepts option markers and punctuation", () => {
    expect(resolveMainMenu("option 2")).toBe("assessment");
    expect(resolveMainMenu("3)")).toBe("application");
  });

  it("returns null for out-of-range or non-numeric input", () => {
    expect(resolveMainMenu("5")).toBeNull();
    expect(resolveMainMenu("hello")).toBeNull();
  });
});
