import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { createDebugEditHistoryMetadata } from "../debug/commands";
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

  it("merges a partial without clobbering counters or other sibling fields", () => {
    const state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    state.mutable.cardInstances[cardId].status.counters = 3;
    state.mutable.cardInstances[cardId].status.veil = 2;

    const result = setCardStatus(state, cardId, { reclaimed: true });

    expect(result.mutable.cardInstances[cardId].status.reclaimed).toBe(true);
    // Toggling reclaimed leaves counters and veil intact.
    expect(result.mutable.cardInstances[cardId].status.counters).toBe(3);
    expect(result.mutable.cardInstances[cardId].status.veil).toBe(2);
  });
});

describe("SET_CARD_STATUS ☪ auto-retreat", () => {
  it("retreats a front-rank character to an open back-rank slot when it is exhausted", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    state = moveCard(state, cardId, { side: "player", zone: "frontRank", slotId: "F0" });

    const result = setCardStatus(state, cardId, { isExhausted: true });

    // The front-rank slot empties and the body lands in the first open back-rank
    // slot (rules §Exhaust and Awaken: a front-rank source paying ☪ is moved to
    // an available back-rank position).
    expect(result.mutable.sides.player.frontRank.F0).toBeNull();
    expect(result.mutable.sides.player.backRank.B0).toBe(cardId);
    expect(result.mutable.cardInstances[cardId].status.isExhausted).toBe(true);
  });

  it("grows the back rank to retreat into when every materialized reserve is full", () => {
    let state = createBattle();
    const frontCardId = state.mutable.sides.player.hand[0];
    state = moveCard(state, frontCardId, { side: "player", zone: "frontRank", slotId: "F0" });

    // Occupy more reserve slots than the play area starts with so the retreat has
    // to grow the rank. Draw into the hand first when it has run dry; the front
    // card already consumed one hand card.
    const FILLED_RESERVES = 13;
    for (let index = 0; index < FILLED_RESERVES; index += 1) {
      if (state.mutable.sides.player.hand.length === 0) {
        state = drawCard(state, "player");
      }
      const handCardId = state.mutable.sides.player.hand[0];
      state = moveCard(state, handCardId, {
        side: "player",
        zone: "backRank",
        slotId: `B${index}`,
      });
    }

    const result = setCardStatus(state, frontCardId, { isExhausted: true });

    // The reserve has no upper bound, so the exhaust succeeds: the body leaves the
    // front rank and retreats into a freshly grown reserve slot, exhausted.
    expect(result.mutable).not.toBe(state.mutable);
    expect(result.mutable.sides.player.frontRank.F0).toBeNull();
    expect(result.mutable.cardInstances[frontCardId].status.isExhausted).toBe(true);
    const retreatSlot = Object.entries(result.mutable.sides.player.backRank).find(
      ([, occupant]) => occupant === frontCardId,
    );
    expect(retreatSlot).toBeDefined();
  });

  it("does not retreat a back-rank character when it is exhausted", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B1" });

    const result = setCardStatus(state, cardId, { isExhausted: true });

    // A body already in the back rank stays where it is.
    expect(result.mutable.sides.player.backRank.B1).toBe(cardId);
    expect(result.mutable.cardInstances[cardId].status.isExhausted).toBe(true);
  });

  it("does not retreat when an exhaust edit clears isExhausted instead of setting it", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    state = moveCard(state, cardId, { side: "player", zone: "frontRank", slotId: "F0" });
    state.mutable.cardInstances[cardId].status.isExhausted = true;

    const result = setCardStatus(state, cardId, { isExhausted: false });

    // Awakening (clearing exhaustion) leaves the front-rank position untouched.
    expect(result.mutable.sides.player.frontRank.F0).toBe(cardId);
    expect(result.mutable.cardInstances[cardId].status.isExhausted).toBe(false);
  });

  it("does not retreat when the status edit does not touch isExhausted", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    state = moveCard(state, cardId, { side: "player", zone: "frontRank", slotId: "F0" });

    const result = setCardStatus(state, cardId, { reclaimed: true });

    expect(result.mutable.sides.player.frontRank.F0).toBe(cardId);
    expect(result.mutable.cardInstances[cardId].status.reclaimed).toBe(true);
  });
});

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

