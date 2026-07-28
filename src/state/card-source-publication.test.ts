import { describe, expect, it } from "vitest";
import type { CardSourceDebugState } from "../types/journey";
import { updateCardSourcePublication } from "./card-source-publication";

function debugState(label: string): CardSourceDebugState {
  return { screenLabel: label, surface: "Draft", entries: [] };
}

describe("updateCardSourcePublication", () => {
  it("does not let an old screen cleanup clear the current screen publication", () => {
    const first = updateCardSourcePublication(null, debugState("Draft A"), "screen-a");
    const replacement = updateCardSourcePublication(
      first,
      debugState("Draft B"),
      "screen-b",
    );

    expect(updateCardSourcePublication(replacement, null, "screen-a")).toBe(
      replacement,
    );
    expect(updateCardSourcePublication(replacement, null, "screen-b")).toBeNull();
  });

  it("does not let an ownerless legacy cleanup clear an owned publication", () => {
    const owned = updateCardSourcePublication(
      null,
      debugState("Draft"),
      "draft-screen",
    );

    expect(updateCardSourcePublication(owned, null)).toBe(owned);
    const ownerless = updateCardSourcePublication(null, debugState("Merchant"));
    expect(updateCardSourcePublication(ownerless, null)).toBeNull();
  });
});
