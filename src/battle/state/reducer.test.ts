import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../../logging";
import { applyBattleCommand } from "../debug/apply-command";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "./create-initial-state";
import {
  battleReducer,
  createBattleReducerState,
  emitBattleTransitionLogEvents,
} from "./reducer";
import {
  redoBattleHistory,
  undoBattleHistory,
} from "./history";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { runAiTurn } from "../ai/run-ai-turn";
import {
  advanceAfterEndTurn,
  runStartOfTurnComposite,
} from "../engine/turn-flow";

beforeEach(() => {
  resetLog();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("battleReducer", () => {
  it("advances from Day through the AI's full turn as one composite history entry", () => {
    const { battleInit, state } = createTestBattle();

    state.sides.enemy.currentEnergy = 0;
    state.sides.enemy.maxEnergy = 0;

    const reduced = battleReducer(
      createBattleReducerState(state),
      { type: "END_TURN" },
      battleInit,
    );

    expect(reduced.mutable.activeSide).toBe("player");
    expect(reduced.mutable.phase).toBe("day");
    expect(reduced.mutable.turnNumber).toBe(2);
    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.lastTransition?.metadata).toMatchObject({
      commandId: "END_TURN",
      label: "End Turn",
      kind: "battle-flow",
      isComposite: true,
      actor: "player",
      sourceSurface: "action-bar",
      undoPayload: null,
    });
    expect(reduced.lastTransition?.metadata.targets).toEqual([]);
    expect(typeof reduced.lastTransition?.metadata.timestamp).toBe("number");
    const stepsWithoutPlayerStartOfTurn = reduced.lastTransition?.steps.slice(0, 5) ?? [];
    expect(stepsWithoutPlayerStartOfTurn).toEqual([
      { side: "player", phase: "challenge" },
      { side: "player", phase: "ending" },
      { side: "enemy", phase: "dawn" },
      { side: "enemy", phase: "day" },
      { side: "enemy", phase: "challenge" },
    ]);
    // The AI turn also appears in the same composite's step list.
    expect(reduced.lastTransition?.steps.some((step) => step.side === "player" && step.phase === "day")).toBe(true);
    expect(
      reduced.lastTransition?.energyChanges.some(
        (change) => change.side === "enemy" && change.previousMaxEnergy === 0 && change.maxEnergy === 1,
      ),
    ).toBe(true);
    expect(
      reduced.lastTransition?.logEvents.some((entry) => entry.event === "battle_proto_judgment"),
    ).toBe(true);
    expect(reduced.lastTransition?.resultChange).toBeNull();
    expect(reduced.lastTransition?.aiChoices.length).toBeGreaterThan(0);
    expect(reduced.lastTransition?.logEvents.map((event) => event.event)).toEqual(
      expect.arrayContaining([
        "battle_proto_phase_changed",
        "battle_proto_energy_changed",
        "battle_proto_judgment",
        "battle_proto_ai_choice",
      ]),
    );
    expect(reduced.history.past[0].metadata).toMatchObject({
      commandId: "END_TURN",
      label: "End Turn",
      kind: "battle-flow",
      isComposite: true,
    });
  });

  it("increments and refreshes energy at start of turn", () => {
    const { battleInit, state } = createTestBattle();

    state.sides.player.currentEnergy = -2;
    state.sides.player.maxEnergy = 4;

    const advanced = runStartOfTurnComposite(state, battleInit, {
      side: "player",
      incrementTurnNumber: false,
    }).state;

    expect(advanced.sides.player.maxEnergy).toBe(5);
    expect(advanced.sides.player.currentEnergy).toBe(5);
    expect(advanced.phase).toBe("day");
  });

  it("skips the player draw on round one", () => {
    const { battleInit, state } = createTestBattle();
    const initialDeck = [...state.sides.player.deck];
    const initialHand = [...state.sides.player.hand];

    const advanced = runStartOfTurnComposite(state, battleInit, {
      side: "player",
      incrementTurnNumber: false,
    }).state;

    expect(advanced.sides.player.hand).toEqual(initialHand);
    expect(advanced.sides.player.deck).toEqual(initialDeck);
  });

  it("lets RECOMPUTE_RESULT derive the natural turn-limit draw from battle state", () => {
    const { battleInit, state } = createTestBattle();

    state.activeSide = "enemy";
    state.phase = "ending";
    state.turnNumber = battleInit.turnLimit;
    state.sides.player.score = 12;
    state.sides.enemy.score = 10;

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "RECOMPUTE_RESULT",
        commandId: "RECOMPUTE_RESULT",
        label: "Recompute Result",
        kind: "result",
      },
      battleInit,
    );

    expect(reduced.mutable.result).toBe("draw");
    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.lastTransition?.resultChange).toEqual({
      at: { side: "enemy", phase: "ending" },
      previousResult: null,
      result: "draw",
      reason: "turn_limit_reached",
    });
  });

  it("detects a score target from active-side judgment scoring", () => {
    const { battleInit, state } = createTestBattle();
    const playerD0 = state.sides.player.hand[0];
    const enemyD1 = state.sides.enemy.hand[0];

    deploy(state, "player", "D0", playerD0);
    deploy(state, "enemy", "D1", enemyD1);
    setEffectiveSpark(state, playerD0, 2);
    setEffectiveSpark(state, enemyD1, 1);
    state.sides.player.score = 24;
    state.sides.enemy.score = 24;
    state.activeSide = "player";
    state.phase = "day";

    const reduced = battleReducer(
      createBattleReducerState(state),
      { type: "END_TURN" },
      battleInit,
    );

    expect(reduced.mutable.result).toBe("victory");
    expect(reduced.mutable.phase).toBe("challenge");
    expect(reduced.mutable.sides.player.score).toBe(26);
    expect(reduced.mutable.sides.enemy.score).toBe(24);
  });

  it("treats END_TURN as a no-op once a natural result already exists", () => {
    const { battleInit, state } = createTestBattle();

    state.sides.player.score = battleInit.scoreToWin;

    const reducerState = createBattleReducerState(state);
    const reduced = battleReducer(
      reducerState,
      { type: "END_TURN" },
      battleInit,
    );

    expect(reduced).toBe(reducerState);
    expect(reduced.history.past).toHaveLength(0);
    expect(reduced.mutable.phase).toBe("day");
    expect(reduced.mutable.result).toBeNull();
  });

  it("treats END_TURN as a no-op once a forced result already exists", () => {
    const { battleInit, state } = createTestBattle();

    state.forcedResult = "defeat";

    const reducerState = createBattleReducerState(state);
    const reduced = battleReducer(
      reducerState,
      { type: "END_TURN" },
      battleInit,
    );

    expect(reduced).toBe(reducerState);
    expect(reduced.history.past).toHaveLength(0);
    expect(reduced.mutable.phase).toBe("day");
    expect(reduced.mutable.result).toBeNull();
  });

  it("forces a result immediately and preserves the chosen forced-result marker", () => {
    const { battleInit, state } = createTestBattle();
    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "FORCE_RESULT",
        result: "defeat",
        metadata: {
          commandId: "FORCE_RESULT",
          label: "Force Defeat",
          kind: "result",
          isComposite: true,
          actor: "debug",
          sourceSurface: "action-bar",
          targets: [],
          timestamp: 0,
          undoPayload: null,
        },
      },
      battleInit,
    );

    expect(reduced.mutable.forcedResult).toBe("defeat");
    expect(reduced.mutable.result).toBe("defeat");
    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.history.past[0].metadata.commandId).toBe("FORCE_RESULT");
    expect(reduced.lastTransition?.resultChange).toEqual({
      at: { side: "player", phase: "day" },
      previousResult: null,
      result: "defeat",
      reason: "forced_result",
    });
  });

  it("keeps SKIP_TO_REWARDS distinct in history metadata while using forced victory semantics", () => {
    const { battleInit, state } = createTestBattle();
    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "FORCE_RESULT",
        result: "victory",
        metadata: {
          commandId: "SKIP_TO_REWARDS",
          label: "Skip To Rewards",
          kind: "result",
          isComposite: true,
          actor: "debug",
          sourceSurface: "action-bar",
          targets: [],
          timestamp: 0,
          undoPayload: null,
        },
      },
      battleInit,
    );

    expect(reduced.mutable.forcedResult).toBe("victory");
    expect(reduced.mutable.result).toBe("victory");
    expect(reduced.history.past[0].metadata).toMatchObject({
      commandId: "SKIP_TO_REWARDS",
      label: "Skip To Rewards",
      kind: "result",
      isComposite: true,
    });
    expect(reduced.lastTransition?.resultChange?.reason).toBe("forced_result");
  });

  it("ends in a draw when the enemy finishes the turn-limit round", () => {
    const { battleInit, state } = createTestBattle();

    state.activeSide = "enemy";
    state.phase = "day";
    state.turnNumber = battleInit.turnLimit;
    state.sides.player.score = 12;
    state.sides.enemy.score = 10;

    const reduced = battleReducer(
      createBattleReducerState(state),
      { type: "END_TURN" },
      battleInit,
    );

    expect(reduced.mutable.result).toBe("draw");
    expect(reduced.mutable.phase).toBe("ending");
    expect(reduced.mutable.activeSide).toBe("enemy");
    expect(reduced.lastTransition?.resultChange).toEqual({
      at: { side: "enemy", phase: "ending" },
      previousResult: null,
      result: "draw",
      reason: "turn_limit_reached",
    });
  });

  it("supports exact composite undo and redo through history snapshots", () => {
    const { battleInit, state } = createTestBattle();
    const reduced = battleReducer(
      createBattleReducerState(state),
      { type: "END_TURN" },
      battleInit,
    );
    const undone = undoBattleHistory(reduced.history);

    expect(undone).not.toBeNull();
    expect(undone?.restored.mutable).toEqual(state);

    reduced.mutable.sides.enemy.currentEnergy = 99;
    const redone = redoBattleHistory(undone!.history);

    expect(redone).not.toBeNull();
    const expectedAfterEndTurn = advanceAfterEndTurn(state, battleInit).state;
    const expectedWithAi = runAiTurn(expectedAfterEndTurn, battleInit).state;
    expect(redone?.restored.mutable).toEqual(expectedWithAi);
  });

  it("recomputes battle result after a committed play", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = findPlayerEventCardId(state);

    state.sides.player.score = battleInit.scoreToWin;

    const reduced = battleReducer(
      createBattleReducerState(state),
      { type: "PLAY_CARD", battleCardId },
      battleInit,
    );

    expect(reduced.mutable.result).toBe("victory");
    expect(reduced.mutable.sides.player.void).toContain(battleCardId);
    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.lastTransition?.resultChange?.result).toBe("victory");
  });

  it("moves a hand card to the manual stack, pays cost, and resolves it to void", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = findPlayerEventCardId(state);
    const startingEnergy = state.sides.player.currentEnergy;
    const cost = state.cardInstances[battleCardId].definition.energyCost;

    const stacked = applyBattleCommand(
      createBattleReducerState(state),
      { id: "PLAY_CARD_TO_STACK", battleCardId },
      battleInit,
    );

    expect(stacked.mutable.sides.player.hand).not.toContain(battleCardId);
    expect(stacked.mutable.sides.player.currentEnergy).toBe(startingEnergy - cost);
    expect(stacked.mutable.stack?.map((entry) => entry.battleCardId)).toEqual([battleCardId]);

    const resolved = applyBattleCommand(
      stacked,
      {
        id: "MOVE_STACK_CARD",
        battleCardId,
        target: { side: "player", zone: "void" },
      },
      battleInit,
    );

    expect(resolved.mutable.stack).toEqual([]);
    expect(resolved.mutable.sides.player.void).toContain(battleCardId);
    expect(resolved.history.past).toHaveLength(2);
  });

  it("resolves PLAY_CARD from the active side's hand without assuming player.hand", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.enemy.hand.find(
      (cardId) => state.cardInstances[cardId]?.definition.battleCardKind === "character",
    );

    if (battleCardId === undefined) {
      throw new Error("Missing enemy character card");
    }

    state.activeSide = "enemy";

    const reduced = battleReducer(
      createBattleReducerState(state),
      { type: "PLAY_CARD", battleCardId },
      battleInit,
    );

    expect(reduced.mutable.sides.enemy.hand).not.toContain(battleCardId);
    expect(reduced.mutable.sides.enemy.reserve.R0).toBe(battleCardId);
    expect(reduced.history.past).toHaveLength(1);
  });

  it("treats same-slot moves as a no-op without creating history", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];

    state.sides.player.hand = state.sides.player.hand.slice(1);
    state.sides.player.reserve.R0 = battleCardId;

    const reducerState = createBattleReducerState(state);
    const reduced = battleReducer(
      reducerState,
      {
        type: "MOVE_CARD",
        battleCardId,
        target: {
          side: "player",
          zone: "reserve",
          slotId: "R0",
        },
      },
      battleInit,
    );

    expect(reduced).toBe(reducerState);
    expect(reduced.history.past).toHaveLength(0);
  });

  it("permits gameplay actions outside the active side's main phase (E-16, H-1)", () => {
    const { battleInit, state } = createTestBattle();
    const handCardId = state.sides.player.hand[0];
    const fieldCardId = state.sides.player.hand[1];

    state.activeSide = "enemy";
    state.sides.player.currentEnergy = 5;
    state.sides.player.hand = state.sides.player.hand.filter((cardId) => cardId !== fieldCardId);
    state.sides.player.reserve.R0 = fieldCardId;

    const playReduced = battleReducer(
      createBattleReducerState(state),
      { type: "PLAY_CARD", battleCardId: handCardId },
      battleInit,
    );

    // PLAY_CARD goes through even though the enemy is the active side.
    expect(playReduced.mutable.sides.player.hand).not.toContain(handCardId);
    expect(playReduced.history.past).toHaveLength(1);

    state.activeSide = "player";
    state.phase = "challenge";
    const moveReduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "MOVE_CARD",
        battleCardId: fieldCardId,
        target: {
          side: "player",
          zone: "deployed",
          slotId: "D0",
        },
      },
      battleInit,
    );

    // MOVE_CARD is permitted during judgment phase per H-1.
    expect(moveReduced.mutable.sides.player.reserve.R0).toBeNull();
    expect(moveReduced.mutable.sides.player.deployed.D0).toBe(fieldCardId);
    expect(moveReduced.history.past).toHaveLength(1);
  });

  it("records the whole AI main phase as one composite history entry", () => {
    const { battleInit, state } = createTestBattle();
    const reserveCardId = state.sides.enemy.hand[0];

    state.activeSide = "enemy";
    state.phase = "day";
    state.sides.enemy.currentEnergy = 5;
    state.sides.enemy.maxEnergy = 5;
    state.sides.enemy.hand = state.sides.enemy.hand.slice(1);
    state.sides.enemy.reserve.R1 = reserveCardId;

    const reduced = battleReducer(
      createBattleReducerState(state),
      { type: "RUN_AI_TURN" },
      battleInit,
    );

    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.history.past[0].metadata).toMatchObject({
      commandId: "RUN_AI_TURN",
      label: "Enemy Turn",
      kind: "battle-flow",
      isComposite: true,
      actor: "enemy",
      sourceSurface: "auto-ai",
    });
    expect(reduced.mutable.activeSide).toBe("player");
    expect(reduced.mutable.phase).toBe("day");
    expect(reduced.lastTransition?.metadata.commandId).toBe("RUN_AI_TURN");
  });

  it("emits representative battle_proto events through the logger", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand.find(
      (cardId) => state.cardInstances[cardId]?.definition.battleCardKind === "character",
    );

    if (battleCardId === undefined) {
      throw new Error("Missing player character card");
    }

    const played = battleReducer(
      createBattleReducerState(state),
      { type: "PLAY_CARD", battleCardId },
      battleInit,
    );
    const endedTurn = battleReducer(
      createBattleReducerState(state),
      { type: "END_TURN" },
      battleInit,
    );
    emitBattleTransitionLogEvents(played.lastTransition);
    emitBattleTransitionLogEvents(endedTurn.lastTransition);

    expect(getLogEntries().map((entry) => entry.event)).toEqual(
      expect.arrayContaining([
        "battle_proto_play_card",
        "battle_proto_energy_changed",
        "battle_proto_phase_changed",
        "battle_proto_judgment",
      ]),
    );
  });

  it("records stable history metadata fields for command entries", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];
    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "PLAY_CARD",
        battleCardId,
      },
      battleInit,
    );

    expect(reduced.history.past[0].metadata.commandId).toBe("PLAY_CARD");
    expect(reduced.history.past[0].metadata.label.length).toBeGreaterThan(0);
    expect(reduced.history.past[0].metadata.kind).toBe("zone-move");
    expect(reduced.history.past[0].metadata.isComposite).toBe(false);
    expect(reduced.history.past[0].metadata.actor).toBe("player");
    expect(reduced.history.past[0].metadata.targets).toEqual([
      { kind: "card", ref: battleCardId },
    ]);
    expect(typeof reduced.history.past[0].metadata.timestamp).toBe("number");
    expect(reduced.history.past[0].metadata.undoPayload).toBeNull();
    expect(reduced.history.past[0].metadata.sourceSurface.length).toBeGreaterThan(0);
  });

  it("threads sourceSurface and selectedCardId onto battle_proto_play_card", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand.find(
      (cardId) => state.cardInstances[cardId]?.definition.battleCardKind === "character",
    );

    if (battleCardId === undefined) {
      throw new Error("Missing player character card");
    }

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "PLAY_CARD",
        battleCardId,
        metadata: {
          commandId: "PLAY_CARD",
          label: "Play Test",
          kind: "zone-move",
          isComposite: false,
          actor: "player",
          sourceSurface: "hand-tray",
          targets: [{ kind: "card", ref: battleCardId }],
          timestamp: 0,
          undoPayload: null,
        },
      },
      battleInit,
    );

    const playEvent = reduced.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_play_card",
    );

    expect(playEvent).toBeDefined();
    expect(playEvent?.fields).toMatchObject({
      battleId: battleInit.battleId,
      turnNumber: state.turnNumber,
      phase: state.phase,
      activeSide: state.activeSide,
      sourceSurface: "hand-tray",
      selectedCardId: battleCardId,
    });
  });

  it("threads sourceSurface onto battle_proto_phase_changed for end-turn", () => {
    const { battleInit, state } = createTestBattle();

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "END_TURN",
        metadata: {
          commandId: "END_TURN",
          label: "End Turn",
          kind: "battle-flow",
          isComposite: true,
          actor: "player",
          sourceSurface: "action-bar",
          targets: [],
          timestamp: 0,
          undoPayload: null,
        },
      },
      battleInit,
    );

    const phaseEvents = reduced.lastTransition?.logEvents.filter(
      (entry) => entry.event === "battle_proto_phase_changed",
    ) ?? [];

    expect(phaseEvents.length).toBeGreaterThan(0);
    for (const entry of phaseEvents) {
      expect(entry.fields).toHaveProperty("battleId", battleInit.battleId);
      expect(entry.fields).toHaveProperty("turnNumber");
      expect(entry.fields).toHaveProperty("activeSide");
      expect(entry.fields).toHaveProperty("phase");
      expect(entry.fields).toHaveProperty("selectedCardId", null);
      expect(entry.fields.sourceSurface).toMatch(/^(action-bar|auto-ai|auto-system)$/);
    }

    // The end-of-turn composite emits the player's `endOfTurn` phase event
    // under the player's `action-bar` source surface before the AI composite
    // kicks in under `auto-ai`.
    const endOfTurnPlayerEvent = phaseEvents.find(
      (entry) => entry.fields.phase === "ending" && entry.fields.activeSide === "player",
    );
    expect(endOfTurnPlayerEvent?.fields.sourceSurface).toBe("action-bar");
  });

  it("threads sourceSurface and selectedCardId onto numeric edits through the command-applied log", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "DEBUG_EDIT",
        edit: {
          kind: "SET_CARD_SPARK",
          battleCardId,
          value: 7,
        },
        metadata: {
          commandId: "SET_CARD_SPARK",
          label: "Set Spark",
          kind: "card-instance",
          isComposite: false,
          actor: "debug",
          sourceSurface: "inspector",
          targets: [{ kind: "card", ref: battleCardId }],
          timestamp: 0,
          undoPayload: null,
        },
      },
      battleInit,
    );

    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.history.past[0].metadata.sourceSurface).toBe("inspector");
    const cardTarget = reduced.history.past[0].metadata.targets.find(
      (target) => target.kind === "card",
    );
    expect(cardTarget?.ref).toBe(battleCardId);
  });

  it("emits winner, playerScore, enemyScore, and reason on battle_proto_result_changed for a player win", () => {
    const { battleInit, state } = createTestBattle();

    state.sides.player.score = battleInit.scoreToWin - 1;
    state.sides.enemy.score = 5;

    // Force player over the score threshold via a score edit; then have the
    // result evaluation emit a result-changed event carrying the new fields.
    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "DEBUG_EDIT",
        edit: {
          kind: "ADJUST_SCORE",
          side: "player",
          amount: 5,
        },
        metadata: {
          commandId: "ADJUST_SCORE",
          label: "Adjust Score",
          kind: "numeric-state",
          isComposite: false,
          actor: "debug",
          sourceSurface: "inspector",
          targets: [{ kind: "side", ref: "player" }],
          timestamp: 0,
          undoPayload: null,
        },
      },
      battleInit,
    );

    const resultEvent = reduced.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_result_changed",
    );

    expect(resultEvent).toBeDefined();
    expect(resultEvent?.fields).toMatchObject({
      result: "victory",
      reason: "score_target_reached",
      winner: "player",
      playerScore: battleInit.scoreToWin + 4,
      enemyScore: 5,
      sourceSurface: "inspector",
      selectedCardId: null,
      battleId: battleInit.battleId,
    });
  });

  it("emits winner 'enemy' on battle_proto_result_changed for an enemy win", () => {
    const { battleInit, state } = createTestBattle();

    state.sides.player.score = 3;
    state.sides.enemy.score = battleInit.scoreToWin - 1;

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "DEBUG_EDIT",
        edit: {
          kind: "ADJUST_SCORE",
          side: "enemy",
          amount: 5,
        },
        metadata: {
          commandId: "ADJUST_SCORE",
          label: "Adjust Score",
          kind: "numeric-state",
          isComposite: false,
          actor: "debug",
          sourceSurface: "inspector",
          targets: [{ kind: "side", ref: "enemy" }],
          timestamp: 0,
          undoPayload: null,
        },
      },
      battleInit,
    );

    const resultEvent = reduced.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_result_changed",
    );

    expect(resultEvent?.fields).toMatchObject({
      result: "defeat",
      winner: "enemy",
      playerScore: 3,
      enemyScore: battleInit.scoreToWin + 4,
    });
  });

  it("includes the six common fields on every battle_proto_* event emitted during a turn", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand.find(
      (cardId) => state.cardInstances[cardId]?.definition.battleCardKind === "character",
    );

    if (battleCardId === undefined) {
      throw new Error("Missing player character card");
    }

    resetLog();
    const played = battleReducer(
      createBattleReducerState(state),
      { type: "PLAY_CARD", battleCardId },
      battleInit,
    );
    const endedTurn = battleReducer(
      played,
      { type: "END_TURN" },
      battleInit,
    );
    emitBattleTransitionLogEvents(played.lastTransition);
    emitBattleTransitionLogEvents(endedTurn.lastTransition);

    const battleProtoEntries = getLogEntries().filter(
      (entry) => entry.event.startsWith("battle_proto_"),
    );

    expect(battleProtoEntries.length).toBeGreaterThan(0);
    for (const entry of battleProtoEntries) {
      expect(entry).toHaveProperty("battleId");
      expect(entry).toHaveProperty("turnNumber");
      expect(entry).toHaveProperty("phase");
      expect(entry).toHaveProperty("activeSide");
      expect(entry).toHaveProperty("sourceSurface");
      expect(entry).toHaveProperty("selectedCardId");
    }
  });

  it("leaves the state unchanged for a DEBUG_EDIT DRAW_CARD on an empty deck (M-6)", () => {
    const { battleInit, state } = createTestBattle();
    state.sides.player.deck = [];
    const handBefore = [...state.sides.player.hand];

    const reducerState = createBattleReducerState(state);
    const reduced = battleReducer(
      reducerState,
      {
        type: "DEBUG_EDIT",
        edit: { kind: "DRAW_CARD", side: "player" },
        metadata: {
          commandId: "DRAW_CARD",
          label: "Draw 1 for Player",
          kind: "zone-move",
          isComposite: false,
          actor: "debug",
          sourceSurface: "inspector",
          targets: [{ kind: "side", ref: "player" }],
          timestamp: 0,
          undoPayload: null,
        },
      },
      battleInit,
    );

    expect(reduced).toBe(reducerState);
    expect(reduced.mutable.sides.player.hand).toEqual(handBefore);
    expect(reduced.mutable.sides.player.deck).toEqual([]);
    expect(reduced.history.past).toHaveLength(0);
  });

  it("PLAY_FROM_DECK_TOP commits one composite entry", () => {
    const { battleInit, state } = createTestBattle();
    const character = state.sides.player.hand.find((battleCardId) =>
      state.cardInstances[battleCardId].definition.battleCardKind === "character",
    );
    if (character === undefined) {
      throw new Error("Missing character in opening hand");
    }
    state.sides.player.hand = state.sides.player.hand.filter(
      (battleCardId) => battleCardId !== character,
    );
    state.sides.player.deck = [character, ...state.sides.player.deck];

    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "PLAY_FROM_DECK_TOP",
          side: "player",
        },
        sourceSurface: "foresee-overlay",
      },
      battleInit,
    );

    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.history.past[0].metadata.isComposite).toBe(true);
    expect(reduced.history.past[0].metadata.commandId).toBe("PLAY_FROM_DECK_TOP");
    expect(reduced.mutable.sides.player.deck).not.toContain(character);
    expect(reduced.mutable.sides.player.hand).not.toContain(character);
    expect(reduced.mutable.sides.player.reserve.R0).toBe(character);
  });

  it("END_TURN consumes pendingExtraTurns", () => {
    const { battleInit, state } = createTestBattle();
    state.sides.player.pendingExtraTurns = 1;
    const reducerState = createBattleReducerState(state);

    const reduced = battleReducer(
      reducerState,
      { type: "END_TURN" },
      battleInit,
    );

    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.mutable.activeSide).toBe("player");
    expect(reduced.mutable.phase).toBe("day");
    expect(reduced.mutable.sides.player.pendingExtraTurns).toBe(0);
    const consumedEvent = reduced.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_extra_turn_consumed",
    );
    expect(consumedEvent?.fields).toMatchObject({
      consumedSide: "player",
      pendingExtraTurnsAfter: 0,
    });
  });

  it("FORCE_JUDGMENT commits one composite entry", () => {
    const { battleInit, state } = createTestBattle();
    const playerCharacter = state.sides.player.hand.find((cardId) =>
      state.cardInstances[cardId].definition.battleCardKind === "character",
    );
    const enemyCharacter = state.sides.enemy.hand.find((cardId) =>
      state.cardInstances[cardId].definition.battleCardKind === "character",
    );
    if (playerCharacter === undefined || enemyCharacter === undefined) {
      throw new Error("Missing characters for force-judgment seed");
    }
    state.sides.player.hand = state.sides.player.hand.filter((cardId) => cardId !== playerCharacter);
    state.sides.enemy.hand = state.sides.enemy.hand.filter((cardId) => cardId !== enemyCharacter);
    state.sides.player.deployed.D0 = playerCharacter;
    state.sides.enemy.deployed.D0 = enemyCharacter;
    state.cardInstances[playerCharacter].sparkDelta =
      10 - state.cardInstances[playerCharacter].definition.printedSpark;
    state.cardInstances[enemyCharacter].sparkDelta =
      1 - state.cardInstances[enemyCharacter].definition.printedSpark;

    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "FORCE_JUDGMENT",
          side: "player",
        },
        sourceSurface: "action-bar",
      },
      battleInit,
    );

    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.history.past[0].metadata.isComposite).toBe(true);
    expect(reduced.history.past[0].metadata.commandId).toBe("FORCE_JUDGMENT");
    expect(reduced.history.past[0].metadata.kind).toBe("battle-flow");
    expect(reduced.lastTransition?.steps).toEqual([
      { side: "player", phase: "challenge" },
    ]);
    expect(reduced.lastTransition?.scoreChanges).toHaveLength(0);
    const extraJudgmentEvent = reduced.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_extra_judgment",
    );
    expect(extraJudgmentEvent?.fields).toMatchObject({
      resolvedSide: "player",
      forced: true,
      scoreChange: 0,
    });
    expect(extraJudgmentEvent?.fields.dissolvedCardIds).toEqual([enemyCharacter]);
  });

  it("runs END_TURN when the start-of-turn side has an empty deck (M-6)", () => {
    // Bug 018: no prior test exercised an END_TURN composite where the
    // incoming side starts its turn with an empty deck. Empty-deck draw must
    // be a no-op (deck stays empty, no crash), and the composite must still
    // land in `main` after the AI turn completes.
    const { battleInit, state } = createTestBattle();
    state.sides.enemy.deck = [];
    state.sides.enemy.currentEnergy = 0;
    state.sides.enemy.maxEnergy = 0;

    const reduced = battleReducer(
      createBattleReducerState(state),
      { type: "END_TURN" },
      battleInit,
    );

    // Draw step on the enemy's start-of-turn is a no-op against an empty deck.
    expect(reduced.mutable.sides.enemy.deck).toEqual([]);
    // Composite lands back on the player's main phase with a single history entry.
    expect(reduced.mutable.phase).toBe("day");
    expect(reduced.mutable.activeSide).toBe("player");
    expect(reduced.history.past).toHaveLength(1);
  });

  it("records a natural victory via judgment, emits result_changed, and stops (M-7)", () => {
    // Bug 018: no prior test drove a judgment that pushes a side over
    // `scoreToWin` and asserted the result field + history entry + logged
    // reason "score_target_reached" together.
    const { battleInit, state } = createTestBattle();
    const playerD0 = state.sides.player.hand[0];

    deploy(state, "player", "D0", playerD0);
    setEffectiveSpark(state, playerD0, battleInit.scoreToWin);

    const reduced = battleReducer(
      createBattleReducerState(state),
      { type: "END_TURN" },
      battleInit,
    );

    expect(reduced.mutable.result).toBe("victory");
    expect(reduced.mutable.sides.player.score).toBeGreaterThanOrEqual(battleInit.scoreToWin);
    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.lastTransition?.resultChange).toMatchObject({
      result: "victory",
      reason: "score_target_reached",
    });
    const resultEvent = reduced.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_result_changed",
    );
    expect(resultEvent?.fields).toMatchObject({
      result: "victory",
      reason: "score_target_reached",
      winner: "player",
    });
  });

  it("records a same-side same-zone reserve swap via MOVE_CARD (bug-006, M-9)", () => {
    // Bug 018 / bug-006: intra-zone reserve→reserve swap through the reducer
    // must commit a history entry (resolveMoveCard no longer blocks it).
    const { battleInit, state } = createTestBattle();
    const cardA = state.sides.player.hand[0];
    const cardB = state.sides.player.hand[1];
    state.sides.player.hand = state.sides.player.hand.filter(
      (cardId) => cardId !== cardA && cardId !== cardB,
    );
    state.sides.player.reserve.R0 = cardA;
    state.sides.player.reserve.R2 = cardB;

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "MOVE_CARD",
        battleCardId: cardA,
        target: { side: "player", zone: "reserve", slotId: "R2" },
      },
      battleInit,
    );

    expect(reduced.mutable.sides.player.reserve.R0).toBe(cardB);
    expect(reduced.mutable.sides.player.reserve.R2).toBe(cardA);
    expect(reduced.history.past).toHaveLength(1);
  });

  it("permits MOVE_CARD on the enemy battlefield for cross-zone debug moves (H-1)", () => {
    // Bug 018 / M-9: the reducer must permit enemy-side cross-zone MOVE_CARD
    // even while the player is the active side (debug tooling, H-1).
    const { battleInit, state } = createTestBattle();
    const enemyCardId = state.sides.enemy.hand[0];
    state.sides.enemy.hand = state.sides.enemy.hand.filter(
      (cardId) => cardId !== enemyCardId,
    );
    state.sides.enemy.deployed.D1 = enemyCardId;

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "MOVE_CARD",
        battleCardId: enemyCardId,
        target: { side: "enemy", zone: "reserve", slotId: "R3" },
      },
      battleInit,
    );

    expect(reduced.mutable.sides.enemy.deployed.D1).toBeNull();
    expect(reduced.mutable.sides.enemy.reserve.R3).toBe(enemyCardId);
    expect(reduced.history.past).toHaveLength(1);
  });

  it("emits battle_proto_result_changed with reason 'forced_result' on FORCE_RESULT (L-7, bug-044)", () => {
    // Bug 044: spec L-7 requires "battle won/lost/drawn" logging. The
    // result_changed event is authoritative: it carries result + winner +
    // reason, so forced victories/defeats/draws all disambiguate from the
    // single event kind. Assert all three pipes produce the same event shape.
    for (const result of ["victory", "defeat", "draw"] as const) {
      const { battleInit, state } = createTestBattle();
      const reduced = battleReducer(
        createBattleReducerState(state),
        {
          type: "FORCE_RESULT",
          result,
          metadata: {
            commandId: "FORCE_RESULT",
            label: `Force ${result}`,
            kind: "result",
            isComposite: true,
            actor: "debug",
            sourceSurface: "action-bar",
            targets: [],
            timestamp: 0,
            undoPayload: null,
          },
        },
        battleInit,
      );
      const resultEvent = reduced.lastTransition?.logEvents.find(
        (entry) => entry.event === "battle_proto_result_changed",
      );
      expect(resultEvent?.fields).toMatchObject({
        result,
        reason: "forced_result",
      });
    }
  });

  it("emits winner null on battle_proto_result_changed for a draw", () => {
    const { battleInit, state } = createTestBattle();

    state.activeSide = "enemy";
    state.phase = "ending";
    state.turnNumber = battleInit.turnLimit;
    state.sides.player.score = 12;
    state.sides.enemy.score = 10;

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "RECOMPUTE_RESULT",
        commandId: "RECOMPUTE_RESULT",
        label: "Recompute Result",
        kind: "result",
      },
      battleInit,
    );

    const resultEvent = reduced.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_result_changed",
    );

    expect(resultEvent?.fields).toMatchObject({
      result: "draw",
      reason: "turn_limit_reached",
      winner: null,
      playerScore: 12,
      enemyScore: 10,
    });
  });
});

