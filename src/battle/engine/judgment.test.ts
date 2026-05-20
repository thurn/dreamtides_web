import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import {
  allocateBattleCardInstance,
  createInitialBattleState,
} from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import type { BattleInit, BattleMutableState } from "../types";
import { resolveJudgment } from "./judgment";
import { createEmptyTransitionData } from "./result";
import { buildJudgmentTransition } from "./turn-flow";

/**
 * Tests the production judgment pipeline by driving a start-of-turn
 * composite (which runs `buildJudgmentTransition` in advancePhase mode,
 * applying score deltas and dissolutions). This is the exact code path used
 * by `battleReducer` during END_TURN, so no dead code can drift from covered
 * behaviour (bug-017). Skips the AI main phase that `advanceAfterEndTurn`
 * layers on top so lane assertions stay focused on the judgment step.
 */
describe("challenge", () => {
  it("resolves paired deployed lanes by spark without scoring", () => {
    const { battleInit, state } = createTestBattle();
    const playerD0 = state.sides.player.hand[0];
    const playerD1 = state.sides.player.hand[1];
    const enemyD0 = state.sides.enemy.hand[0];
    const enemyD1 = state.sides.enemy.hand[1];

    deploy(state, "player", "D0", playerD0);
    deploy(state, "player", "D1", playerD1);
    deploy(state, "enemy", "D0", enemyD0);
    deploy(state, "enemy", "D1", enemyD1);

    setEffectiveSpark(state, playerD0, 6);
    setEffectiveSpark(state, enemyD0, 2);
    setEffectiveSpark(state, playerD1, 1);
    setEffectiveSpark(state, enemyD1, 5);

    const resolution = resolveJudgment(state);

    expect(resolution.lanes).toEqual([
      {
        slotId: "D0",
        playerSpark: 6,
        enemySpark: 2,
        winner: "player",
        scoreDelta: 0,
      },
      {
        slotId: "D1",
        playerSpark: 1,
        enemySpark: 5,
        winner: "enemy",
        scoreDelta: 0,
      },
      {
        slotId: "D2",
        playerSpark: 0,
        enemySpark: 0,
        winner: null,
        scoreDelta: 0,
      },
      {
        slotId: "D3",
        playerSpark: 0,
        enemySpark: 0,
        winner: null,
        scoreDelta: 0,
      },
    ]);
    expect(resolution.playerScoreDelta).toBe(0);
    expect(resolution.enemyScoreDelta).toBe(0);

    const applied = runJudgmentForSide(state, battleInit, "player");

    expect(applied.transition.judgment).toEqual(resolution);
    expect(applied.state.sides.player.score).toBe(0);
    expect(applied.state.sides.enemy.score).toBe(0);
  });

  it("leaves unblocked attackers in their slot and does not dissolve them", () => {
    const { battleInit, state } = createTestBattle();
    const playerD0 = state.sides.player.hand[0];

    deploy(state, "player", "D0", playerD0);
    setEffectiveSpark(state, playerD0, 4);

    const applied = runJudgmentForSide(state, battleInit, "player");

    expect(applied.transition.judgment?.lanes[0]).toEqual({
      slotId: "D0",
      playerSpark: 4,
      enemySpark: 0,
      winner: "player",
      scoreDelta: 4,
    });
    expect(applied.state.sides.player.deployed.D0).toBe(playerD0);
    expect(applied.state.sides.player.void).not.toContain(playerD0);
    expect(applied.state.sides.enemy.void).toHaveLength(0);
    expect(applied.state.sides.player.score).toBe(4);
  });

  it("does not score opposing-only deployed characters during the active player's Night", () => {
    const { battleInit, state } = createTestBattle();
    const enemyD0 = state.sides.enemy.hand[0];
    const enemyD1 = state.sides.enemy.hand[1];

    deploy(state, "enemy", "D0", enemyD0);
    deploy(state, "enemy", "D1", enemyD1);
    setEffectiveSpark(state, enemyD0, 2);
    setEffectiveSpark(state, enemyD1, 3);

    const applied = runJudgmentForSide(state, battleInit, "player");

    expect(applied.transition.judgment?.lanes[0]).toEqual({
      slotId: "D0",
      playerSpark: 0,
      enemySpark: 2,
      winner: null,
      scoreDelta: 0,
    });
    expect(applied.transition.judgment?.lanes[1]).toEqual({
      slotId: "D1",
      playerSpark: 0,
      enemySpark: 3,
      winner: null,
      scoreDelta: 0,
    });
    expect(applied.state.sides.player.score).toBe(0);
    expect(applied.state.sides.enemy.score).toBe(0);
    expect(applied.state.sides.enemy.deployed.D0).toBe(enemyD0);
    expect(applied.state.sides.enemy.deployed.D1).toBe(enemyD1);
  });

  it("uses stacked figment count for triumph scoring", () => {
    const { battleInit, state } = createTestBattle();
    const figmentStackId = createFigmentStack(state, "player", "D0", "Shadow", 3);

    const applied = runJudgmentForSide(state, battleInit, "player");

    expect(applied.transition.judgment?.lanes[0]).toEqual({
      slotId: "D0",
      playerSpark: 3,
      enemySpark: 0,
      winner: "player",
      scoreDelta: 3,
    });
    expect(applied.state.sides.player.deployed.D0).toBe(figmentStackId);
    expect(applied.state.sides.player.score).toBe(3);
  });

  it("dissolves the weaker paired card into its owner's void and keeps the survivor in place", () => {
    const { battleInit, state } = createTestBattle();
    const playerD1 = state.sides.player.hand[0];
    const enemyD1 = state.sides.enemy.hand[0];

    deploy(state, "player", "D1", playerD1);
    deploy(state, "enemy", "D1", enemyD1);
    setEffectiveSpark(state, playerD1, 5);
    setEffectiveSpark(state, enemyD1, 2);

    const applied = runJudgmentForSide(state, battleInit, "player");

    expect(applied.state.sides.player.deployed.D1).toBe(playerD1);
    expect(applied.state.sides.enemy.deployed.D1).toBeNull();
    expect(applied.state.sides.enemy.void).toContain(enemyD1);
    expect(applied.state.sides.player.void).not.toContain(playerD1);
  });

  it("dissolves only the needed subset from a winning figment stack in a challenge", () => {
    const { battleInit, state } = createTestBattle();
    const figmentStackId = createFigmentStack(state, "player", "D0", "Shadow", 3);
    const enemyD0 = state.sides.enemy.hand[0];

    deploy(state, "enemy", "D0", enemyD0);
    setEffectiveSpark(state, enemyD0, 2);

    const applied = runJudgmentForSide(state, battleInit, "player");

    expect(applied.state.sides.player.deployed.D0).toBe(figmentStackId);
    expect(applied.state.cardInstances[figmentStackId].figmentCount).toBe(1);
    expect(applied.state.sides.player.void).not.toContain(figmentStackId);
    expect(applied.state.sides.enemy.deployed.D0).toBeNull();
    expect(applied.state.sides.enemy.void).toContain(enemyD0);
  });

  it("dissolves the player's weaker paired card when the enemy outsparks it", () => {
    const { battleInit, state } = createTestBattle();
    const playerD2 = state.sides.player.hand[0];
    const enemyD2 = state.sides.enemy.hand[0];

    deploy(state, "player", "D2", playerD2);
    deploy(state, "enemy", "D2", enemyD2);
    setEffectiveSpark(state, playerD2, 1);
    setEffectiveSpark(state, enemyD2, 3);

    const applied = runJudgmentForSide(state, battleInit, "player");

    expect(applied.state.sides.player.deployed.D2).toBeNull();
    expect(applied.state.sides.enemy.deployed.D2).toBe(enemyD2);
    expect(applied.state.sides.player.void).toContain(playerD2);
    expect(applied.state.sides.enemy.void).not.toContain(enemyD2);
  });

  it("dissolves both paired cards on a tie and sends each to its owner's void", () => {
    const { battleInit, state } = createTestBattle();
    const playerD3 = state.sides.player.hand[0];
    const enemyD3 = state.sides.enemy.hand[0];

    deploy(state, "player", "D3", playerD3);
    deploy(state, "enemy", "D3", enemyD3);
    setEffectiveSpark(state, playerD3, 4);
    setEffectiveSpark(state, enemyD3, 4);

    const applied = runJudgmentForSide(state, battleInit, "player");

    expect(applied.transition.judgment?.lanes[3]).toEqual({
      slotId: "D3",
      playerSpark: 4,
      enemySpark: 4,
      winner: null,
      scoreDelta: 0,
    });
    expect(applied.state.sides.player.deployed.D3).toBeNull();
    expect(applied.state.sides.enemy.deployed.D3).toBeNull();
    expect(applied.state.sides.player.void).toContain(playerD3);
    expect(applied.state.sides.enemy.void).toContain(enemyD3);
    expect(applied.state.sides.player.score).toBe(0);
    expect(applied.state.sides.enemy.score).toBe(0);
  });

  it("clamps effective spark at zero for large negative sparkDelta per E-7", () => {
    const { battleInit, state } = createTestBattle();
    const playerD0 = state.sides.player.hand[0];
    const enemyD0 = state.sides.enemy.hand[0];

    deploy(state, "player", "D0", playerD0);
    deploy(state, "enemy", "D0", enemyD0);
    // Force a huge negative spark delta on the player side; Judgment should
    // still treat the effective spark as 0, not a negative number.
    state.cardInstances[playerD0].sparkDelta = -1000;
    setEffectiveSpark(state, enemyD0, 3);

    const resolution = resolveJudgment(state);

    expect(resolution.lanes[0]).toEqual({
      slotId: "D0",
      playerSpark: 0,
      enemySpark: 3,
      winner: "enemy",
      scoreDelta: 0,
    });
    expect(resolution.playerScoreDelta).toBe(0);
    expect(resolution.enemyScoreDelta).toBe(0);

    const applied = runJudgmentForSide(state, battleInit, "player");
    expect(applied.state.sides.enemy.score).toBe(0);
    expect(applied.state.sides.player.score).toBe(0);
    // The overmatched player card dissolves into its owner's void.
    expect(applied.state.sides.player.deployed.D0).toBeNull();
    expect(applied.state.sides.player.void).toContain(playerD0);
  });

  it("emits one battle_proto_judgment_lane log event per deployed lane (D-10, bug-004)", () => {
    const { battleInit, state } = createTestBattle();
    const playerD0 = state.sides.player.hand[0];
    const enemyD1 = state.sides.enemy.hand[0];

    deploy(state, "player", "D0", playerD0);
    deploy(state, "enemy", "D1", enemyD1);
    setEffectiveSpark(state, playerD0, 4);
    setEffectiveSpark(state, enemyD1, 2);

    const applied = runJudgmentForSide(state, battleInit, "player");

    const laneEvents = applied.transition.logEvents.filter(
      (entry) => entry.event === "battle_proto_judgment_lane",
    );
    expect(laneEvents).toHaveLength(4);
    const fieldsByLane = new Map(
      laneEvents.map((entry) => [entry.fields.slotId as string, entry.fields]),
    );
    expect(fieldsByLane.get("D0")).toMatchObject({
      slotId: "D0",
      playerSpark: 4,
      enemySpark: 0,
      winner: "player",
      scoreDelta: 4,
    });
    expect(fieldsByLane.get("D1")).toMatchObject({
      slotId: "D1",
      playerSpark: 0,
      enemySpark: 2,
      winner: null,
      scoreDelta: 0,
    });
    expect(fieldsByLane.get("D2")).toMatchObject({
      slotId: "D2",
      winner: null,
      scoreDelta: 0,
    });
    expect(fieldsByLane.get("D3")).toMatchObject({
      slotId: "D3",
      winner: null,
      scoreDelta: 0,
    });
  });

  it("resolves every lane independently and does not reorder surviving deployed cards", () => {
    const { battleInit, state } = createTestBattle();
    const playerD0 = state.sides.player.hand[0];
    const playerD1 = state.sides.player.hand[1];
    const playerD2 = state.sides.player.hand[2];
    const playerD3 = state.sides.player.hand[3];
    const enemyD1 = state.sides.enemy.hand[0];
    const enemyD2 = state.sides.enemy.hand[1];
    const enemyD3 = state.sides.enemy.hand[2];

    deploy(state, "player", "D0", playerD0);
    deploy(state, "player", "D1", playerD1);
    deploy(state, "player", "D2", playerD2);
    deploy(state, "player", "D3", playerD3);
    deploy(state, "enemy", "D1", enemyD1);
    deploy(state, "enemy", "D2", enemyD2);
    deploy(state, "enemy", "D3", enemyD3);

    setEffectiveSpark(state, playerD0, 2);
    setEffectiveSpark(state, playerD1, 5);
    setEffectiveSpark(state, enemyD1, 3);
    setEffectiveSpark(state, playerD2, 1);
    setEffectiveSpark(state, enemyD2, 4);
    setEffectiveSpark(state, playerD3, 3);
    setEffectiveSpark(state, enemyD3, 3);

    const applied = runJudgmentForSide(state, battleInit, "player");

    expect(applied.state.sides.player.deployed.D0).toBe(playerD0);
    expect(applied.state.sides.enemy.deployed.D0).toBeNull();
    expect(applied.state.sides.player.deployed.D1).toBe(playerD1);
    expect(applied.state.sides.enemy.deployed.D1).toBeNull();
    expect(applied.state.sides.player.deployed.D2).toBeNull();
    expect(applied.state.sides.enemy.deployed.D2).toBe(enemyD2);
    expect(applied.state.sides.player.deployed.D3).toBeNull();
    expect(applied.state.sides.enemy.deployed.D3).toBeNull();
    expect(applied.state.sides.player.void).toEqual([playerD2, playerD3]);
    expect(applied.state.sides.enemy.void).toEqual([enemyD1, enemyD3]);
  });
});

