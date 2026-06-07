import { describe, expect, it } from "vitest";
import { planHandoff } from "./handoff";
import type { BattleMutableState } from "../types";

function makeEmptySide(): BattleMutableState["sides"]["player"] {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
    score: 0,
    visibility: {},
    deck: [],
    hand: [],
    void: [],
    banished: [],
    backRank: { B0: null, B1: null, B2: null, B3: null, B4: null },
    frontRank: { F0: null, F1: null, F2: null, F3: null },
  };
}

interface MakeHandoffStateOptions {
  activeSide?: BattleMutableState["activeSide"];
  turnNumber?: number;
  playerScore?: number;
  enemyScore?: number;
}

function makeHandoffState(opts: MakeHandoffStateOptions = {}): BattleMutableState {
  const playerSide = makeEmptySide();
  const enemySide = makeEmptySide();
  playerSide.score = opts.playerScore ?? 0;
  enemySide.score = opts.enemyScore ?? 0;
  return {
    battleId: "battle-handoff-test",
    activeSide: opts.activeSide ?? "player",
    turnNumber: opts.turnNumber ?? 1,
    phase: "day",
    result: null,
    forcedResult: null,
    nextBattleCardOrdinal: 1,
    nextStackEntryOrdinal: 1,
    stack: [],
    sides: {
      player: playerSide,
      enemy: enemySide,
    },
    cardInstances: {},
  };
}

const DEFAULT_CONFIG = {
  scoreToWin: 25,
  turnLimit: 50,
  maxEnergyCap: 10,
};

describe("planHandoff", () => {
  describe("win check — result", () => {
    it("returns 'victory' when player score reaches scoreToWin", () => {
      const state = makeHandoffState({ playerScore: 25 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.result).toBe("victory");
    });

    it("returns 'victory' when player score exceeds scoreToWin", () => {
      const state = makeHandoffState({ playerScore: 30 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.result).toBe("victory");
    });

    it("returns 'defeat' when enemy score reaches scoreToWin", () => {
      const state = makeHandoffState({ enemyScore: 25 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.result).toBe("defeat");
    });

    it("returns 'defeat' when enemy score exceeds scoreToWin", () => {
      const state = makeHandoffState({ enemyScore: 30 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.result).toBe("defeat");
    });

    it("returns 'victory' (not 'defeat') when both sides are at or above scoreToWin", () => {
      // Player checked first per spec priority
      const state = makeHandoffState({ playerScore: 25, enemyScore: 25 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.result).toBe("victory");
    });

    it("returns 'draw' when next turnNumber exceeds turnLimit", () => {
      // active=enemy at turnNumber=50: next is player at turn 51 > 50
      const state = makeHandoffState({ activeSide: "enemy", turnNumber: 50 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.result).toBe("draw");
    });

    it("returns null when scores are below threshold and turn is within limit", () => {
      const state = makeHandoffState({ activeSide: "player", turnNumber: 5 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.result).toBeNull();
    });

    it("does not draw when active=player at turnNumber=50 (next enemy turn is still 50)", () => {
      // active=player at turn 50: next is enemy at turn 50 (not 51), not over limit
      const state = makeHandoffState({ activeSide: "player", turnNumber: 50 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.result).toBeNull();
    });
  });

  describe("turn-pair logic — activeSide and turnNumber", () => {
    it("flips player → enemy and keeps turnNumber", () => {
      const state = makeHandoffState({ activeSide: "player", turnNumber: 3 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.flowEdit).toMatchObject({
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "enemy",
        turnNumber: 3,
      });
    });

    it("flips enemy → player and increments turnNumber", () => {
      const state = makeHandoffState({ activeSide: "enemy", turnNumber: 3 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.flowEdit).toMatchObject({
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "player",
        turnNumber: 4,
      });
    });

    it("flowEdit phase is always 'day'", () => {
      const state = makeHandoffState({ activeSide: "player", turnNumber: 2 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.flowEdit).toMatchObject({ kind: "SET_BATTLE_FLOW", phase: "day" });
    });
  });

  describe("flowEdit is present even when result is non-null", () => {
    it("still returns a flowEdit when game is a victory", () => {
      const state = makeHandoffState({ playerScore: 25 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.result).toBe("victory");
      expect(plan.flowEdit).toMatchObject({ kind: "SET_BATTLE_FLOW" });
    });

    it("still returns a flowEdit when game is a draw", () => {
      const state = makeHandoffState({ activeSide: "enemy", turnNumber: 50 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.result).toBe("draw");
      expect(plan.flowEdit).toMatchObject({ kind: "SET_BATTLE_FLOW" });
    });
  });

  describe("energyEdits", () => {
    it("targets the next side with the correct turn number (player → enemy)", () => {
      const state = makeHandoffState({ activeSide: "player", turnNumber: 4 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      // Next side is enemy, same turn 4
      for (const edit of plan.energyEdits) {
        expect("side" in edit && edit.side).toBe("enemy");
      }
      for (const edit of plan.energyEdits) {
        if (edit.kind === "SET_MAX_ENERGY" || edit.kind === "SET_CURRENT_ENERGY") {
          // turn 4: Math.min(4+1, 10) = 5
          expect(edit.value).toBe(5);
        }
      }
    });

    it("targets the next side with incremented turn number (enemy → player)", () => {
      const state = makeHandoffState({ activeSide: "enemy", turnNumber: 4 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      // Next side is player, turn 5
      for (const edit of plan.energyEdits) {
        expect("side" in edit && edit.side).toBe("player");
      }
      for (const edit of plan.energyEdits) {
        if (edit.kind === "SET_MAX_ENERGY" || edit.kind === "SET_CURRENT_ENERGY") {
          // turn 5: Math.min(5+1, 10) = 6
          expect(edit.value).toBe(6);
        }
      }
    });

    it("respects maxEnergyCap", () => {
      const state = makeHandoffState({ activeSide: "player", turnNumber: 9 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      // Next is enemy at turn 9: Math.min(9+1, 10) = 10 (exactly cap)
      for (const edit of plan.energyEdits) {
        if (edit.kind === "SET_MAX_ENERGY" || edit.kind === "SET_CURRENT_ENERGY") {
          expect(edit.value).toBeLessThanOrEqual(10);
        }
      }
    });
  });

  describe("drawEdits", () => {
    it("produces a DRAW_CARD for the next side on a non-first turn", () => {
      const state = makeHandoffState({ activeSide: "player", turnNumber: 2 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.drawEdits).toHaveLength(1);
      expect(plan.drawEdits[0]).toMatchObject({ kind: "DRAW_CARD", side: "enemy" });
    });

    it("produces a DRAW_CARD for player when enemy ends turn and increments", () => {
      const state = makeHandoffState({ activeSide: "enemy", turnNumber: 3 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.drawEdits).toHaveLength(1);
      expect(plan.drawEdits[0]).toMatchObject({ kind: "DRAW_CARD", side: "player" });
    });

    it("skips draw on the very first turn (nextTurnNumber === 1)", () => {
      // active=enemy at turn 0 would advance to player at turn 1,
      // but the canonical first-turn case: active=player at turn 1 advances to enemy at turn 1.
      const state = makeHandoffState({ activeSide: "player", turnNumber: 1 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      // next is enemy at turn 1 — first turn, no draw
      expect(plan.drawEdits).toHaveLength(0);
    });

    it("does draw on turn 2 (no longer first turn)", () => {
      const state = makeHandoffState({ activeSide: "enemy", turnNumber: 1 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      // next is player at turn 2 — not first turn, draw happens
      expect(plan.drawEdits).toHaveLength(1);
    });
  });
});
