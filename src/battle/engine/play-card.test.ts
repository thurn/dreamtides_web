import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { resolveMoveCard, resolvePlayCard } from "./play-card";

describe("play-card engine", () => {
  it("places a character in the leftmost empty reserve slot by default", () => {
    const state = createTestBattle();
    const battleCardId = findPlayerHandCardId(state, "character");

    const resolved = resolvePlayCard(state, battleCardId);

    expect(resolved.state.sides.player.reserve.R0).toBe(battleCardId);
    expect(resolved.state.sides.player.hand).not.toContain(battleCardId);
    expect(resolved.transition.energyChanges).toHaveLength(1);
  });

  it("falls back to the leftmost empty deployed slot when the reserve row is full (E-16)", () => {
    const state = createTestBattle();
    const battleCardId = findPlayerHandCardId(state, "character");

    occupyPlayerReserve(state);
    const resolved = resolvePlayCard(state, battleCardId);

    expect(resolved.state.sides.player.hand).not.toContain(battleCardId);
    expect(resolved.state.sides.player.deployed.D0).toBe(battleCardId);
    expect(resolved.transition.energyChanges).toHaveLength(1);
  });

  it("falls through to the next deployed slot when D0 is already occupied", () => {
    const state = createTestBattle();
    const battleCardId = findPlayerHandCardId(state, "character");

    occupyPlayerReserve(state);
    // Also occupy D0 so the fallback has to pick a later deployed slot.
    const existingDeployedCardId = Object.keys(state.cardInstances).find(
      (cardId) => cardId !== battleCardId &&
        !Object.values(state.sides.player.reserve).includes(cardId) &&
        state.sides.player.hand.every((handCardId) => handCardId !== cardId),
    );
    if (existingDeployedCardId === undefined) {
      throw new Error("Expected a spare card instance for D0 fill");
    }
    state.sides.player.deployed.D0 = existingDeployedCardId;

    const resolved = resolvePlayCard(state, battleCardId);

    expect(resolved.state.sides.player.deployed.D0).toBe(existingDeployedCardId);
    expect(resolved.state.sides.player.deployed.D1).toBe(battleCardId);
  });

  it("moves a non-character play directly from hand to void", () => {
    const state = createTestBattle();
    const battleCardId = findPlayerHandCardId(state, "event");

    const resolved = resolvePlayCard(state, battleCardId);

    expect(resolved.state.sides.player.hand).not.toContain(battleCardId);
    expect(resolved.state.sides.player.void).toContain(battleCardId);
  });

  it("plays a reclaimed event from the void for its Reclaim cost and banishes it", () => {
    const state = createTestBattle();
    const battleCardId = findPlayerHandCardId(state, "event");
    state.sides.player.hand = state.sides.player.hand.filter(
      (cardId) => cardId !== battleCardId,
    );
    state.sides.player.void = [battleCardId];
    state.sides.player.currentEnergy = 5;
    state.cardInstances[battleCardId].definition = {
      ...state.cardInstances[battleCardId].definition,
      reclaimCost: 2,
    };

    const resolved = resolvePlayCard(state, battleCardId);

    expect(resolved.state.sides.player.void).not.toContain(battleCardId);
    expect(resolved.state.sides.player.banished).toContain(battleCardId);
    expect(resolved.state.sides.player.currentEnergy).toBe(3);
  });

  it("allows player energy to go negative after a play", () => {
    const state = createTestBattle();
    const battleCardId = findPlayerHandCardId(state, "character");

    state.sides.player.currentEnergy = 0;
    const resolved = resolvePlayCard(state, battleCardId);

    expect(resolved.state.sides.player.currentEnergy).toBeLessThan(0);
  });

  it("moves a battlefield card between reserve and deployed rows", () => {
    const state = createTestBattle();
    const battleCardId = movePlayerHandCardToReserve(state, "R0");

    const resolved = resolveMoveCard(state, battleCardId, {
      side: "player",
      zone: "deployed",
      slotId: "D1",
    });

    expect(resolved.state.sides.player.reserve.R0).toBeNull();
    expect(resolved.state.sides.player.deployed.D1).toBe(battleCardId);
  });

  it("swaps cards when moving onto an occupied battlefield slot", () => {
    const state = createTestBattle();
    const reserveCardId = movePlayerHandCardToReserve(state, "R0");
    const deployedCardId = movePlayerHandCardToDeployed(state, "D2");

    const resolved = resolveMoveCard(state, reserveCardId, {
      side: "player",
      zone: "deployed",
      slotId: "D2",
    });

    expect(resolved.state.sides.player.deployed.D2).toBe(reserveCardId);
    expect(resolved.state.sides.player.reserve.R0).toBe(deployedCardId);
  });

  it("treats moving to the same slot as a no-op", () => {
    const state = createTestBattle();
    const battleCardId = movePlayerHandCardToReserve(state, "R0");

    const resolved = resolveMoveCard(state, battleCardId, {
      side: "player",
      zone: "reserve",
      slotId: "R0",
    });

    expect(resolved.state).toBe(state);
    expect(resolved.transition).toEqual({
      steps: [],
      energyChanges: [],
      judgment: null,
      scoreChanges: [],
      resultChange: null,
      aiChoices: [],
      logEvents: [],
    });
  });

  it("swaps two reserve cards on a reserve→reserve move (bug-006, F-4/F-6)", () => {
    const state = createTestBattle();
    const cardA = movePlayerHandCardToReserve(state, "R0");
    const cardB = movePlayerHandCardToReserve(state, "R2");

    const resolved = resolveMoveCard(state, cardA, {
      side: "player",
      zone: "reserve",
      slotId: "R2",
    });

    expect(resolved.state.sides.player.reserve.R0).toBe(cardB);
    expect(resolved.state.sides.player.reserve.R2).toBe(cardA);
    expect(resolved.transition.logEvents).toHaveLength(1);
    expect(resolved.transition.logEvents[0].event).toBe("battle_proto_move_card");
    expect(resolved.transition.logEvents[0].fields.isSwap).toBe(true);
  });

  it("swaps two deployed cards on a deployed→deployed move (bug-006, F-4/F-6)", () => {
    const state = createTestBattle();
    const cardA = movePlayerHandCardToDeployed(state, "D0");
    const cardB = movePlayerHandCardToDeployed(state, "D3");

    const resolved = resolveMoveCard(state, cardA, {
      side: "player",
      zone: "deployed",
      slotId: "D3",
    });

    expect(resolved.state.sides.player.deployed.D0).toBe(cardB);
    expect(resolved.state.sides.player.deployed.D3).toBe(cardA);
    expect(resolved.transition.logEvents[0].fields.isSwap).toBe(true);
  });

  it("moves a reserve card into an empty reserve slot without a partner (F-4)", () => {
    const state = createTestBattle();
    const cardA = movePlayerHandCardToReserve(state, "R1");

    const resolved = resolveMoveCard(state, cardA, {
      side: "player",
      zone: "reserve",
      slotId: "R3",
    });

    expect(resolved.state.sides.player.reserve.R1).toBeNull();
    expect(resolved.state.sides.player.reserve.R3).toBe(cardA);
    expect(resolved.transition.logEvents[0].fields.isSwap).toBe(false);
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

  return createInitialBattleState(battleInit);
}

function findPlayerHandCardId(
  state: ReturnType<typeof createTestBattle>,
  kind: "character" | "event",
): string {
  let battleCardId = state.sides.player.hand.find(
    (cardId) => state.cardInstances[cardId]?.definition.battleCardKind === kind,
  );

  if (battleCardId === undefined) {
    // The opening hand is shuffled; pull a card of the right kind from the
    // deck into the hand when none was dealt.
    const fromDeck = state.sides.player.deck.find(
      (cardId) =>
        state.cardInstances[cardId]?.definition.battleCardKind === kind,
    );
    if (fromDeck !== undefined) {
      state.sides.player.deck = state.sides.player.deck.filter(
        (cardId) => cardId !== fromDeck,
      );
      state.sides.player.hand = [...state.sides.player.hand, fromDeck];
      battleCardId = fromDeck;
    }
  }

  if (battleCardId === undefined) {
    throw new Error(`Missing player hand card of kind: ${kind}`);
  }

  return battleCardId;
}

function movePlayerHandCardToReserve(
  state: ReturnType<typeof createTestBattle>,
  slotId: "R0" | "R1" | "R2" | "R3" | "R4",
): string {
  const battleCardId = findPlayerHandCardId(state, "character");
  state.sides.player.hand = state.sides.player.hand.filter((cardId) => cardId !== battleCardId);
  state.sides.player.reserve[slotId] = battleCardId;
  return battleCardId;
}

function movePlayerHandCardToDeployed(
  state: ReturnType<typeof createTestBattle>,
  slotId: "D0" | "D1" | "D2" | "D3",
): string {
  const battleCardId = findPlayerHandCardId(state, "character");
  state.sides.player.hand = state.sides.player.hand.filter((cardId) => cardId !== battleCardId);
  state.sides.player.deployed[slotId] = battleCardId;
  return battleCardId;
}

function occupyPlayerReserve(state: ReturnType<typeof createTestBattle>): void {
  const fillerCardIds = Object.keys(state.cardInstances).slice(0, 5);
  const reserveSlotIds = ["R0", "R1", "R2", "R3", "R4"] as const;

  for (const [index, slotId] of reserveSlotIds.entries()) {
    state.sides.player.reserve[slotId] = fillerCardIds[index] ?? null;
  }
}
