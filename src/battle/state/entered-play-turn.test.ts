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
 * Coverage for `BattleCardInstance.enteredPlayTurnNumber` (the engine's record
 * of when a card entered play). The Battle AI reads it to derive exhaustion, so
 * the reducer must stamp it on materialization, preserve it across a reposition,
 * and clear it when the card leaves play.
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

describe("enteredPlayTurnNumber stamping", () => {
  it("stamps the current turn when a hand card materializes into play", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    const turnNumber = state.mutable.turnNumber;

    expect(state.mutable.cardInstances[cardId].enteredPlayTurnNumber).toBeUndefined();

    state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });

    expect(state.mutable.cardInstances[cardId].enteredPlayTurnNumber).toBe(turnNumber);
  });

  it("preserves the stamp across a reserve-to-deployed reposition", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    const turnNumber = state.mutable.turnNumber;

    state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });
    expect(state.mutable.cardInstances[cardId].enteredPlayTurnNumber).toBe(turnNumber);

    state = moveCard(state, cardId, { side: "player", zone: "frontRank", slotId: "F0" });

    // A reposition within the battlefield does not re-stamp: the body keeps the
    // turn it first entered play.
    expect(state.mutable.cardInstances[cardId].enteredPlayTurnNumber).toBe(turnNumber);
  });

  it("clears the stamp when a body leaves play to the void", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];

    state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });
    expect(state.mutable.cardInstances[cardId].enteredPlayTurnNumber).not.toBeNull();

    state = moveCard(state, cardId, { side: "player", zone: "void" });

    expect(state.mutable.cardInstances[cardId].enteredPlayTurnNumber).toBeNull();
  });
});
