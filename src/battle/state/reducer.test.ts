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
import type { BattleAiChoiceTrace, BattlePhase } from "../types";

beforeEach(() => {
  resetLog();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("battleReducer", () => {
  it("changes only the phase label for a SET_PHASE debug edit", () => {
    const { state } = createTestBattle();
    const before = createBattleReducerState(state).mutable;

    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase: "dusk" },
      },
    );

    expect(reduced.mutable.phase).toBe("dusk");
    expect(reduced.mutable.activeSide).toBe(before.activeSide);
    expect(reduced.mutable.turnNumber).toBe(before.turnNumber);
    expect(reduced.mutable.result).toBe(before.result);
    expect(reduced.mutable.sides.player.currentEnergy).toBe(before.sides.player.currentEnergy);
    expect(reduced.mutable.sides.player.maxEnergy).toBe(before.sides.player.maxEnergy);
    expect(reduced.mutable.sides.player.score).toBe(before.sides.player.score);
    expect(reduced.mutable.sides.player.hand).toEqual(before.sides.player.hand);
    expect(reduced.mutable.sides.player.deck).toEqual(before.sides.player.deck);
    expect(reduced.mutable.sides.player.deployed).toEqual(before.sides.player.deployed);
    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.history.past[0].metadata).toMatchObject({
      commandId: "SET_PHASE",
      label: "Set Phase to Dusk",
      kind: "battle-flow",
      isComposite: false,
    });
  });

  it("drives the phase label through dawn->day->dusk->night without touching score, board, or result", () => {
    const { state } = createTestBattle();
    // Seed deployed characters and scores so any residual judgment/exhaustion
    // would be visible in the assertions below.
    const playerD0 = state.sides.player.hand[0];
    const enemyD0 = state.sides.enemy.hand[0];
    state.sides.player.hand = state.sides.player.hand.filter((id) => id !== playerD0);
    state.sides.enemy.hand = state.sides.enemy.hand.filter((id) => id !== enemyD0);
    state.sides.player.deployed.D0 = playerD0;
    state.sides.enemy.deployed.D0 = enemyD0;
    state.sides.player.score = 5;
    state.sides.enemy.score = 3;

    const before = createBattleReducerState(state).mutable;
    let reducerState = createBattleReducerState(state);
    const order: BattlePhase[] = ["dawn", "day", "dusk", "night"];
    for (const phase of order) {
      reducerState = applyBattleCommand(
        reducerState,
        {
          id: "DEBUG_EDIT",
          edit: { kind: "SET_PHASE", phase },
        },
      );
    }

    expect(reducerState.mutable.phase).toBe("night");
    expect(reducerState.mutable.sides.player.score).toBe(before.sides.player.score);
    expect(reducerState.mutable.sides.enemy.score).toBe(before.sides.enemy.score);
    expect(reducerState.mutable.sides.player.deployed).toEqual(before.sides.player.deployed);
    expect(reducerState.mutable.sides.enemy.deployed).toEqual(before.sides.enemy.deployed);
    expect(reducerState.mutable.result).toBeNull();
  });

  it("leaves result null when a score edit crosses the win target (manual outcome only)", () => {
    const { battleInit, state } = createTestBattle();

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "DEBUG_EDIT",
        edit: {
          kind: "ADJUST_SCORE",
          side: "player",
          amount: battleInit.scoreToWin + 10,
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
    );

    expect(reduced.mutable.sides.player.score).toBe(battleInit.scoreToWin + 10);
    expect(reduced.mutable.result).toBeNull();
    expect(reduced.mutable.forcedResult).toBeNull();
    expect(reduced.lastTransition?.resultChange).toBeNull();
  });

  it("forces a result immediately and preserves the chosen forced-result marker", () => {
    const { state } = createTestBattle();
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

  it("sets both result and forcedResult to victory on FORCE_RESULT victory", () => {
    const { state } = createTestBattle();
    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "FORCE_RESULT",
        result: "victory",
        metadata: {
          commandId: "FORCE_RESULT",
          label: "Force Victory",
          kind: "result",
          isComposite: true,
          actor: "debug",
          sourceSurface: "action-bar",
          targets: [],
          timestamp: 0,
          undoPayload: null,
        },
      },
    );

    expect(reduced.mutable.forcedResult).toBe("victory");
    expect(reduced.mutable.result).toBe("victory");
    expect(reduced.lastTransition?.resultChange?.reason).toBe("forced_result");
  });

  it("keeps a forced defeat sticky through an unrelated debug edit", () => {
    const { state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];

    const forced = battleReducer(
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
    );

    expect(forced.mutable.result).toBe("defeat");
    expect(forced.mutable.forcedResult).toBe("defeat");

    const edited = battleReducer(
      forced,
      {
        type: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId,
          destination: { side: "player", zone: "void" },
        },
        metadata: {
          commandId: "MOVE_CARD_TO_ZONE",
          label: "Move Card",
          kind: "zone-move",
          isComposite: false,
          actor: "debug",
          sourceSurface: "inspector",
          targets: [{ kind: "card", ref: battleCardId }],
          timestamp: 0,
          undoPayload: null,
        },
      },
    );

    // The forced outcome must stick: the unrelated edit does not recompute or
    // clear it. It only changes via undo or another FORCE_RESULT.
    expect(edited.mutable.result).toBe("defeat");
    expect(edited.mutable.forcedResult).toBe("defeat");
    expect(edited.mutable.sides.player.void).toContain(battleCardId);
  });

  it("keeps SKIP_TO_REWARDS distinct in history metadata while using forced victory semantics", () => {
    const { state } = createTestBattle();
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

  it("copies a command envelope's aiChoices onto the resulting transition", () => {
    const { state } = createTestBattle();
    const trace: BattleAiChoiceTrace = {
      stage: "reposition",
      choice: "MOVE_CARD",
      battleCardId: "enemy-card-1",
      cardName: "Marked Direwolf",
      sourceHandIndex: null,
      sourceSlotId: "R0",
      targetSlotId: "D0",
      heuristicScoreBefore: 1,
      heuristicScoreAfter: 5,
      rationale: "Repositioning to challenge.",
      targetBattleCardId: null,
    };

    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase: "dusk" },
        aiChoices: [trace],
      },
    );

    expect(reduced.lastTransition?.aiChoices).toEqual([trace]);
  });

  it("defaults a command's transition aiChoices to [] when the envelope omits it", () => {
    const { state } = createTestBattle();

    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase: "dusk" },
      },
    );

    expect(reduced.lastTransition?.aiChoices).toEqual([]);
  });

  it("supports exact undo and redo through history snapshots", () => {
    const { state } = createTestBattle();
    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase: "night" },
      },
    );
    const undone = undoBattleHistory(reduced.history);

    expect(undone).not.toBeNull();
    expect(undone?.restored.mutable).toEqual(state);

    const redone = redoBattleHistory(undone!.history);

    expect(redone).not.toBeNull();
    expect(redone?.restored.mutable).toEqual(reduced.mutable);
  });

  it("never derives a result from a committed move edit even at the win target", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = findPlayerEventCardId(state);

    state.sides.player.score = battleInit.scoreToWin;

    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId,
          destination: { side: "player", zone: "void" },
        },
      },
    );

    expect(reduced.mutable.result).toBeNull();
    expect(reduced.mutable.forcedResult).toBeNull();
    expect(reduced.mutable.sides.player.void).toContain(battleCardId);
    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.lastTransition?.resultChange).toBeNull();
  });

  it("treats same-slot MOVE_CARD_TO_ZONE moves as a no-op without creating history", () => {
    const { state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];

    state.sides.player.hand = state.sides.player.hand.slice(1);
    state.sides.player.reserve.R0 = battleCardId;

    const reducerState = createBattleReducerState(state);
    const reduced = applyBattleCommand(
      reducerState,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId,
          destination: { side: "player", zone: "reserve", slotId: "R0" },
        },
      },
    );

    expect(reduced).toBe(reducerState);
    expect(reduced.history.past).toHaveLength(0);
  });

  it("permits MOVE_CARD_TO_ZONE moves regardless of phase or active side (E-16, H-1)", () => {
    const { state } = createTestBattle();
    const handCardId = state.sides.player.hand[0];
    const fieldCardId = state.sides.player.hand[1];

    state.activeSide = "enemy";
    state.sides.player.hand = state.sides.player.hand.filter((cardId) => cardId !== fieldCardId);
    state.sides.player.reserve.R0 = fieldCardId;

    // Moving a player hand card goes through even though the enemy is active.
    const playReduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: handCardId,
          destination: { side: "player", zone: "reserve", slotId: "R1" },
        },
      },
    );

    expect(playReduced.mutable.sides.player.hand).not.toContain(handCardId);
    expect(playReduced.history.past).toHaveLength(1);

    state.activeSide = "player";
    state.phase = "challenge";
    const moveReduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: fieldCardId,
          destination: { side: "player", zone: "deployed", slotId: "D0" },
        },
      },
    );

    // The move is permitted during the challenge phase per H-1.
    expect(moveReduced.mutable.sides.player.reserve.R0).toBeNull();
    expect(moveReduced.mutable.sides.player.deployed.D0).toBe(fieldCardId);
    expect(moveReduced.history.past).toHaveLength(1);
  });

  it("records stable history metadata fields for command entries", () => {
    const { state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];
    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId,
          destination: { side: "player", zone: "reserve", slotId: "R0" },
        },
      },
    );

    expect(reduced.history.past[0].metadata.commandId).toBe("MOVE_CARD_TO_ZONE");
    expect(reduced.history.past[0].metadata.label.length).toBeGreaterThan(0);
    expect(reduced.history.past[0].metadata.kind).toBe("zone-move");
    expect(reduced.history.past[0].metadata.actor).toBe("debug");
    expect(reduced.history.past[0].metadata.targets[0]).toEqual(
      { kind: "card", ref: battleCardId },
    );
    expect(typeof reduced.history.past[0].metadata.timestamp).toBe("number");
    expect(reduced.history.past[0].metadata.undoPayload).toBeNull();
    expect(reduced.history.past[0].metadata.sourceSurface.length).toBeGreaterThan(0);
  });

  it("threads sourceSurface and selectedCardId onto numeric edits through the command-applied log", () => {
    const { state } = createTestBattle();
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
    );

    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.history.past[0].metadata.sourceSurface).toBe("inspector");
    const cardTarget = reduced.history.past[0].metadata.targets.find(
      (target) => target.kind === "card",
    );
    expect(cardTarget?.ref).toBe(battleCardId);
  });

  it("emits winner, playerScore, enemyScore, and reason on battle_proto_result_changed for a forced player win", () => {
    const { battleInit, state } = createTestBattle();

    state.sides.player.score = battleInit.scoreToWin + 4;
    state.sides.enemy.score = 5;

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "FORCE_RESULT",
        result: "victory",
        metadata: {
          commandId: "FORCE_RESULT",
          label: "Force Victory",
          kind: "result",
          isComposite: true,
          actor: "debug",
          sourceSurface: "inspector",
          targets: [],
          timestamp: 0,
          undoPayload: null,
        },
      },
    );

    const resultEvent = reduced.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_result_changed",
    );

    expect(resultEvent).toBeDefined();
    expect(resultEvent?.fields).toMatchObject({
      result: "victory",
      reason: "forced_result",
      winner: "player",
      playerScore: battleInit.scoreToWin + 4,
      enemyScore: 5,
      sourceSurface: "inspector",
      selectedCardId: null,
      battleId: battleInit.battleId,
    });
  });

  it("emits winner 'enemy' on battle_proto_result_changed for a forced enemy win", () => {
    const { battleInit, state } = createTestBattle();

    state.sides.player.score = 3;
    state.sides.enemy.score = battleInit.scoreToWin + 4;

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
          sourceSurface: "inspector",
          targets: [],
          timestamp: 0,
          undoPayload: null,
        },
      },
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

  it("includes the six common fields on every battle_proto_* event emitted by a command", () => {
    const { state } = createTestBattle();

    resetLog();
    const adjusted = battleReducer(
      createBattleReducerState(state),
      {
        type: "DEBUG_EDIT",
        edit: { kind: "ADJUST_SCORE", side: "player", amount: 3 },
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
    );
    emitBattleTransitionLogEvents(adjusted.lastTransition);

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
    const { state } = createTestBattle();
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
    );

    expect(reduced).toBe(reducerState);
    expect(reduced.mutable.sides.player.hand).toEqual(handBefore);
    expect(reduced.mutable.sides.player.deck).toEqual([]);
    expect(reduced.history.past).toHaveLength(0);
  });

  it("PLAY_FROM_DECK_TOP places the top deck card on the first open reserve slot with no energy change", () => {
    const { state } = createTestBattle();
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
    const energyBefore = state.sides.player.currentEnergy;

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
    );

    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.history.past[0].metadata.isComposite).toBe(true);
    expect(reduced.history.past[0].metadata.commandId).toBe("PLAY_FROM_DECK_TOP");
    expect(reduced.mutable.sides.player.deck).not.toContain(character);
    expect(reduced.mutable.sides.player.hand).not.toContain(character);
    expect(reduced.mutable.sides.player.reserve.R0).toBe(character);
    // Energy-free manual play: no energy is spent.
    expect(reduced.mutable.sides.player.currentEnergy).toBe(energyBefore);
  });

  it("records a same-zone reserve swap via SWAP_BATTLEFIELD_SLOTS (bug-006, M-9)", () => {
    const { state } = createTestBattle();
    const cardA = state.sides.player.hand[0];
    const cardB = state.sides.player.hand[1];
    state.sides.player.hand = state.sides.player.hand.filter(
      (cardId) => cardId !== cardA && cardId !== cardB,
    );
    state.sides.player.reserve.R0 = cardA;
    state.sides.player.reserve.R2 = cardB;

    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SWAP_BATTLEFIELD_SLOTS",
          source: { side: "player", zone: "reserve", slotId: "R0" },
          target: { side: "player", zone: "reserve", slotId: "R2" },
        },
      },
    );

    expect(reduced.mutable.sides.player.reserve.R0).toBe(cardB);
    expect(reduced.mutable.sides.player.reserve.R2).toBe(cardA);
    expect(reduced.history.past).toHaveLength(1);
  });

  it("permits MOVE_CARD_TO_ZONE on the enemy battlefield for cross-zone moves (H-1)", () => {
    const { state } = createTestBattle();
    const enemyCardId = state.sides.enemy.hand[0];
    state.sides.enemy.hand = state.sides.enemy.hand.filter(
      (cardId) => cardId !== enemyCardId,
    );
    state.sides.enemy.deployed.D1 = enemyCardId;

    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: enemyCardId,
          destination: { side: "enemy", zone: "reserve", slotId: "R3" },
        },
      },
    );

    expect(reduced.mutable.sides.enemy.deployed.D1).toBeNull();
    expect(reduced.mutable.sides.enemy.reserve.R3).toBe(enemyCardId);
    expect(reduced.history.past).toHaveLength(1);
  });

  it("emits battle_proto_result_changed with reason 'forced_result' on FORCE_RESULT (L-7, bug-044)", () => {
    for (const result of ["victory", "defeat", "draw"] as const) {
      const { state } = createTestBattle();
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

  it("emits winner null on battle_proto_result_changed for a forced draw", () => {
    const { state } = createTestBattle();

    state.sides.player.score = 12;
    state.sides.enemy.score = 10;

    const reduced = battleReducer(
      createBattleReducerState(state),
      {
        type: "FORCE_RESULT",
        result: "draw",
        metadata: {
          commandId: "FORCE_RESULT",
          label: "Force Draw",
          kind: "result",
          isComposite: true,
          actor: "debug",
          sourceSurface: "action-bar",
          targets: [],
          timestamp: 0,
          undoPayload: null,
        },
      },
    );

    const resultEvent = reduced.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_result_changed",
    );

    expect(resultEvent?.fields).toMatchObject({
      result: "draw",
      reason: "forced_result",
      winner: null,
      playerScore: 12,
      enemyScore: 10,
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
