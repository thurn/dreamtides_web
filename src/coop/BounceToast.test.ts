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
  });

  it("describes a domain bounce as an invalid action without blaming a partner", () => {
    expect(bounceMessageForReason("invalid_action")).toBe(
      INVALID_ACTION_MESSAGE,
    );
  });

  it("gives actionable copy for other bounce causes", () => {
    expect(bounceMessageForReason("prompt_pending")).not.toBe(INVALID_ACTION_MESSAGE);
    expect(bounceMessageForReason("unknown_conflict")).not.toBe(INVALID_ACTION_MESSAGE);
    expect(bounceMessageForReason("fold_error")).not.toBe(INVALID_ACTION_MESSAGE);
    expect(bounceMessageForReason(undefined)).toBe(INVALID_ACTION_MESSAGE);
  });
});
