import { describe, expect, it } from "vitest";
import { resolveMoveCard, resolvePlayCard } from "../engine/play-card";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { runAiTurn, MAX_AI_ACTIONS_PER_TURN } from "./run-ai-turn";

describe("runAiTurn", () => {
  it("caps the enemy main phase at three actions before ending turn", () => {
    const { battleInit, state } = createTestBattle();
    const reserveCharacter = moveEnemyHandCardToReserve(state, "R1");
    const affordableCharacter = ensureEnemyCardInHand(state, "character", 5);
    const affordableEvent = ensureEnemyCardInHand(state, "event", 5);

    state.activeSide = "enemy";
    state.phase = "day";
    state.sides.enemy.currentEnergy = 5;
    state.sides.enemy.maxEnergy = 5;
    state.sides.enemy.hand = [
      affordableCharacter,
      affordableEvent,
      ...state.sides.enemy.hand.filter(
        (battleCardId) =>
          battleCardId !== affordableCharacter && battleCardId !== affordableEvent,
      ),
    ];

    const resolved = runAiTurn(state, battleInit);

    expect(resolved.state.activeSide).toBe("player");
    expect(resolved.state.phase).toBe("day");
    expect(resolved.state.turnNumber).toBe(2);
    expect(resolved.state.sides.enemy.currentEnergy).toBeGreaterThanOrEqual(0);
    expect(resolved.transition.aiChoices).toHaveLength(MAX_AI_ACTIONS_PER_TURN + 1);
    expect(resolved.transition.aiChoices.map((choice) => choice.stage)).toEqual([
      "character",
      "reposition",
      "nonCharacter",
      "endTurn",
    ]);
    expect(
      resolved.transition.logEvents.filter(
        (event) => event.event === "battle_proto_ai_choice",
      ),
    ).toHaveLength(MAX_AI_ACTIONS_PER_TURN + 1);
    expect(resolved.state.sides.enemy.reserve.R1).not.toBe(reserveCharacter);
  });

  it("returns the input state untouched when it is not the enemy's main phase (bug-095)", () => {
    const { battleInit, state } = createTestBattle();
    // Player main phase — runAiTurn must no-op.
    expect(state.activeSide).toBe("player");
    expect(state.phase).toBe("day");

    const resolved = runAiTurn(state, battleInit);

    expect(resolved.state).toBe(state);
    expect(resolved.transition.aiChoices).toHaveLength(0);
    expect(resolved.transition.logEvents).toHaveLength(0);
  });

  it("ends the turn when the enemy has no affordable plays or moves (bug-095)", () => {
    const { battleInit, state } = createTestBattle();
    state.activeSide = "enemy";
    state.phase = "day";
    state.sides.enemy.currentEnergy = 0;
    state.sides.enemy.maxEnergy = 0;

    const resolved = runAiTurn(state, battleInit);

    expect(resolved.transition.aiChoices.length).toBeGreaterThanOrEqual(1);
    expect(
      resolved.transition.aiChoices[resolved.transition.aiChoices.length - 1].stage,
    ).toBe("endTurn");
    const endTurnLogs = resolved.transition.logEvents.filter(
      (event) =>
        event.event === "battle_proto_ai_choice" &&
        (event as unknown as { fields?: { stage?: string } }).fields?.stage === "endTurn",
    );
    expect(endTurnLogs).toHaveLength(1);
    // advanceAfterEndTurn flipped the active side and bumped the turn number.
    expect(resolved.state.activeSide).toBe("player");
    expect(resolved.state.turnNumber).toBe(2);
  });

  it("noop-returns when the battle has already resolved (bug-095)", () => {
    const { battleInit, state } = createTestBattle();
    state.activeSide = "enemy";
    state.phase = "day";
    state.result = "victory";

    const resolved = runAiTurn(state, battleInit);

    // Already-resolved state short-circuits at the top of runAiTurn.
    expect(resolved.state).toBe(state);
    expect(resolved.transition.aiChoices).toHaveLength(0);
  });

  it("resolvePlayCard returns the exact same state object on rejection (bug-084 contract)", () => {
    const { state } = createTestBattle();
    // Pick a card not in hand to force the "card_not_in_hand" rejection.
    const deployedCardId = ensureEnemyCardInHand(state, "character");
    state.sides.enemy.hand = state.sides.enemy.hand.filter((cardId) => cardId !== deployedCardId);
    state.sides.enemy.deployed.D0 = deployedCardId;

    const resolved = resolvePlayCard(state, deployedCardId, {
      side: "enemy",
      zone: "deployed",
      slotId: "D1",
    });

    expect(resolved.state).toBe(state);
  });

  it("resolveMoveCard returns the exact same state object on no-op (bug-084 contract)", () => {
    const { state } = createTestBattle();
    const deployedCardId = ensureEnemyCardInHand(state, "character");
    state.sides.enemy.hand = state.sides.enemy.hand.filter((cardId) => cardId !== deployedCardId);
    state.sides.enemy.deployed.D0 = deployedCardId;

    const resolved = resolveMoveCard(state, deployedCardId, {
      side: "enemy",
      zone: "deployed",
      slotId: "D0",
    });

    // Same-slot move is a no-op; contract requires returning the same object.
    expect(resolved.state).toBe(state);
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

function ensureEnemyCardInHand(
  state: ReturnType<typeof createTestBattle>["state"],
  kind: "character" | "event",
  maxEnergyCost = Number.POSITIVE_INFINITY,
): string {
  const existing = state.sides.enemy.hand.find(
    (cardId) =>
      state.cardInstances[cardId]?.definition.battleCardKind === kind
      && (state.cardInstances[cardId]?.definition.energyCost ?? Number.POSITIVE_INFINITY)
        <= maxEnergyCost,
  );

  if (existing !== undefined) {
    return existing;
  }

  const fromDeck = state.sides.enemy.deck.find(
    (cardId) =>
      state.cardInstances[cardId]?.definition.battleCardKind === kind
      && (state.cardInstances[cardId]?.definition.energyCost ?? Number.POSITIVE_INFINITY)
        <= maxEnergyCost,
  );

  if (fromDeck === undefined) {
    throw new Error(`Missing enemy ${kind} in deck`);
  }

  state.sides.enemy.deck = state.sides.enemy.deck.filter((cardId) => cardId !== fromDeck);
  state.sides.enemy.hand.push(fromDeck);
  return fromDeck;
}

function moveEnemyHandCardToReserve(
  state: ReturnType<typeof createTestBattle>["state"],
  slotId: "R1",
): string {
  const battleCardId = ensureEnemyCardInHand(state, "character");

  state.sides.enemy.hand = state.sides.enemy.hand.filter((cardId) => cardId !== battleCardId);
  state.sides.enemy.reserve[slotId] = battleCardId;

  return battleCardId;
}
