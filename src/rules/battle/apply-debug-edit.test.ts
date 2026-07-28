import { describe, expect, it } from "vitest";
import type { BattleEngineEmissionContext, BattleMutableState } from "../../battle/types";
import { createBattleInit } from "../../battle/integration/create-battle-init";
import { createInitialBattleState } from "../../battle/state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamAvatars,
  makeBattleTestSite,
  makeBattleTestState,
} from "../../battle/test-support";
import { applyDebugEdit } from "./apply-debug-edit";

const EMISSION: BattleEngineEmissionContext = {
  sourceSurface: "foresee-overlay",
  selectedCardId: null,
};

function createTestState(): BattleMutableState {
  return createInitialBattleState(createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamAvatars: makeBattleTestDreamAvatars(),
  }));
}

describe("applyDebugEdit FORESEE", () => {
  it("atomically reorders the inspected prefix, moves selected cards to void, and logs UUIDs", () => {
    const state = createTestState();
    const viewedCardIds = state.sides.player.deck.slice(0, 3);
    const deckTail = state.sides.player.deck.slice(3);
    const voidBefore = [...state.sides.player.void];
    const orderedCardIds = [viewedCardIds[2], viewedCardIds[0]];
    const voidCardIds = [viewedCardIds[1]];

    const result = applyDebugEdit(state, {
      kind: "FORESEE",
      side: "player",
      viewedCardIds,
      orderedCardIds,
      voidCardIds,
    }, EMISSION);

    expect(result.state.sides.player.deck).toEqual([
      ...orderedCardIds,
      ...deckTail,
    ]);
    expect(result.state.sides.player.void).toEqual([
      ...voidBefore,
      ...voidCardIds,
    ]);
    expect(state.sides.player.deck.slice(0, 3)).toEqual(viewedCardIds);

    const log = result.transition.logEvents[0];
    expect(log?.event).toBe("battle_proto_foresee_resolved");
    expect(log?.fields).toMatchObject({
      side: "player",
      viewedCardIds,
      orderedCardIds,
      voidCardIds,
      viewedCardUuids: viewedCardIds.map(
        (id) => state.cardInstances[id]?.definition.cardId,
      ),
      orderedCardUuids: orderedCardIds.map(
        (id) => state.cardInstances[id]?.definition.cardId,
      ),
      voidCardUuids: voidCardIds.map(
        (id) => state.cardInstances[id]?.definition.cardId,
      ),
    });
  });

  it("rejects a stale or incomplete resolution without changing state", () => {
    const state = createTestState();
    const viewedCardIds = state.sides.player.deck.slice(0, 3);

    const stale = applyDebugEdit(state, {
      kind: "FORESEE",
      side: "player",
      viewedCardIds: [...viewedCardIds].reverse(),
      orderedCardIds: viewedCardIds,
      voidCardIds: [],
    }, EMISSION);
    expect(stale.state).toBe(state);
    expect(stale.transition.logEvents).toEqual([]);

    const incomplete = applyDebugEdit(state, {
      kind: "FORESEE",
      side: "player",
      viewedCardIds,
      orderedCardIds: viewedCardIds.slice(0, 2),
      voidCardIds: [],
    }, EMISSION);
    expect(incomplete.state).toBe(state);
    expect(incomplete.transition.logEvents).toEqual([]);
  });
});

describe("viewer-aware hidden information", () => {
  it("reveals one side's hand to the requested canonical viewer only", () => {
    const state = createTestState();
    const enemyHandId = state.sides.enemy.hand[0];
    const result = applyDebugEdit(state, {
      kind: "SET_SIDE_HAND_VISIBILITY",
      side: "enemy",
      viewer: "player",
      isRevealed: true,
    }, EMISSION);

    expect(result.state.cardInstances[enemyHandId].revealedTo).toEqual({
      player: true,
      enemy: true,
    });
    expect(state.cardInstances[enemyHandId].revealedTo).toEqual({
      player: false,
      enemy: true,
    });
  });

  it("interprets a legacy visibility edit as player-viewer knowledge", () => {
    const state = createTestState();
    const enemyHandId = state.sides.enemy.hand[0];
    const result = applyDebugEdit(state, {
      kind: "SET_CARD_VISIBILITY",
      battleCardId: enemyHandId,
      isRevealedToPlayer: true,
    }, EMISSION);

    expect(result.state.cardInstances[enemyHandId].revealedTo?.player).toBe(true);
    expect(result.state.cardInstances[enemyHandId].revealedTo?.enemy).toBe(true);
  });

  it("records Foresee knowledge for the acting viewer", () => {
    const state = createTestState();
    const viewedCardIds = state.sides.enemy.deck.slice(0, 2);
    const result = applyDebugEdit(state, {
      kind: "FORESEE",
      side: "enemy",
      viewer: "enemy",
      viewedCardIds,
      orderedCardIds: viewedCardIds,
      voidCardIds: [],
    }, EMISSION);

    expect(viewedCardIds.every((id) => result.state.cardInstances[id].revealedTo?.enemy)).toBe(true);
    expect(viewedCardIds.every((id) => !result.state.cardInstances[id].revealedTo?.player)).toBe(true);
  });
});

