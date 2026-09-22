import { describe, it, expect } from "vitest";
import {
  normalizeTelegramUpdate,
  TelegramUpdate,
} from "../src/shared/telegram/schemas";

describe("normalizeTelegramUpdate", () => {
  it("flattens a text message update", () => {
    const update: TelegramUpdate = {
      update_id: 12345,
      message: {
        message_id: 99,
        chat: { id: 555, type: "private" },
        date: 1726750000,
        text: "I want a visa for UAE",
      },
    };

    const result = normalizeTelegramUpdate(update);
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("555");
    expect(result[0].channel).toBe("telegram");
    expect(result[0].text).toBe("I want a visa for UAE");
    expect(result[0].eventId).toBe("12345");
  });

  it("ignores non-text updates (e.g. photos)", () => {
    const update: TelegramUpdate = {
      update_id: 678,
      message: {
        message_id: 100,
        chat: { id: 555, type: "private" },
        date: 1726750000,
      },
    };

    expect(normalizeTelegramUpdate(update)).toHaveLength(0);
  });
});
