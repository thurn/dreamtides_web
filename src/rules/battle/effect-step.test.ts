import { describe, expect, it } from "vitest";
import type {
  BattleCardInstance,
  BattleMutableState,
} from "../../battle/types";
import {
  addGainedSparkEdits,
  discardHandEdits,
  erodeEdits,
} from "./effect-step";
import type { BattleCardId } from "../../types/identifiers";
import { asBattleCardId } from "../../types/identifiers";

// ---------------------------------------------------------------------------
// Minimal inline fixtures — only the fields the builders read.
// ---------------------------------------------------------------------------

/** Builds an instance carrying just the `sparkDelta` the builder reads. */
function makeInstance(
  battleCardId: BattleCardId,
  sparkDelta: number,
): BattleCardInstance {
  return { battleCardId, sparkDelta } as unknown as BattleCardInstance;
}

/**
 * Builds a state literal with per-side hands and a `cardInstances` map. Only
 * `sides[side].hand` and `cardInstances` are populated since those are the only
 * fields the builders under test read.
 */
function makeState(opts: {
  playerHand?: string[];
  enemyHand?: string[];
  instances?: BattleCardInstance[];
}): BattleMutableState {
  const cardInstances: Record<string, BattleCardInstance> = {};
  for (const inst of opts.instances ?? []) {
    cardInstances[inst.battleCardId] = inst;
  }
  return {
    sides: {
      player: { hand: opts.playerHand ?? [] },
      enemy: { hand: opts.enemyHand ?? [] },
    },
    cardInstances,
  } as unknown as BattleMutableState;
}

describe("erodeEdits", () => {
  it("returns a single ERODE edit with the given side and count", () => {
    expect(erodeEdits("enemy", 3)).toEqual([
      { kind: "ERODE", side: "enemy", count: 3 },
    ]);
  });

  it("carries the side through for the player", () => {
    expect(erodeEdits("player", 1)).toEqual([
      { kind: "ERODE", side: "player", count: 1 },
    ]);
  });
});

describe("addGainedSparkEdits", () => {
  it("accumulates onto the instance's current sparkDelta rather than overwriting", () => {
    const state = makeState({
      instances: [makeInstance(asBattleCardId("c1"), 2)],
    });
    expect(addGainedSparkEdits(asBattleCardId("c1"), 3, state)).toEqual([
      {
        kind: "SET_CARD_SPARK_DELTA",
        battleCardId: asBattleCardId("c1"),
        value: 5,
      },
    ]);
  });

  it("starts from a zero sparkDelta correctly", () => {
    const state = makeState({
      instances: [makeInstance(asBattleCardId("c1"), 0)],
    });
    expect(addGainedSparkEdits(asBattleCardId("c1"), 4, state)).toEqual([
      {
        kind: "SET_CARD_SPARK_DELTA",
        battleCardId: asBattleCardId("c1"),
        value: 4,
      },
    ]);
  });

  it("returns [] when the instance is absent", () => {
    const state = makeState({ instances: [] });
    expect(addGainedSparkEdits(asBattleCardId("missing"), 3, state)).toEqual(
      [],
    );
  });
});

describe("discardHandEdits", () => {
  it("emits exactly one DISCARD_CARD per hand card in hand order", () => {
    const state = makeState({ playerHand: ["h1", "h2", "h3"] });
    expect(discardHandEdits("player", state)).toEqual([
      { kind: "DISCARD_CARD", battleCardId: asBattleCardId("h1") },
      { kind: "DISCARD_CARD", battleCardId: asBattleCardId("h2") },
      { kind: "DISCARD_CARD", battleCardId: asBattleCardId("h3") },
    ]);
  });

  it("reads from the requested side's hand only", () => {
    const state = makeState({ playerHand: ["p1"], enemyHand: ["e1", "e2"] });
    expect(discardHandEdits("enemy", state)).toEqual([
      { kind: "DISCARD_CARD", battleCardId: asBattleCardId("e1") },
      { kind: "DISCARD_CARD", battleCardId: asBattleCardId("e2") },
    ]);
  });

  it("returns [] for an empty hand", () => {
    const state = makeState({ playerHand: [] });
    expect(discardHandEdits("player", state)).toEqual([]);
  });
});
