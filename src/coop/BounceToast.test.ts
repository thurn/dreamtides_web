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
    expect(PARTNER_CONFLICT_MESSAGE.id).toBe("coop-bounce-partner-conflict");
  });

  it("describes a domain bounce as an invalid action without blaming a partner", () => {
    expect(bounceMessageForReason("invalid_action")).toBe(
      INVALID_ACTION_MESSAGE,
    );
    expect(INVALID_ACTION_MESSAGE.id).toBe("coop-bounce-invalid-action");
  });

  it("gives actionable copy for other bounce causes", () => {
    expect(bounceMessageForReason("prompt_pending").id).toBe("coop-bounce-prompt-pending");
    expect(bounceMessageForReason("unknown_conflict").id).toBe("coop-bounce-unknown-conflict");
    expect(bounceMessageForReason("fold_error").id).toBe("coop-bounce-internal-error");
    expect(bounceMessageForReason(undefined)).toBe(INVALID_ACTION_MESSAGE);
  });
});
