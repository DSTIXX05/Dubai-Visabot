import { describe, it, expect } from "vitest";
import {
  normalizePayload,
  MetaWebhookPayload,
} from "../src/shared/whatsapp/schemas";
import { fallbackIntent } from "../src/shared/ai/deepseek";

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
