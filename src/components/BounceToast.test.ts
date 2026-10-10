import { describe, expect, it } from "vitest";
import {
  INVALID_ACTION_MESSAGE,
  STALE_ACTION_MESSAGE,
  bounceMessageForReason,
} from "./BounceToast";

describe("bounceMessageForReason", () => {
  it("describes a domain bounce as an invalid action", () => {
    expect(bounceMessageForReason("invalid_action")).toBe(
      INVALID_ACTION_MESSAGE,
    );
    expect(bounceMessageForReason(undefined)).toBe(INVALID_ACTION_MESSAGE);
  });

  it("describes every compare-and-swap bounce as a stale action", () => {
    for (const reason of ["partner_conflict", "unknown_conflict"] as const) {
      expect(bounceMessageForReason(reason)).toBe(STALE_ACTION_MESSAGE);
    }
  });

  it("gives distinct copy for pending prompts and internal errors", () => {
    expect(bounceMessageForReason("prompt_pending")).not.toBe(INVALID_ACTION_MESSAGE);
    expect(bounceMessageForReason("fold_error")).not.toBe(INVALID_ACTION_MESSAGE);
    expect(bounceMessageForReason("fold_error")).not.toBe(STALE_ACTION_MESSAGE);
  });
});
