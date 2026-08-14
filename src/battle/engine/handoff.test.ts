import { describe, expect, it } from "vitest";
import { planHandoff } from "./handoff";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../test-support";
import type { BattleMutableState } from "../types";
import type { BattleCardId } from "../../types/identifiers";
import { asBattleId } from "../../types/identifiers";
import { asBattleCardId } from "../../types/identifiers";

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

function makeHandoffState(
  opts: MakeHandoffStateOptions = {},
): BattleMutableState {
  const playerSide = makeEmptySide();
  const enemySide = makeEmptySide();
  playerSide.score = opts.playerScore ?? 0;
  enemySide.score = opts.enemyScore ?? 0;
  return {
    battleId: asBattleId("battle-handoff-test"),
    activeSide: opts.activeSide ?? "player",
    turnNumber: opts.turnNumber ?? 1,
    phase: "day",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 1,
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
      expect(plan.flowEdit).toMatchObject({
        kind: "SET_BATTLE_FLOW",
        phase: "dreamwell",
      });
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
        ...plan.exhaustionClearEdits,
      ].filter(
        (edit) =>
          edit.kind === "SET_MAX_ENERGY" || edit.kind === "SET_CURRENT_ENERGY",
      );
      expect(energyEdits).toHaveLength(0);
    });

    it("leaves the incoming deck untouched for the post-Dreamwell draw", () => {
      const state = makeHandoffState({ activeSide: "player", turnNumber: 2 });
      state.sides.enemy.deck = [asBattleCardId("enemy-top")];

      const plan = planHandoff({ state, ...DEFAULT_CONFIG });
      const edits = [
        ...plan.endingBanishEdits,
        ...plan.exhaustionClearEdits,
        plan.flowEdit,
      ];

      expect(edits.some((edit) => edit.kind === "DRAW_CARD")).toBe(false);
      expect(state.sides.enemy.deck).toEqual(["enemy-top"]);
    });
  });

  describe("bookend edits", () => {
    function instanceWithStatus(
      battleCardId: BattleCardId,
      status: {
        isExhausted?: boolean;
        ephemeral?: boolean;
        offering?: boolean;
      },
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

    it("clears exhaustion from both sides' in-play characters", () => {
      const state = makeHandoffState({ activeSide: "enemy", turnNumber: 2 });
      state.sides.enemy.frontRank.F0 = asBattleCardId("e-front");
      state.sides.enemy.backRank.B0 = asBattleCardId("e-back");
      state.sides.player.frontRank.F0 = asBattleCardId("p-front");
      state.cardInstances = {
        [asBattleCardId("e-front")]: instanceWithStatus(
          asBattleCardId("e-front"),
          { isExhausted: true },
        ),
        [asBattleCardId("e-back")]: instanceWithStatus(
          asBattleCardId("e-back"),
          { isExhausted: false },
        ),
        [asBattleCardId("p-front")]: instanceWithStatus(
          asBattleCardId("p-front"),
          { isExhausted: true },
        ),
      };

      const plan = planHandoff({ state, ...DEFAULT_CONFIG });

      // Only the exhausted character is cleared.
      expect(plan.exhaustionClearEdits).toEqual([
        {
          kind: "SET_CARD_STATUS",
          battleCardId: asBattleCardId("p-front"),
          status: { isExhausted: false },
        },
        {
          kind: "SET_CARD_STATUS",
          battleCardId: asBattleCardId("e-front"),
          status: { isExhausted: false },
        },
      ]);
      expect(plan.endingBanishEdits).toEqual([]);
    });

    it("banishes the OUTGOING side's ephemeral hand and offering in-play cards", () => {
      // player ends turn → player is the outgoing side whose Ending banishes.
      const state = makeHandoffState({ activeSide: "player", turnNumber: 3 });
      state.sides.player.hand = [
        asBattleCardId("p-eph"),
        asBattleCardId("p-keep"),
      ];
      state.sides.player.frontRank.F0 = asBattleCardId("p-off");
      state.cardInstances = {
        [asBattleCardId("p-eph")]: instanceWithStatus(asBattleCardId("p-eph"), {
          ephemeral: true,
        }),
        [asBattleCardId("p-keep")]: instanceWithStatus(
          asBattleCardId("p-keep"),
          {},
        ),
        [asBattleCardId("p-off")]: instanceWithStatus(asBattleCardId("p-off"), {
          offering: true,
        }),
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
