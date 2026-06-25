import { describe, expect, it } from "vitest";
import { planHandoff } from "./handoff";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../test-support";
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
    backRank: emptyBackRankSlots(),
    frontRank: emptyFrontRankSlots(),
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
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
    dreamwellDeckIndex: 0,
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
        phase: "dreamwell",
        activeSide: "enemy",
        turnNumber: 3,
      });
    });

    it("flips enemy → player and increments turnNumber", () => {
      const state = makeHandoffState({ activeSide: "enemy", turnNumber: 3 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.flowEdit).toMatchObject({
        kind: "SET_BATTLE_FLOW",
        phase: "dreamwell",
        activeSide: "player",
        turnNumber: 4,
      });
    });

    it("flowEdit phase is always 'dreamwell'", () => {
      const state = makeHandoffState({ activeSide: "player", turnNumber: 2 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.flowEdit).toMatchObject({ kind: "SET_BATTLE_FLOW", phase: "dreamwell" });
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

  describe("Dreamwell landing", () => {
    it("lands the incoming side on its Dreamwell phase, not Day", () => {
      const state = makeHandoffState({ activeSide: "player", turnNumber: 4 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.flowEdit).toMatchObject({
        kind: "SET_BATTLE_FLOW",
        phase: "dreamwell",
        activeSide: "enemy",
      });
    });

    it("does not ramp energy in the handoff (energy follows the Dreamwell reveal)", () => {
      const state = makeHandoffState({ activeSide: "player", turnNumber: 4 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      const energyEdits = [
        plan.flowEdit,
        ...plan.endingBanishEdits,
        ...plan.dawnClearEdits,
        ...plan.drawEdits,
      ].filter(
        (edit) =>
          edit.kind === "SET_MAX_ENERGY" || edit.kind === "SET_CURRENT_ENERGY",
      );
      expect(energyEdits).toHaveLength(0);
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

    it("draws for the second player (enemy) on their first turn", () => {
      // active=player at turn 1 advances to enemy at turn 1 (a player→enemy
      // handoff keeps the turnNumber). The enemy is the second player, so their
      // first turn still draws — only the first player's first turn is skipped.
      const state = makeHandoffState({ activeSide: "player", turnNumber: 1 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      expect(plan.drawEdits).toHaveLength(1);
      expect(plan.drawEdits[0]).toMatchObject({ kind: "DRAW_CARD", side: "enemy" });
    });

    it("does draw on turn 2 (no longer first turn)", () => {
      const state = makeHandoffState({ activeSide: "enemy", turnNumber: 1 });
      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      // next is player at turn 2 — not first turn, draw happens
      expect(plan.drawEdits).toHaveLength(1);
    });
  });

  describe("bookend edits — Ending banish (outgoing) and Dawn clear (incoming)", () => {
    function instanceWithStatus(
      battleCardId: string,
      status: { isExhausted?: boolean; ephemeral?: boolean; offering?: boolean },
    ): BattleMutableState["cardInstances"][string] {
      return {
        battleCardId,
        // The shape only needs `status` for these edit builders; the rest is
        // structurally satisfied via a cast so the test stays focused.
        status: {
          isExhausted: status.isExhausted ?? false,
          ephemeral: status.ephemeral ?? false,
          offering: status.offering ?? false,
        },
      } as BattleMutableState["cardInstances"][string];
    }

    it("clears exhaustion for the INCOMING side's in-play characters", () => {
      // enemy ends turn → player (incoming) is the side whose Dawn clears.
      const state = makeHandoffState({ activeSide: "enemy", turnNumber: 2 });
      state.sides.player.frontRank.F0 = "p-front";
      state.sides.player.backRank.B0 = "p-back";
      state.cardInstances = {
        "p-front": instanceWithStatus("p-front", { isExhausted: true }),
        "p-back": instanceWithStatus("p-back", { isExhausted: false }),
      };

      const plan = planHandoff({ state, ...DEFAULT_CONFIG });

      // Only the exhausted character is cleared.
      expect(plan.dawnClearEdits).toEqual([
        { kind: "SET_CARD_STATUS", battleCardId: "p-front", status: { isExhausted: false } },
      ]);
      // The outgoing side's exhaustion is untouched here.
      expect(plan.endingBanishEdits).toEqual([]);
    });

    it("banishes the OUTGOING side's ephemeral hand and offering in-play cards", () => {
      // player ends turn → player is the outgoing side whose Ending banishes.
      const state = makeHandoffState({ activeSide: "player", turnNumber: 3 });
      state.sides.player.hand = ["p-eph", "p-keep"];
      state.sides.player.frontRank.F0 = "p-off";
      state.cardInstances = {
        "p-eph": instanceWithStatus("p-eph", { ephemeral: true }),
        "p-keep": instanceWithStatus("p-keep", {}),
        "p-off": instanceWithStatus("p-off", { offering: true }),
      };

      const plan = planHandoff({ state, ...DEFAULT_CONFIG });

      const banishedIds = plan.endingBanishEdits.map((edit) =>
        edit.kind === "MOVE_CARD_TO_ZONE" ? edit.battleCardId : null,
      );
      expect(banishedIds).toContain("p-eph");
      expect(banishedIds).toContain("p-off");
      expect(banishedIds).not.toContain("p-keep");
    });
  });
});