describe("battleReducer permissive PLAY_CARD / MOVE_CARD (E-16, H-1, H-16)", () => {
  it("permits PLAY_CARD while the phase is endOfTurn", () => {
    const { battleInit, state } = createTestBattle();
    state.phase = "ending";
    state.sides.player.currentEnergy = 5;
    const battleCardId = state.sides.player.hand.find(
      (cardId) => state.cardInstances[cardId].definition.battleCardKind === "character",
    );
    if (battleCardId === undefined) throw new Error("Missing character card");

    const reduced = battleReducer(
      createBattleReducerState(state),
      { type: "PLAY_CARD", battleCardId },
      battleInit,
    );

    expect(reduced.mutable.sides.player.hand).not.toContain(battleCardId);
    expect(Object.values(reduced.mutable.sides.player.reserve)).toContain(battleCardId);
  });

  it("permits PLAY_CARD during the enemy's active turn for a player hand card", () => {
    const { battleInit, state } = createTestBattle();
    state.activeSide = "enemy";
    state.phase = "day";
    state.sides.player.currentEnergy = 5;
    const battleCardId = state.sides.player.hand.find(
      (cardId) => state.cardInstances[cardId].definition.battleCardKind === "character",
    );
    if (battleCardId === undefined) throw new Error("Missing character card");

    const reduced = battleReducer(
      createBattleReducerState(state),
      { type: "PLAY_CARD", battleCardId },
      battleInit,
    );

    expect(reduced.mutable.sides.player.hand).not.toContain(battleCardId);
    expect(Object.values(reduced.mutable.sides.player.reserve)).toContain(battleCardId);
  });

  it("dispatches PLAY_CARD for a quest-modified character reclaimed from void", () => {
    const baseState = makeBattleTestState();
    const stateWithReclaim = {
      ...baseState,
      deck: baseState.deck.map((entry) =>
        entry.entryId === "deck-2"
          ? {
              ...entry,
              keywordModification: { reclaim: 2 },
            }
          : entry,
      ),
    };
    const battleInit = createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: stateWithReclaim,
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    });
    const state = createInitialBattleState(battleInit);
    const battleCardId = Object.values(state.cardInstances).find(
      (card) => card.definition.sourceDeckEntryId === "deck-2",
    )?.battleCardId;
    if (battleCardId === undefined) throw new Error("Missing modified character card");

    state.sides.player.deck = state.sides.player.deck.filter((id) => id !== battleCardId);
    state.sides.player.hand = state.sides.player.hand.filter((id) => id !== battleCardId);
    state.sides.player.void = [battleCardId];
    state.sides.player.currentEnergy = 2;

    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "PLAY_CARD",
        battleCardId,
        sourceSurface: "zone-browser-void",
      },
      battleInit,
    );

    expect(state.cardInstances[battleCardId].definition).toMatchObject({
      battleCardKind: "character",
      keywordModification: { reclaim: 2 },
      reclaimCost: 2,
    });
    expect(reduced.mutable.sides.player.void).not.toContain(battleCardId);
    expect(reduced.mutable.sides.player.reserve.R0).toBe(battleCardId);
    expect(reduced.mutable.sides.player.currentEnergy).toBe(0);
    expect(reduced.lastTransition?.metadata).toMatchObject({
      commandId: "PLAY_CARD",
      sourceSurface: "zone-browser-void",
    });
    expect(reduced.lastTransition?.logEvents[0].fields).toMatchObject({
      battleCardId,
      sourceZone: "void",
      targetZone: "reserve",
    });
  });

  it("permits a debug MOVE_CARD on the enemy battlefield during an enemy main phase", () => {
    const { battleInit, state } = createTestBattle();
    state.activeSide = "enemy";
    state.phase = "day";
    const enemyCardId = state.sides.enemy.hand[0];
    state.sides.enemy.hand = state.sides.enemy.hand.filter((id) => id !== enemyCardId);
    state.sides.enemy.reserve.R0 = enemyCardId;

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "MOVE_CARD",
        battleCardId: enemyCardId,
        target: { side: "enemy", zone: "deployed", slotId: "D0" },
      },
      battleInit,
    );

    expect(reduced.mutable.sides.enemy.reserve.R0).toBeNull();
    expect(reduced.mutable.sides.enemy.deployed.D0).toBe(enemyCardId);
  });

  it("emits a battle_proto_play_rejected log for a cross-side PLAY_CARD target (bug-048)", () => {
    const { battleInit, state } = createTestBattle();
    state.sides.player.currentEnergy = 5;
    const battleCardId = state.sides.player.hand.find(
      (cardId) => state.cardInstances[cardId].definition.battleCardKind === "character",
    );
    if (battleCardId === undefined) throw new Error("Missing character card");

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "PLAY_CARD",
        battleCardId,
        target: { side: "enemy", zone: "reserve", slotId: "R0" },
      },
      battleInit,
    );

    // The play is rejected (card stays in hand) and a rejection log is emitted
    // directly via `logEvent` since the reducer suppresses transitions for
    // unchanged states (bug-048).
    expect(reduced.mutable.sides.player.hand).toContain(battleCardId);
    const rejectionEntry = getLogEntries().find(
      (entry) => entry.event === "battle_proto_play_rejected",
    );
    expect(rejectionEntry).toMatchObject({
      battleCardId,
      reason: "cross_side_target",
    });
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