describe("SET_COUNTERS", () => {
  it("sets status.counters to the requested value", () => {
    const state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];

    const result = setCounters(state, cardId, 3);

    expect(result.mutable.cardInstances[cardId].status.counters).toBe(3);
  });

  it("clamps a negative value to 0", () => {
    const state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    state.mutable.cardInstances[cardId].status.counters = 4;

    const result = setCounters(state, cardId, -2);

    expect(result.mutable.cardInstances[cardId].status.counters).toBe(0);
  });

  it("leaves sibling status fields untouched", () => {
    const state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    state.mutable.cardInstances[cardId].status.veil = 2;
    state.mutable.cardInstances[cardId].status.reclaimed = true;

    const result = setCounters(state, cardId, 5);

    expect(result.mutable.cardInstances[cardId].status.counters).toBe(5);
    expect(result.mutable.cardInstances[cardId].status.veil).toBe(2);
    expect(result.mutable.cardInstances[cardId].status.reclaimed).toBe(true);
  });

  it("is a no-op when the value already matches (clamped)", () => {
    const state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    // counters defaults to 0; clamped -1 also resolves to 0, so nothing changes.
    const result = setCounters(state, cardId, -1);
    expect(result.mutable.cardInstances[cardId]).toBe(state.mutable.cardInstances[cardId]);
  });

  it("ignores an unknown card id", () => {
    const state = createBattle();
    const result = setCounters(state, "missing-card", 2);
    expect(result.mutable).toBe(state.mutable);
  });

  it("zeroes counters when the card leaves play (rules §Counters)", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    // Put a character on the battlefield and store counters on it.
    state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });
    state = setCounters(state, cardId, 4);
    expect(state.mutable.cardInstances[cardId].status.counters).toBe(4);

    // Moving it off the battlefield (to the void) resets its counters to 0.
    const result = moveCard(state, cardId, { side: "player", zone: "void" });

    expect(result.mutable.cardInstances[cardId].status.counters).toBe(0);
  });

  it("preserves counters on a reposition within the battlefield", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });
    state = setCounters(state, cardId, 2);

    // A reposition between battlefield slots keeps counters (the card stays in play).
    const result = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B1" });

    expect(result.mutable.cardInstances[cardId].status.counters).toBe(2);
  });
});

function setStaticSparkBonus(
  state: BattleReducerState,
  battleCardId: string,
  value: number,
): BattleReducerState {
  return battleControllerReducer(state, {
    type: "APPLY_COMMAND",
    command: {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_CARD_STATIC_SPARK_BONUS", battleCardId, value },
    },
  });
}

describe("SET_CARD_STATIC_SPARK_BONUS", () => {
  it("sets the instance's staticSparkBonus to the requested value", () => {
    const state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];

    const result = setStaticSparkBonus(state, cardId, 3);

    expect(result.mutable.cardInstances[cardId].staticSparkBonus).toBe(3);
  });

  it("is a no-op when the value already matches", () => {
    const state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    const seeded = setStaticSparkBonus(state, cardId, 2);
    const before = seeded.mutable.cardInstances[cardId];

    const result = setStaticSparkBonus(seeded, cardId, 2);

    // Equal-value re-apply returns the same instance reference (no transition).
    expect(result.mutable.cardInstances[cardId]).toBe(before);
  });

  it("ignores an unknown card id", () => {
    const state = createBattle();
    const result = setStaticSparkBonus(state, "missing-card", 4);
    expect(result.mutable).toBe(state.mutable);
  });
});

function abandon(
  state: BattleReducerState,
  battleCardId: string,
): BattleReducerState {
  return battleControllerReducer(state, {
    type: "APPLY_COMMAND",
    command: {
      id: "DEBUG_EDIT",
      edit: { kind: "ABANDON", battleCardId },
    },
  });
}

function rematerialize(
  state: BattleReducerState,
  battleCardId: string,
): BattleReducerState {
  return battleControllerReducer(state, {
    type: "APPLY_COMMAND",
    command: {
      id: "DEBUG_EDIT",
      edit: { kind: "REMATERIALIZE", battleCardId },
    },
  });
}

