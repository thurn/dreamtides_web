// Starting collection contract over a synthetic catalog: the configured
// number of distinct picks, the lowest-affinity picks cut for distinct
// Starter cards, every kept pick a bag card, and the same random stream
// producing the same collection.

import { describe, expect, it } from "vitest";
import {
  D97_STARTING_PACKAGE,
  type D97StartingPackageTuning,
} from "../../content/d97/collection";
import { makeRng } from "../../draft/pool/rng";
import {
  SYNTHETIC_STARTERS,
  syntheticD97Content,
  syntheticPoolCardIds,
} from "../../rules/d97/d97-content.fixtures";
import { testAvatarId } from "../../types/test-identities";
import { createRewardBag } from "./reward-bag";
import { chooseStartingCollection, startingEssence } from "./starting-collection";

const content = syntheticD97Content({ poolSize: 40 });

function bag() {
  const deal = content.dealRewardPool(testAvatarId("d97-roster-avatar"), 0);
  return createRewardBag({
    avatarId: testAvatarId("d97-roster-avatar"),
    dealSeed: 0,
    joinedTideIds: deal.joinedTideIds,
    dealt: deal.cards,
  });
}

function choose(seed: number, tuning: D97StartingPackageTuning = D97_STARTING_PACKAGE) {
  return chooseStartingCollection({ bag: bag(), content, tuning, random: makeRng(seed) });
}

describe("chooseStartingCollection", () => {
  it("keeps distinct bag picks and replaces the dilution count with distinct Starters", () => {
    const result = choose(5);
    const dilution =
      D97_STARTING_PACKAGE.starterBase +
      D97_STARTING_PACKAGE.starterPerDifficulty * D97_STARTING_PACKAGE.difficulty;
    const pool = new Set(syntheticPoolCardIds(40));
    expect(result.keptCardIds).toHaveLength(D97_STARTING_PACKAGE.pickCount - dilution);
    expect(result.cutCardIds).toHaveLength(dilution);
    expect(result.starterCardIds).toHaveLength(dilution);
    expect(new Set(result.keptCardIds).size).toBe(result.keptCardIds.length);
    expect(new Set(result.starterCardIds).size).toBe(dilution);
    expect(result.keptCardIds.every((id) => pool.has(id))).toBe(true);
    expect(result.cutCardIds.every((id) => pool.has(id))).toBe(true);
    expect(result.cutCardIds.some((id) => result.keptCardIds.includes(id))).toBe(false);
    expect(result.starterCardIds.every((id) => SYNTHETIC_STARTERS.includes(id))).toBe(true);
  });

  it("is deterministic in its random stream", () => {
    expect(choose(9)).toEqual(choose(9));
  });

  it("stops at the bag's distinct cards when the bag is small", () => {
    const result = choose(1, { ...D97_STARTING_PACKAGE, pickCount: 100 });
    expect(result.keptCardIds.length + result.cutCardIds.length).toBe(40);
  });

  it("computes Essence from the difficulty formula", () => {
    expect(
      startingEssence({ ...D97_STARTING_PACKAGE, difficulty: 3 }),
    ).toBe(
      (D97_STARTING_PACKAGE.essenceDifficultyBase - 3) *
        D97_STARTING_PACKAGE.essencePerStep,
    );
  });
});
