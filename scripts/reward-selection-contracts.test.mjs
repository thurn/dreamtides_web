import { describe, expect, it } from "vitest";
import {
  isRewardCardPredicate,
  isRewardMechanicId,
  mechanicSupportsPolicy,
  REWARD_MECHANIC_IDS,
} from "./reward-selection-contracts.mjs";

describe("reward selection contracts", () => {
  it("registers deterministic shop purchase modifiers without a selection policy", () => {
    expect(isRewardMechanicId("shop-purchase-modifier")).toBe(true);
    expect(REWARD_MECHANIC_IDS).toContain("shop-purchase-modifier");
    expect(mechanicSupportsPolicy("shop-purchase-modifier", "fixed")).toBe(false);
    expect(mechanicSupportsPolicy("shop-purchase-modifier", "uniform")).toBe(false);
  });

  it("supports fixed and random site insertion without widening site tuning", () => {
    expect(mechanicSupportsPolicy("add-site", "fixed")).toBe(true);
    expect(mechanicSupportsPolicy("add-site", "site-uniform")).toBe(true);
    expect(mechanicSupportsPolicy("add-site", "uniform")).toBe(false);
    expect(mechanicSupportsPolicy("add-site", "card-fit")).toBe(false);
  });

  it("registers compatible selection policies for card-type changes", () => {
    expect(isRewardMechanicId("change-entry-card-type")).toBe(true);
    expect(REWARD_MECHANIC_IDS).toContain("change-entry-card-type");
    expect(mechanicSupportsPolicy("change-entry-card-type", "uniform")).toBe(true);
    expect(mechanicSupportsPolicy("change-entry-card-type", "fixed")).toBe(false);
    expect(
      mechanicSupportsPolicy("change-entry-card-type", "deck-entry-centrality"),
    ).toBe(true);
  });

  it("registers Legendary as an exact reward-card predicate", () => {
    expect(isRewardCardPredicate("legendary")).toBe(true);
    expect(isRewardCardPredicate("Legendary")).toBe(false);
  });
});
