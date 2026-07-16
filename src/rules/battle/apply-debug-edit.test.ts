import { describe, expect, it } from "vitest";
import type { BattleEngineEmissionContext, BattleMutableState } from "../../battle/types";
import { createBattleInit } from "../../battle/integration/create-battle-init";
import { createInitialBattleState } from "../../battle/state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
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
    dreamcallers: makeBattleTestDreamcallers(),
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