function createFigmentInSlot(
  state: BattleReducerState,
  slotId: "B0" | "B1",
): { state: BattleReducerState; battleCardId: string } {
  const next = battleControllerReducer(state, {
    type: "APPLY_COMMAND",
    command: {
      id: "DEBUG_EDIT",
      edit: {
        kind: "CREATE_FIGMENT",
        side: "player",
        chosenSubtype: "Spark",
        chosenSpark: 1,
        name: "Spark Figment",
        destination: { side: "player", zone: "backRank", slotId },
        createdAtMs: 0,
      },
    },
  });
  const battleCardId = next.mutable.sides.player.backRank[slotId];
  if (battleCardId === null) {
    throw new Error("expected figment to be created in slot");
  }
  return { state: next, battleCardId };
}

describe("CREATE_FIGMENT exhaustion", () => {
  function createBackRankFigment(subtype: string): BattleReducerState {
    return battleControllerReducer(createBattle(), {
      type: "APPLY_COMMAND",
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "CREATE_FIGMENT",
          side: "player",
          chosenSubtype: subtype,
          chosenSpark: 1,
          name: `${subtype} Figment`,
          destination: { side: "player", zone: "backRank", slotId: "B0" },
          createdAtMs: 0,
        },
      },
    });
  }

  function backRankFigmentId(state: BattleReducerState): string {
    const id = state.mutable.sides.player.backRank.B0;
    if (id === null) {
      throw new Error("expected figment to be created in slot B0");
    }
    return id;
  }

  it("enters a non-awakened figment exhausted so it cannot challenge the turn it is created", () => {
    // Foxfire Thicket's dreamwell ability creates an Ethereal Figment; Ethereal
    // carries no Awakened keyword, so it must enter the back rank exhausted.
    const state = createBackRankFigment("Ethereal");
    const id = backRankFigmentId(state);
    expect(state.mutable.cardInstances[id].status.grantedAwakened).not.toBe(true);
    expect(state.mutable.cardInstances[id].status.isExhausted).toBe(true);
  });

  it("enters an Awakened figment (Ember) ready", () => {
    const state = createBackRankFigment("Ember");
    const id = backRankFigmentId(state);
    expect(state.mutable.cardInstances[id].status.grantedAwakened).toBe(true);
    expect(state.mutable.cardInstances[id].status.isExhausted).toBe(false);
  });
});

describe("ABANDON", () => {
  it("moves a non-figment character from play to its controller's void", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });
    const voidBefore = state.mutable.sides.player.void.length;

    const result = abandon(state, cardId);

    expect(result.mutable.sides.player.backRank.B0).toBeNull();
    expect(result.mutable.sides.player.void).toContain(cardId);
    expect(result.mutable.sides.player.void.length).toBe(voidBefore + 1);
  });

  it("abandons only the topmost figment of a multi-member stack, leaving the rest in play", () => {
    const created = createFigmentInSlot(createBattle(), "B0");
    const state = created.state;
    const figmentId = created.battleCardId;
    // A three-member stack with sparks [3, 2, 1]; the top member is the 3.
    state.mutable.cardInstances[figmentId].figments = [3, 2, 1];

    const result = abandon(state, figmentId);

    // The stack stays in play with its remaining members (top member dropped).
    expect(result.mutable.sides.player.backRank.B0).toBe(figmentId);
    expect(result.mutable.cardInstances[figmentId].figments).toEqual([2, 1]);
    expect(result.mutable.sides.player.void).not.toContain(figmentId);
  });

  it("moves a single-member figment stack wholesale to the void", () => {
    const created = createFigmentInSlot(createBattle(), "B0");
    const state = created.state;
    const figmentId = created.battleCardId;
    state.mutable.cardInstances[figmentId].figments = [2];

    const result = abandon(state, figmentId);

    expect(result.mutable.sides.player.backRank.B0).toBeNull();
    expect(result.mutable.sides.player.void).toContain(figmentId);
  });

  it("is a no-op for a card that is not in play", () => {
    const state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];

    const result = abandon(state, cardId);

    expect(result.mutable).toBe(state.mutable);
    expect(result.mutable.sides.player.hand).toContain(cardId);
  });

  it("records the Abandon intent in command history metadata", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    const cardName = state.mutable.cardInstances[cardId].definition.name;
    state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });

    const result = abandon(state, cardId);
    const entry = result.history.past[result.history.past.length - 1];

    expect(entry.metadata.commandId).toBe("ABANDON");
    expect(entry.metadata.label).toBe(`Abandon ${cardName}`);
  });
});