describe("applyDebugEdit Figments leaving play", () => {
  function createBattlefieldFigment(): {
    state: BattleMutableState;
    battleCardId: string;
  } {
    const created = applyDebugEdit(createTestState(), {
      kind: "CREATE_FIGMENT",
      side: "player",
      chosenSubtype: "Shadow",
      chosenSpark: 2,
      name: "Shadow",
      destination: { side: "player", zone: "backRank", slotId: "B0" },
      createdAtMs: 0,
    }, EMISSION);
    const battleCardId = created.state.sides.player.backRank.B0;
    if (battleCardId === null) {
      throw new Error("expected created Figment in B0");
    }
    return { state: created.state, battleCardId };
  }

  it("creates same-type Figments as distinct characters in their chosen slots", () => {
    const first = applyDebugEdit(createTestState(), {
      kind: "CREATE_FIGMENT",
      side: "player",
      chosenSubtype: "Shadow",
      chosenSpark: 2,
      name: "First Shadow",
      destination: { side: "player", zone: "backRank", slotId: "B0" },
      createdAtMs: 0,
    }, EMISSION);
    const second = applyDebugEdit(first.state, {
      kind: "CREATE_FIGMENT",
      side: "player",
      chosenSubtype: "Shadow",
      chosenSpark: 3,
      name: "Second Shadow",
      destination: { side: "player", zone: "backRank", slotId: "B1" },
      createdAtMs: 1,
    }, EMISSION);

    const firstId = second.state.sides.player.backRank.B0;
    const secondId = second.state.sides.player.backRank.B1;
    expect(firstId).not.toBeNull();
    expect(secondId).not.toBeNull();
    expect(secondId).not.toBe(firstId);
    expect(second.state.cardInstances[firstId!]?.figments).toEqual([2]);
    expect(second.state.cardInstances[secondId!]?.figments).toEqual([3]);
    expect(second.transition.logEvents).toHaveLength(1);
    expect(second.transition.logEvents[0]?.fields).toMatchObject({
      battleCardId: secondId,
      destinationZone: "player:backRank:B1",
    });
  });

  it("does not merge a newly created Figment into an occupied same-type slot", () => {
    const { state, battleCardId } = createBattlefieldFigment();
    const result = applyDebugEdit(state, {
      kind: "CREATE_FIGMENT",
      side: "player",
      chosenSubtype: "Shadow",
      chosenSpark: 3,
      name: "Second Shadow",
      destination: { side: "player", zone: "backRank", slotId: "B0" },
      createdAtMs: 1,
    }, EMISSION);

    expect(result.state).toBe(state);
    expect(result.state.sides.player.backRank.B0).toBe(battleCardId);
    expect(result.state.cardInstances[battleCardId]?.figments).toEqual([2]);
    expect(result.transition.logEvents).toEqual([]);
  });

  it.each(["hand", "void", "banished"] as const)(
    "destroys a single Figment rather than moving it to %s",
    (zone) => {
      const { state, battleCardId } = createBattlefieldFigment();

      const result = applyDebugEdit(state, {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId,
        destination: { side: "player", zone },
      }, EMISSION);

      expect(result.state.sides.player.backRank.B0).toBeNull();
      expect(result.state.cardInstances[battleCardId]).toBeUndefined();
      expect(result.state.sides.player[zone]).not.toContain(battleCardId);
    },
  );

  it("destroys only the topmost Figment when a stack would leave play", () => {
    const { state, battleCardId } = createBattlefieldFigment();
    const stacked = applyDebugEdit(state, {
      kind: "ADD_FIGMENTS",
      battleCardId,
      count: 1,
    }, EMISSION);

    const result = applyDebugEdit(stacked.state, {
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId,
      destination: { side: "player", zone: "banished" },
    }, EMISSION);

    expect(result.state.sides.player.backRank.B0).toBe(battleCardId);
    expect(result.state.cardInstances[battleCardId]?.figments).toEqual([2]);
    expect(result.state.sides.player.banished).not.toContain(battleCardId);
  });

  it("uses the same destruction replacement for Abandon", () => {
    const { state, battleCardId } = createBattlefieldFigment();

    const result = applyDebugEdit(state, {
      kind: "ABANDON",
      battleCardId,
    }, EMISSION);

    expect(result.state.sides.player.backRank.B0).toBeNull();
    expect(result.state.cardInstances[battleCardId]).toBeUndefined();
    expect(result.state.sides.player.void).not.toContain(battleCardId);
  });
});
