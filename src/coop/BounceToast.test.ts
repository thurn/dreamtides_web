import { describe, expect, it } from "vitest";
import {
  INVALID_ACTION_MESSAGE,
  PARTNER_CONFLICT_MESSAGE,
  bounceMessageForReason,
} from "./BounceToast";

describe("bounceMessageForReason", () => {
  it("names a partner only for a confirmed partner conflict", () => {
    expect(bounceMessageForReason("partner_conflict")).toBe(
      PARTNER_CONFLICT_MESSAGE,
    );
    expect(PARTNER_CONFLICT_MESSAGE).toContain("your partner");
  });

  it("describes a domain bounce as an invalid action without blaming a partner", () => {
    expect(bounceMessageForReason("invalid_action")).toBe(
      INVALID_ACTION_MESSAGE,
    );
    expect(INVALID_ACTION_MESSAGE).toBe(
      "Action not applied: it is not valid for the current game state.",
    );
    expect(INVALID_ACTION_MESSAGE).not.toContain("partner");
  });

  it("gives actionable copy for other bounce causes", () => {
    expect(bounceMessageForReason("prompt_pending")).toBe(
      "Action not applied: finish the current choice first.",
    );
    expect(bounceMessageForReason("unknown_conflict")).toBe(
      "Action not applied: the game changed before it was received. Try again.",
    );
    expect(bounceMessageForReason("fold_error")).toBe(
      "Action not applied because of an internal error. Please try again.",
    );
    expect(bounceMessageForReason(undefined)).toBe(INVALID_ACTION_MESSAGE);
  });
});
