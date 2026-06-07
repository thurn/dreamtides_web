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

function drawCard(
  state: BattleReducerState,
  side: BattleReducerState["mutable"]["activeSide"],
): BattleReducerState {
  return battleControllerReducer(state, {
    type: "APPLY_COMMAND",
    command: {
      id: "DEBUG_EDIT",
      edit: { kind: "DRAW_CARD", side },
    },
  });
}

function erode(
  state: BattleReducerState,
  side: BattleReducerState["mutable"]["activeSide"],
  count: number,
): BattleReducerState {
  return battleControllerReducer(state, {
    type: "APPLY_COMMAND",
    command: {
      id: "DEBUG_EDIT",
      edit: { kind: "ERODE", side, count },
    },
  });
}

describe("ERODE", () => {
  it("moves the top `count` cards of the side's deck to its void", () => {
    const state = createBattle();
    const deckBefore = [...state.mutable.sides.player.deck];
    const voidBefore = state.mutable.sides.player.void.length;

    const result = erode(state, "player", 2);

    expect(result.mutable.sides.player.deck).toEqual(deckBefore.slice(2));
    expect(result.mutable.sides.player.void.slice(voidBefore)).toEqual(
      deckBefore.slice(0, 2),
    );
  });
});

describe("Fatigue", () => {
  it("awards the opponent doubling points and increments fatigueCount when drawing from an empty deck", () => {
    const state = createBattle();
    state.mutable.sides.player.deck = [];
    const enemyScoreBefore = state.mutable.sides.enemy.score;

    const afterFirst = drawCard(state, "player");
    // First fatigue event: 2^0 = 1 point to the opponent.
    expect(afterFirst.mutable.sides.enemy.score).toBe(enemyScoreBefore + 1);
    expect(afterFirst.mutable.sides.player.fatigueCount).toBe(1);

    const afterSecond = drawCard(afterFirst, "player");
    // Second fatigue event: 2^1 = 2 more points (total 3).
    expect(afterSecond.mutable.sides.enemy.score).toBe(enemyScoreBefore + 3);
    expect(afterSecond.mutable.sides.player.fatigueCount).toBe(2);
  });

  it("awards the opponent fatigue per card when eroding from an empty deck", () => {
    const state = createBattle();
    state.mutable.sides.player.deck = [];
    const enemyScoreBefore = state.mutable.sides.enemy.score;

    // Eroding 2 from an empty deck is two fatigue events: 1 then 2 = 3.
    const result = erode(state, "player", 2);
    expect(result.mutable.sides.enemy.score).toBe(enemyScoreBefore + 3);
    expect(result.mutable.sides.player.fatigueCount).toBe(2);
  });

  it("fatigues the player side too, awarding the enemy's opponent (player)", () => {
    const state = createBattle();
    state.mutable.sides.enemy.deck = [];
    const playerScoreBefore = state.mutable.sides.player.score;

    const result = drawCard(state, "enemy");
    expect(result.mutable.sides.player.score).toBe(playerScoreBefore + 1);
    expect(result.mutable.sides.enemy.fatigueCount).toBe(1);
  });

  it("erodes available cards then fatigues for the shortfall", () => {
    const state = createBattle();
    const topCard = state.mutable.sides.player.deck[0];
    state.mutable.sides.player.deck = [topCard];
    const enemyScoreBefore = state.mutable.sides.enemy.score;
    const voidBefore = state.mutable.sides.player.void.length;

    // Erode 2 with a 1-card deck: one card moves to void, one fatigue event (1).
    const result = erode(state, "player", 2);
    expect(result.mutable.sides.player.deck).toEqual([]);
    expect(result.mutable.sides.player.void.slice(voidBefore)).toEqual([topCard]);
    expect(result.mutable.sides.enemy.score).toBe(enemyScoreBefore + 1);
    expect(result.mutable.sides.player.fatigueCount).toBe(1);
  });
});

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
