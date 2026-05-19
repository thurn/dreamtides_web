import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLog } from "../../logging";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import type { BattleTransitionData } from "../types";
import { AUTO_SYSTEM_EMISSION_CONTEXT } from "./result";
import {
  advanceAfterEndTurn,
  drawTopCard,
  expireBattleNotes,
  nextStartOfTurnPair,
  prepareInitialBattleState,
  runStartOfTurnComposite,
} from "./turn-flow";

beforeEach(() => {
  resetLog();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("drawTopCard (M-6, C-13)", () => {
  it("is a no-op when the deck is empty", () => {
    const { state } = createTestBattle();
    state.sides.player.deck = [];
    const handBefore = [...state.sides.player.hand];

    const drawn = drawTopCard(state, "player");

    expect(drawn).toBeNull();
    expect(state.sides.player.hand).toEqual(handBefore);
    expect(state.sides.player.deck).toEqual([]);
  });

  it("is a no-op across two consecutive empty-deck draws", () => {
    const { state } = createTestBattle();
    state.sides.enemy.deck = [];
    const handBefore = [...state.sides.enemy.hand];

    expect(drawTopCard(state, "enemy")).toBeNull();
    expect(drawTopCard(state, "enemy")).toBeNull();
    expect(state.sides.enemy.hand).toEqual(handBefore);
    expect(state.sides.enemy.deck).toEqual([]);
  });

  it("moves the top card into the hand when the deck has cards", () => {
    const { state } = createTestBattle();
    const topCardId = state.sides.player.deck[0];

    const drawn = drawTopCard(state, "player");

    expect(drawn).toBe(topCardId);
    expect(state.sides.player.hand).toContain(topCardId);
    expect(state.sides.player.deck[0]).not.toBe(topCardId);
  });
});

describe("prepareInitialBattleState (E-2/E-3 initial flow)", () => {
  it("preserves the opening 2/2 energy on each side for turn 1", () => {
    const { battleInit, state } = createTestBattle();
    expect(state.sides.player.currentEnergy).toBe(2);
    expect(state.sides.player.maxEnergy).toBe(2);

    const prepared = prepareInitialBattleState(state, battleInit);

    expect(prepared.state.sides.player.currentEnergy).toBe(2);
    expect(prepared.state.sides.player.maxEnergy).toBe(2);
    expect(prepared.state.sides.enemy.currentEnergy).toBe(2);
    expect(prepared.state.sides.enemy.maxEnergy).toBe(2);
    expect(prepared.state.phase).toBe("day");
    expect(prepared.state.turnNumber).toBe(1);
    const energyEvent = prepared.transition.logEvents.find(
      (entry) => entry.event === "battle_proto_energy_changed",
    );
    expect(energyEvent?.fields).toMatchObject({
      previousCurrentEnergy: 2,
      currentEnergy: 2,
      currentEnergyDelta: 0,
      previousMaxEnergy: 2,
      maxEnergy: 2,
      maxEnergyDelta: 0,
      side: "player",
    });
  });
});

describe("runStartOfTurnComposite energy refresh", () => {
  it("clamps maxEnergy at maxEnergyCap", () => {
    const { battleInit, state } = createTestBattle();
    state.sides.player.maxEnergy = battleInit.maxEnergyCap;
    state.sides.player.currentEnergy = 0;

    const advanced = runStartOfTurnComposite(state, battleInit, {
      side: "player",
      incrementTurnNumber: false,
    }).state;

    expect(advanced.sides.player.maxEnergy).toBe(battleInit.maxEnergyCap);
    expect(advanced.sides.player.currentEnergy).toBe(battleInit.maxEnergyCap);
  });

  it("skips drawing when the deck is empty at start of turn", () => {
    const { battleInit, state } = createTestBattle();
    state.turnNumber = 2;
    state.sides.enemy.deck = [];
    const handBefore = [...state.sides.enemy.hand];

    const advanced = runStartOfTurnComposite(state, battleInit, {
      side: "enemy",
      incrementTurnNumber: false,
    }).state;

    expect(advanced.sides.enemy.hand).toEqual(handBefore);
    expect(advanced.sides.enemy.deck).toEqual([]);
  });

  it("keeps enemy cards drawn into hand hidden during the start-of-turn draw", () => {
    const { battleInit, state } = createTestBattle();
    state.turnNumber = 2;
    const drawnCardId = state.sides.enemy.deck[0];
    if (drawnCardId === undefined) {
      throw new Error("expected enemy deck to contain a card");
    }
    state.cardInstances[drawnCardId].isRevealedToPlayer = false;

    const advanced = runStartOfTurnComposite(state, battleInit, {
      side: "enemy",
      incrementTurnNumber: false,
    }).state;

    expect(advanced.sides.enemy.hand).toContain(drawnCardId);
    expect(advanced.cardInstances[drawnCardId].isRevealedToPlayer).toBe(false);
  });
});

describe("advanceAfterEndTurn", () => {
  it("handles an empty-deck opponent without throwing", () => {
    const { battleInit, state } = createTestBattle();
    state.sides.enemy.deck = [];

    expect(() => advanceAfterEndTurn(state, battleInit)).not.toThrow();
  });

  it("consumes one pendingExtraTurn and keeps active side", () => {
    const { battleInit, state } = createTestBattle();
    state.activeSide = "player";
    state.turnNumber = 3;
    state.sides.player.pendingExtraTurns = 2;

    const result = advanceAfterEndTurn(state, battleInit);

    expect(result.state.activeSide).toBe("player");
    expect(result.state.turnNumber).toBe(3);
    expect(result.state.sides.player.pendingExtraTurns).toBe(1);
    const consumedEvent = result.transition.logEvents.find(
      (event) => event.event === "battle_proto_extra_turn_consumed",
    );
    expect(consumedEvent?.fields).toMatchObject({
      consumedSide: "player",
      pendingExtraTurnsAfter: 1,
    });
  });
});

describe("nextStartOfTurnPair", () => {
  it("matches the side/turn pair that advanceAfterEndTurn transitions to (player ending)", () => {
    const { battleInit, state } = createTestBattle();
    state.activeSide = "player";
    state.turnNumber = 3;

    const predicted = nextStartOfTurnPair(state);
    const advanced = advanceAfterEndTurn(state, battleInit).state;

    expect(predicted).toEqual({ side: "enemy", turnNumber: 3 });
    expect({ side: advanced.activeSide, turnNumber: advanced.turnNumber }).toEqual(predicted);
  });

  it("matches the side/turn pair that advanceAfterEndTurn transitions to (enemy ending)", () => {
    const { battleInit, state } = createTestBattle();
    state.activeSide = "enemy";
    state.turnNumber = 3;

    const predicted = nextStartOfTurnPair(state);
    const advanced = advanceAfterEndTurn(state, battleInit).state;

    expect(predicted).toEqual({ side: "player", turnNumber: 4 });
    expect({ side: advanced.activeSide, turnNumber: advanced.turnNumber }).toEqual(predicted);
  });
});

describe("expireBattleNotes", () => {
  it("clears atStartOfTurn expiries and emits battle_proto_note_expired", () => {
    const { state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];
    state.cardInstances[battleCardId].notes = [
      {
        noteId: "note_manual_keep",
        text: "keep me",
        createdAtTurnNumber: 1,
        createdAtSide: "player",
        createdAtMs: 1,
        expiry: { kind: "manual" },
      },
      {
        noteId: "note_expire_now",
        text: "expire at enemy start",
        createdAtTurnNumber: 1,
        createdAtSide: "player",
        createdAtMs: 2,
        expiry: { kind: "atStartOfTurn", side: "enemy", turnNumber: 1 },
      },
      {
        noteId: "note_keep_wrong_side",
        text: "other side",
        createdAtTurnNumber: 1,
        createdAtSide: "player",
        createdAtMs: 3,
        expiry: { kind: "atStartOfTurn", side: "player", turnNumber: 2 },
      },
    ];
    const transition: BattleTransitionData = {
      steps: [],
      energyChanges: [],
      judgment: null,
      scoreChanges: [],
      resultChange: null,
      aiChoices: [],
      logEvents: [],
    };

    expireBattleNotes(state, transition, AUTO_SYSTEM_EMISSION_CONTEXT, {
      side: "enemy",
      turnNumber: 1,
    });

    const notes = state.cardInstances[battleCardId].notes;
    expect(notes.map((note) => note.noteId)).toEqual([
      "note_manual_keep",
      "note_keep_wrong_side",
    ]);

    const expiredEvents = transition.logEvents.filter(
      (event) => event.event === "battle_proto_note_expired",
    );
    expect(expiredEvents).toHaveLength(1);
    expect(expiredEvents[0].fields).toMatchObject({
      battleCardId,
      noteId: "note_expire_now",
      expirySide: "enemy",
      expiryTurnNumber: 1,
      expiryKind: "atStartOfTurn",
    });
  });
});

describe("battle_proto_energy_changed payload shape (L-6)", () => {
  it("includes delta fields for both currentEnergy and maxEnergy", () => {
    const { battleInit, state } = createTestBattle();
    state.sides.enemy.currentEnergy = 2;
    state.sides.enemy.maxEnergy = 3;

    const result = runStartOfTurnComposite(state, battleInit, {
      side: "enemy",
      incrementTurnNumber: false,
    });
    const energyEvent = result.transition.logEvents.find(
      (event) => event.event === "battle_proto_energy_changed",
    );

    expect(energyEvent).toBeDefined();
    expect(energyEvent?.fields).toMatchObject({
      previousCurrentEnergy: 2,
      currentEnergy: 4,
      currentEnergyDelta: 2,
      previousMaxEnergy: 3,
      maxEnergy: 4,
      maxEnergyDelta: 1,
      side: "enemy",
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