describe("REMATERIALIZE", () => {
  it("makes no structural change but yields a labeled command-history entry", () => {
    let state = createBattle();
    const cardId = state.mutable.sides.player.hand[0];
    const cardName = state.mutable.cardInstances[cardId].definition.name;
    state = moveCard(state, cardId, { side: "player", zone: "backRank", slotId: "B0" });
    const mutableBefore = state.mutable;

    const result = rematerialize(state, cardId);

    // Log-only gesture: the battle state is unchanged.
    expect(result.mutable).toBe(mutableBefore);

    // The metadata factory still produces the labeled command id, so the log
    // surfaces the player's intent even though no state field changes.
    expect(
      createDebugEditHistoryMetadata(
        { kind: "REMATERIALIZE", battleCardId: cardId },
        result.mutable,
      ),
    ).toMatchObject({
      commandId: "REMATERIALIZE",
      label: `Rematerialize ${cardName}`,
    });
  });
});

describe("DRAW_DREAMWELL_CARD edit", () => {
  function drawDreamwell(
    state: BattleReducerState,
    side: "player" | "enemy",
    turnNumber: number,
    additional = false,
  ): BattleReducerState {
    return battleControllerReducer(state, {
      type: "APPLY_COMMAND",
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "DRAW_DREAMWELL_CARD", side, turnNumber, additional },
      },
    });
  }

  it("points the side at the shared draw index, stamps the turn, and advances the deck", () => {
    const initial = createBattle();
    expect(initial.mutable.dreamwellDeckIndex).toBe(0);
    expect(initial.mutable.sides.player.dreamwellCardIndex).toBeNull();
    expect(initial.mutable.sides.player.dreamwellDrawnTurn).toBeNull();

    const afterPlayer = drawDreamwell(initial, "player", 1);
    expect(afterPlayer.mutable.sides.player.dreamwellCardIndex).toBe(0);
    expect(afterPlayer.mutable.sides.player.dreamwellDrawnTurn).toBe(1);
    expect(afterPlayer.mutable.dreamwellDeckIndex).toBe(1);
  });

  it("draws the next shared card for the other side, advancing the index again", () => {
    let state = createBattle();
    state = drawDreamwell(state, "player", 1);
    state = drawDreamwell(state, "enemy", 1);

    // Both sides drew from the one shared sequence: player got index 0, enemy 1.
    expect(state.mutable.sides.player.dreamwellCardIndex).toBe(0);
    expect(state.mutable.sides.enemy.dreamwellCardIndex).toBe(1);
    expect(state.mutable.dreamwellDeckIndex).toBe(2);
  });

  it("is idempotent per (side, turn): a duplicate mandatory reveal does not advance the deck", () => {
    let state = drawDreamwell(createBattle(), "player", 1);
    expect(state.mutable.sides.player.dreamwellCardIndex).toBe(0);
    expect(state.mutable.dreamwellDeckIndex).toBe(1);

    // A second mandatory reveal for the same (side, turn) — the coop/remount
    // race — must be a no-op rather than galloping the shared index to 2.
    const before = state;
    state = drawDreamwell(state, "player", 1);
    expect(state.mutable.dreamwellDeckIndex).toBe(1);
    expect(state.mutable.sides.player.dreamwellCardIndex).toBe(0);
    // The controller leaves the reducer state reference untouched on a no-op, so
    // the coop room transaction skips the write entirely.
    expect(state).toBe(before);
  });

  it("additional draws bypass the per-turn guard and consume the next card", () => {
    let state = drawDreamwell(createBattle(), "player", 1);
    expect(state.mutable.dreamwellDeckIndex).toBe(1);

    // Lily Lake: the player draws an additional Dreamwell card this turn.
    state = drawDreamwell(state, "player", 1, true);
    expect(state.mutable.sides.player.dreamwellCardIndex).toBe(1);
    expect(state.mutable.dreamwellDeckIndex).toBe(2);
  });

  it("applies no energy on its own (energy is folded in by basic automation)", () => {
    let state = createBattle();
    const beforeMax = state.mutable.sides.player.maxEnergy;
    state = drawDreamwell(state, "player", 1);
    expect(state.mutable.sides.player.maxEnergy).toBe(beforeMax);
  });
});
