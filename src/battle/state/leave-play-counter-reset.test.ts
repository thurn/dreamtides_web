import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import type { BattleDebugZoneDestination } from "../debug/commands";
import {
  battleControllerReducer,
  createBattleControllerState,
} from "./controller";
import { createInitialBattleState } from "./create-initial-state";
import type { BattleReducerState } from "../types";

/**
 * Coverage for the leave-play counter reset (rules §Counters): a card's stored
 * ⧗ counters are local to it and reset to 0 when the body leaves the
 * battlefield, while a reposition within play or an entry into play leaves the
 * counters untouched.
 */
function createBattle(): BattleReducerState {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });
  return createBattleControllerState(createInitialBattleState(battleInit));
}

function moveCard(
  state: BattleReducerState,
  battleCardId: string,
  destination: BattleDebugZoneDestination,
): BattleReducerState {
  return battleControllerReducer(state, {
    type: "APPLY_COMMAND",
    command: {
      id: "DEBUG_EDIT",
      edit: { kind: "MOVE_CARD_TO_ZONE", battleCardId, destination },
    },
  });
}

function setCounters(
  state: BattleReducerState,
  battleCardId: string,
  value: number,
): BattleReducerState {
  return battleControllerReducer(state, {
    type: "APPLY_COMMAND",
    command: {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_COUNTERS", battleCardId, value },
    },
  });
}

describe("leave-play counter reset", () => {
  it("preserves counters across a back-to-front reposition within play", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];

    state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });
    state = setCounters(state, cardId, 3);
    expect(state.mutable.cardInstances[cardId].status.counters).toBe(3);

    state = moveCard(state, cardId, { side: "player", zone: "frontRank", slotId: "F0" });

    // A reposition within the battlefield does not reset counters.
    expect(state.mutable.cardInstances[cardId].status.counters).toBe(3);
  });

  it("zeroes counters when a body leaves play to the void", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];

    state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });
    state = setCounters(state, cardId, 3);
    expect(state.mutable.cardInstances[cardId].status.counters).toBe(3);

    state = moveCard(state, cardId, { side: "player", zone: "void" });

    expect(state.mutable.cardInstances[cardId].status.counters).toBe(0);
  });
});
