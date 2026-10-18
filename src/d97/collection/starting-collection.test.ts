// Starting collection contract over a synthetic catalog: the configured
// number of distinct picks, the lowest-affinity picks cut for distinct
// Starter cards, every pick a ring-1 card (never a ring-2 one), and the same
// random stream producing the same collection.

import { describe, expect, it } from "vitest";
import {
  D97_STARTING_PACKAGE,
  type D97StartingPackageTuning,
} from "../../content/d97/collection";
import { makeRng } from "../../draft/pool/rng";
import {
  SYNTHETIC_STARTERS,
  syntheticD97Content,
  syntheticFacetCardIds,
  syntheticPoolCardIds,
} from "../../rules/d97/d97-content.fixtures";
import { testAvatarId } from "../../types/test-identities";
import { chooseStartingCollection, startingEssence } from "./starting-collection";

const content = syntheticD97Content({ poolSize: 40, facetSize: 20 });
const pool = content.rewardPool(testAvatarId("d97-roster-avatar"))!;

function choose(seed: number, tuning: D97StartingPackageTuning = D97_STARTING_PACKAGE) {
  return chooseStartingCollection({ pool, content, tuning, random: makeRng(seed) });
}

describe("chooseStartingCollection", () => {
  it("keeps distinct ring-1 picks and replaces the dilution count with distinct Starters", () => {
    const result = choose(5);
    const dilution =
      D97_STARTING_PACKAGE.starterBase +
      D97_STARTING_PACKAGE.starterPerDifficulty * D97_STARTING_PACKAGE.difficulty;
    const ring1 = new Set(syntheticPoolCardIds(40));
    const ring2 = new Set(syntheticFacetCardIds(20));
    expect(result.keptCardIds).toHaveLength(D97_STARTING_PACKAGE.pickCount - dilution);
    expect(result.cutCardIds).toHaveLength(dilution);
    expect(result.starterCardIds).toHaveLength(dilution);
    expect(new Set(result.keptCardIds).size).toBe(result.keptCardIds.length);
    expect(new Set(result.starterCardIds).size).toBe(dilution);
    expect(result.keptCardIds.every((id) => ring1.has(id))).toBe(true);
    expect(result.cutCardIds.every((id) => ring1.has(id))).toBe(true);
    expect([...result.keptCardIds, ...result.cutCardIds].some((id) => ring2.has(id))).toBe(false);
    expect(result.cutCardIds.some((id) => result.keptCardIds.includes(id))).toBe(false);
    expect(result.starterCardIds.every((id) => SYNTHETIC_STARTERS.includes(id))).toBe(true);
  });

  it("is deterministic in its random stream", () => {
    expect(choose(9)).toEqual(choose(9));
  });

  it("stops at ring 1's cards when ring 1 is small", () => {
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