function createTestBattle() {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });

  return {
    battleInit,
    state: createInitialBattleState(battleInit),
  };
}

function deploy(
  state: BattleMutableState,
  side: "player" | "enemy",
  slotId: "D0" | "D1" | "D2" | "D3",
  battleCardId: string,
): void {
  state.sides[side].hand = state.sides[side].hand.filter((cardId) => cardId !== battleCardId);
  state.sides[side].deployed[slotId] = battleCardId;
}

function createFigmentStack(
  state: BattleMutableState,
  side: "player" | "enemy",
  slotId: "D0" | "D1" | "D2" | "D3",
  subtype: string,
  count: number,
): string {
  const battleCardId = allocateBattleCardInstance(state, {
    definition: {
      sourceDeckEntryId: null,
      cardNumber: 0,
      name: `${subtype} Figment`,
      battleCardKind: "character",
      subtype,
      energyCost: 0,
      printedEnergyCost: 0,
      printedSpark: 1,
      isFast: false,
      reclaimCost: null,
      tides: [],
      renderedText: "",
      imageNumber: 0,
      transfiguration: null,
      isBane: false,
    },
    owner: side,
    controller: side,
    isRevealedToPlayer: true,
    provenance: {
      kind: "generated-figment",
      sourceBattleCardId: null,
      chosenSpark: 1,
      chosenSubtype: subtype,
      createdAtTurnNumber: state.turnNumber,
      createdAtSide: side,
      createdAtMs: 1,
    },
  });
  state.cardInstances[battleCardId].figmentCount = count;
  state.sides[side].deployed[slotId] = battleCardId;
  return battleCardId;
}

function setEffectiveSpark(
  state: BattleMutableState,
  battleCardId: string,
  spark: number,
): void {
  state.cardInstances[battleCardId].sparkDelta =
    spark - state.cardInstances[battleCardId].definition.printedSpark;
}

function runJudgmentForSide(
  state: BattleMutableState,
  _battleInit: BattleInit,
  side: "player" | "enemy",
) {
  state.activeSide = side;
  state.phase = "challenge";
  const transition = createEmptyTransitionData();
  const judgmentResult = buildJudgmentTransition(
    state,
    transition,
    side,
    { sourceSurface: "auto-system", selectedCardId: null },
    { advancePhase: true },
  );
  transition.judgment = judgmentResult.judgment;
  transition.scoreChanges = judgmentResult.scoreChanges;
  return { state, transition };
}