/**
 * Returns a player event card id. The opening hand is shuffled, so when no
 * event happens to be in hand one is pulled from the deck into the hand.
 */
function findPlayerEventCardId(
  state: ReturnType<typeof createTestBattle>["state"],
): string {
  let cardId = state.sides.player.hand.find(
    (id) => state.cardInstances[id]?.definition.battleCardKind === "event",
  );
  if (cardId === undefined) {
    const fromDeck = state.sides.player.deck.find(
      (id) => state.cardInstances[id]?.definition.battleCardKind === "event",
    );
    if (fromDeck !== undefined) {
      state.sides.player.deck = state.sides.player.deck.filter(
        (id) => id !== fromDeck,
      );
      state.sides.player.hand = [...state.sides.player.hand, fromDeck];
      cardId = fromDeck;
    }
  }
  if (cardId === undefined) {
    throw new Error("Missing player event card");
  }
  return cardId;
}

function deploy(
  state: ReturnType<typeof createTestBattle>["state"],
  side: "player" | "enemy",
  slotId: "D0" | "D1" | "D2" | "D3",
  battleCardId: string,
): void {
  state.sides[side].hand = state.sides[side].hand.filter((cardId) => cardId !== battleCardId);
  state.sides[side].deployed[slotId] = battleCardId;
}

function setEffectiveSpark(
  state: ReturnType<typeof createTestBattle>["state"],
  battleCardId: string,
  spark: number,
): void {
  state.cardInstances[battleCardId].sparkDelta =
    spark - state.cardInstances[battleCardId].definition.printedSpark;
}
