import { describe, expect, it } from "vitest";
import { isPromptGateExempt } from "./reducer";

describe("isPromptGateExempt", () => {
  it("exempts presentation and site-bootstrap events", () => {
    expect(isPromptGateExempt("SET_CARD_SOURCE_DEBUG")).toBe(true);
    expect(isPromptGateExempt("OPEN_SITE")).toBe(true);
    expect(isPromptGateExempt("ENTER_DRAFT_SITE")).toBe(true);
  });

  it("does not exempt ordinary intents", () => {
    expect(isPromptGateExempt("ADJUST_ESSENCE")).toBe(false);
    expect(isPromptGateExempt("NOT_A_REAL_TYPE")).toBe(false);
  });
});
