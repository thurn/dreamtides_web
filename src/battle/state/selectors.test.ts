import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "./create-initial-state";
import {
  selectEffectiveSpark,
  selectEffectiveSparkOrZero,
  selectFailureOverlayResult,
  selectPlayAreaSize,
  selectSidePlayAreaSize,
} from "./selectors";
import type { BattleMutableState } from "../types";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamAvatars,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";

describe("selectEffectiveSpark", () => {
  it("clamps negative printedSpark + sparkDelta to zero per spec E-5", () => {
    const state = createInitialBattleState(
      createBattleInit({
        battleEntryKey: "site-7::2::dreamscape-2",
        site: makeBattleTestSite(),
        state: makeBattleTestState(),
        cardDatabase: makeBattleTestCardDatabase(),
        dreamAvatars: makeBattleTestDreamAvatars(),
      }),
    );
    const battleCardId = state.sides.player.hand[0];
    const instance = state.cardInstances[battleCardId];
    const printedSpark = instance.definition.printedSpark;

    expect(selectEffectiveSpark(state, battleCardId)).toBe(printedSpark);

    instance.sparkDelta = -printedSpark - 5;
    expect(selectEffectiveSpark(state, battleCardId)).toBe(0);

    instance.sparkDelta = -printedSpark;
    expect(selectEffectiveSpark(state, battleCardId)).toBe(0);

    instance.sparkDelta = 3;
    expect(selectEffectiveSpark(state, battleCardId)).toBe(printedSpark + 3);
  });

  it("returns null for missing or null battleCardId (bug-041)", () => {
    const state = createInitialBattleState(
      createBattleInit({
        battleEntryKey: "site-7::2::dreamscape-2",
        site: makeBattleTestSite(),
        state: makeBattleTestState(),
        cardDatabase: makeBattleTestCardDatabase(),
        dreamAvatars: makeBattleTestDreamAvatars(),
      }),
    );
    expect(selectEffectiveSpark(state, null)).toBeNull();
    expect(selectEffectiveSpark(state, "bc_missing")).toBeNull();
  });
});

describe("selectEffectiveSparkOrZero", () => {
  it("coalesces a missing card to zero for display callers", () => {
    const state = createInitialBattleState(
      createBattleInit({
        battleEntryKey: "site-7::2::dreamscape-2",
        site: makeBattleTestSite(),
        state: makeBattleTestState(),
        cardDatabase: makeBattleTestCardDatabase(),
        dreamAvatars: makeBattleTestDreamAvatars(),
      }),
    );
    expect(selectEffectiveSparkOrZero(state, null)).toBe(0);
    expect(selectEffectiveSparkOrZero(state, "bc_missing")).toBe(0);
    expect(
      selectEffectiveSparkOrZero(state, state.sides.player.hand[0]),
    ).toBe(state.cardInstances[state.sides.player.hand[0]].definition.printedSpark);
  });
});

describe("selectFailureOverlayResult", () => {
  it("returns defeat and draw unchanged as failure overlay results", () => {
    expect(selectFailureOverlayResult("defeat")).toBe("defeat");
    expect(selectFailureOverlayResult("draw")).toBe("draw");
  });

  it("returns null for the non-failure results so the overlay stays hidden", () => {
    expect(selectFailureOverlayResult(null)).toBeNull();
    expect(selectFailureOverlayResult("victory")).toBeNull();
  });
});

describe("selectPlayAreaSize", () => {
  function emptyBattleState(): BattleMutableState {
    return createInitialBattleState(
      createBattleInit({
        battleEntryKey: "site-7::2::dreamscape-2",
        site: makeBattleTestSite(),
        state: makeBattleTestState(),
        cardDatabase: makeBattleTestCardDatabase(),
        dreamAvatars: makeBattleTestDreamAvatars(),
      }),
    );
  }

  it("keeps the rules-level 10/9 formation stable as battlefield occupancy changes", () => {
    const state = emptyBattleState();
    state.sides.player.frontRank.F0 = "p0";
    state.sides.player.frontRank.F1 = "p1";
    state.sides.enemy.backRank.B8 = "e8";
    expect(selectPlayAreaSize(state)).toEqual({ frontSize: 9, backSize: 10 });
    expect(selectSidePlayAreaSize(state, "player")).toEqual({
      frontSize: 9,
      backSize: 10,
    });
    expect(selectSidePlayAreaSize(state, "enemy")).toEqual({
      frontSize: 9,
      backSize: 10,
    });
  });
});
