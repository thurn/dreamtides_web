import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import type { BattleDebugZoneDestination } from "../debug/commands";
import type { BattleFieldSlotAddress } from "../types";
import {
  battleControllerReducer,
  createBattleControllerState,
} from "./controller";
import { createInitialBattleState } from "./create-initial-state";
import type { BattleReducerState } from "../types";

/**
 * Coverage for the exhausted-can't-advance positional rule (rules §The Play
 * Area): an exhausted character cannot be moved to the front rank by either
 * player, whether through `MOVE_CARD_TO_ZONE` or `SWAP_BATTLEFIELD_SLOTS`.
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

function swapSlots(
  state: BattleReducerState,
  source: BattleFieldSlotAddress,
  target: BattleFieldSlotAddress,
): BattleReducerState {
  return battleControllerReducer(state, {
    type: "APPLY_COMMAND",
    command: {
      id: "DEBUG_EDIT",
      edit: { kind: "SWAP_BATTLEFIELD_SLOTS", source, target },
    },
  });
}

function setExhausted(
  state: BattleReducerState,
  battleCardId: string,
  isExhausted: boolean,
): void {
  state.mutable.cardInstances[battleCardId].status.isExhausted = isExhausted;
}

describe("exhausted-can't-advance rule", () => {
  describe("MOVE_CARD_TO_ZONE", () => {
    it("rejects moving an exhausted character into a front-rank slot", () => {
      let state = createBattle();
      const cardId = state.mutable.sides.player.hand[0];

      state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });
      setExhausted(state, cardId, true);

      const result = moveCard(state, cardId, {
        side: "player",
        zone: "frontRank",
        slotId: "F0",
      });

      // The exhausted body stays in the back rank: the front-rank slot is empty
      // and the back-rank slot still holds the card.
      expect(result.mutable.sides.player.frontRank.F0).toBeNull();
      expect(result.mutable.sides.player.backRank.B0).toBe(cardId);
    });

    it("allows moving a non-exhausted character into a front-rank slot", () => {
      let state = createBattle();
      const cardId = state.mutable.sides.player.hand[0];

      state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });
      setExhausted(state, cardId, false);

      const result = moveCard(state, cardId, {
        side: "player",
        zone: "frontRank",
        slotId: "F0",
      });

      expect(result.mutable.sides.player.frontRank.F0).toBe(cardId);
      expect(result.mutable.sides.player.backRank.B0).toBeNull();
    });

    it("allows moving an exhausted character within the back rank", () => {
      let state = createBattle();
      const cardId = state.mutable.sides.player.hand[0];

      state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });
      setExhausted(state, cardId, true);

      const result = moveCard(state, cardId, {
        side: "player",
        zone: "backRank",
        slotId: "B1",
      });

      expect(result.mutable.sides.player.backRank.B1).toBe(cardId);
      expect(result.mutable.sides.player.backRank.B0).toBeNull();
    });
  });

  describe("SWAP_BATTLEFIELD_SLOTS", () => {
    it("rejects a swap that would carry an exhausted body into the front rank", () => {
      let state = createBattle();
      const backCardId = state.mutable.sides.player.hand[0];
      const frontCardId = state.mutable.sides.player.hand[1];

      state = moveCard(state, backCardId, { side: "player", zone: "backRank", slotId: "B0" });
      state = moveCard(state, frontCardId, { side: "player", zone: "frontRank", slotId: "F0" });
      setExhausted(state, backCardId, true);

      const result = swapSlots(
        state,
        { side: "player", zone: "backRank", slotId: "B0" },
        { side: "player", zone: "frontRank", slotId: "F0" },
      );

      // The swap is rejected: occupants stay in place.
      expect(result.mutable.sides.player.backRank.B0).toBe(backCardId);
      expect(result.mutable.sides.player.frontRank.F0).toBe(frontCardId);
    });

    it("rejects a swap that would carry an exhausted front occupant into another front slot's place via an exhausted back body", () => {
      let state = createBattle();
      const frontCardId = state.mutable.sides.player.hand[0];
      const backCardId = state.mutable.sides.player.hand[1];

      state = moveCard(state, frontCardId, { side: "player", zone: "frontRank", slotId: "F0" });
      state = moveCard(state, backCardId, { side: "player", zone: "backRank", slotId: "B0" });
      // The body in the back rank is exhausted; swapping it onto the front slot
      // is blocked even though the front->back direction would be legal.
      setExhausted(state, backCardId, true);

      const result = swapSlots(
        state,
        { side: "player", zone: "frontRank", slotId: "F0" },
        { side: "player", zone: "backRank", slotId: "B0" },
      );

      expect(result.mutable.sides.player.frontRank.F0).toBe(frontCardId);
      expect(result.mutable.sides.player.backRank.B0).toBe(backCardId);
    });

    it("allows a swap between two front-rank slots even when an occupant is exhausted", () => {
      let state = createBattle();
      const firstCardId = state.mutable.sides.player.hand[0];
      const secondCardId = state.mutable.sides.player.hand[1];

      state = moveCard(state, firstCardId, { side: "player", zone: "frontRank", slotId: "F0" });
      state = moveCard(state, secondCardId, { side: "player", zone: "frontRank", slotId: "F1" });
      // Already in the front rank: a reposition between two front slots does not
      // "advance" an exhausted body — it is already there.
      setExhausted(state, firstCardId, true);

      const result = swapSlots(
        state,
        { side: "player", zone: "frontRank", slotId: "F0" },
        { side: "player", zone: "frontRank", slotId: "F1" },
      );

      expect(result.mutable.sides.player.frontRank.F0).toBe(secondCardId);
      expect(result.mutable.sides.player.frontRank.F1).toBe(firstCardId);
    });

    it("allows a non-exhausted body to swap into the front rank", () => {
      let state = createBattle();
      const backCardId = state.mutable.sides.player.hand[0];
      const frontCardId = state.mutable.sides.player.hand[1];

      state = moveCard(state, backCardId, { side: "player", zone: "backRank", slotId: "B0" });
      state = moveCard(state, frontCardId, { side: "player", zone: "frontRank", slotId: "F0" });
      setExhausted(state, backCardId, false);

      const result = swapSlots(
        state,
        { side: "player", zone: "backRank", slotId: "B0" },
        { side: "player", zone: "frontRank", slotId: "F0" },
      );

      expect(result.mutable.sides.player.frontRank.F0).toBe(backCardId);
      expect(result.mutable.sides.player.backRank.B0).toBe(frontCardId);
    });
  });
});

function setCardStatus(
  state: BattleReducerState,
  battleCardId: string,
  status: Partial<BattleReducerState["mutable"]["cardInstances"][string]["status"]>,
): BattleReducerState {
  return battleControllerReducer(state, {
    type: "APPLY_COMMAND",
    command: {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_CARD_STATUS", battleCardId, status },
    },
  });
}

describe("SET_CARD_STATUS", () => {
  it("merges the partial status, clearing isExhausted while leaving siblings intact", () => {
    const state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    state.mutable.cardInstances[cardId].status.isExhausted = true;
    state.mutable.cardInstances[cardId].status.offering = true;

    const result = setCardStatus(state, cardId, { isExhausted: false });

    expect(result.mutable.cardInstances[cardId].status.isExhausted).toBe(false);
    // Untouched sibling fields are preserved by the merge.
    expect(result.mutable.cardInstances[cardId].status.offering).toBe(true);
  });

  it("is a no-op when the partial matches the current status", () => {
    const state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    // The default status already has isExhausted === false.
    const result = setCardStatus(state, cardId, { isExhausted: false });
    expect(result.mutable.cardInstances[cardId]).toBe(state.mutable.cardInstances[cardId]);
  });

  it("ignores an unknown card id", () => {
    const state = createBattle();
    const result = setCardStatus(state, "missing-card", { isExhausted: false });
    expect(result.mutable).toBe(state.mutable);
  });
});
