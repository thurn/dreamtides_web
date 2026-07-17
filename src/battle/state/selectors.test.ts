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
  makeBattleTestDreamcallers,
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
        dreamcallers: makeBattleTestDreamcallers(),
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
        dreamcallers: makeBattleTestDreamcallers(),
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
        dreamcallers: makeBattleTestDreamcallers(),
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
        dreamcallers: makeBattleTestDreamcallers(),
      }),
    );
  }

  it("starts at the 2 front / 3 back minimum on an empty board", () => {
    expect(selectPlayAreaSize(emptyBattleState())).toEqual({ frontSize: 2, backSize: 3 });
  });

  it("expands one front + one back slot each time the front rank fills", () => {
    const state = emptyBattleState();
    // Filling the 2-slot front rank expands it to 3 front / 4 back.
    state.sides.player.frontRank.F0 = "c0";
    state.sides.player.frontRank.F1 = "c1";
    expect(selectPlayAreaSize(state)).toEqual({ frontSize: 3, backSize: 4 });
    // Filling the new front slot expands again to 4 front / 5 back.
    state.sides.player.frontRank.F2 = "c2";
    expect(selectPlayAreaSize(state)).toEqual({ frontSize: 4, backSize: 5 });
  });

  it("expands when the back rank fills (the back rank is one wider than the front)", () => {
    const state = emptyBattleState();
    state.sides.player.backRank.B0 = "b0";
    state.sides.player.backRank.B1 = "b1";
    state.sides.player.backRank.B2 = "b2";
    expect(selectPlayAreaSize(state)).toEqual({ frontSize: 3, backSize: 4 });
  });

  it("contracts back toward the 2 front / 3 back minimum as characters leave", () => {
    const state = emptyBattleState();
    state.sides.player.frontRank.F0 = "c0";
    state.sides.player.frontRank.F1 = "c1";
    state.sides.player.frontRank.F2 = "c2";
    expect(selectPlayAreaSize(state)).toEqual({ frontSize: 4, backSize: 5 });
    state.sides.player.frontRank.F2 = null;
    state.sides.player.frontRank.F1 = null;
    expect(selectPlayAreaSize(state)).toEqual({ frontSize: 2, backSize: 3 });
  });

  it("keeps a sparse high-index occupant within range without forcing extra width", () => {
    const state = emptyBattleState();
    // A lone occupant at the edge of the starting back rank (B2) still fits the
    // minimum 3-back layout; the front rank stays at its 2-slot minimum.
    state.sides.player.backRank.B2 = "b2";
    expect(selectPlayAreaSize(state)).toEqual({ frontSize: 2, backSize: 3 });
  });

  it("uses the wider of the two sides so paired challenge lanes are never hidden", () => {
    const state = emptyBattleState();
    state.sides.player.frontRank.F0 = "p0";
    state.sides.player.frontRank.F1 = "p1";
    state.sides.player.frontRank.F2 = "p2";
    // Enemy board is empty, but the rendered width follows the busier side.
    expect(selectPlayAreaSize(state)).toEqual({ frontSize: 4, backSize: 5 });
    expect(selectSidePlayAreaSize(state, "player")).toEqual({
      frontSize: 4,
      backSize: 5,
    });
    expect(selectSidePlayAreaSize(state, "enemy")).toEqual({
      frontSize: 2,
      backSize: 3,
    });
  });
});
