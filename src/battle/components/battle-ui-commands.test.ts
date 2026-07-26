import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamAvatars,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { createPlayCardFromHandCommand, createPoolCardDropCommand } from "./battle-ui-commands";
import { createBaseBattleDeckCardDefinition } from "../card-definition";

function board() {
  return createInitialBattleState(
    createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamAvatars: makeBattleTestDreamAvatars(),
    }),
  );
}

describe("createPlayCardFromHandCommand", () => {
  it("chooses the first open back-rank slot for a character without a preferred target", () => {
    const state = board();
    const characterId = state.sides.player.hand.find(
      (id) => state.cardInstances[id]?.definition.battleCardKind === "character",
    );
    if (characterId === undefined) throw new Error("expected a character in hand");

    const command = createPlayCardFromHandCommand(
      state,
      characterId,
      "hand-tray",
      true,
    );

    expect(command).toMatchObject({
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: characterId,
        destination: { side: "player", zone: "backRank", slotId: "B0" },
      },
    });
  });

  it("uses the preferred open back-rank slot for a dragged character", () => {
    const state = board();
    const characterId = state.sides.player.hand.find(
      (id) => state.cardInstances[id]?.definition.battleCardKind === "character",
    );
    if (characterId === undefined) throw new Error("expected a character in hand");

    const command = createPlayCardFromHandCommand(
      state,
      characterId,
      "hand-tray",
      true,
      { side: "player", zone: "backRank", slotId: "B2" },
    );

    expect(command).toMatchObject({
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: characterId,
        destination: { side: "player", zone: "backRank", slotId: "B2" },
      },
    });
  });

  it("routes an event straight to its own void when automation is disabled", () => {
    const state = board();
    const eventId = state.sides.player.hand.find(
      (id) => state.cardInstances[id]?.definition.battleCardKind === "event",
    );
    if (eventId === undefined) throw new Error("expected an event in hand");

    const command = createPlayCardFromHandCommand(
      state,
      eventId,
      "hand-tray",
      false,
    );

    expect(command).toMatchObject({
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: eventId,
        destination: { side: "player", zone: "void" },
      },
    });
  });

  it("targets the back rank for an automated event so the planner charges energy before voiding it", () => {
    const state = board();
    const eventId = state.sides.player.hand.find(
      (id) => state.cardInstances[id]?.definition.battleCardKind === "event",
    );
    if (eventId === undefined) throw new Error("expected an event in hand");

    const command = createPlayCardFromHandCommand(
      state,
      eventId,
      "hand-tray",
      true,
    );

    expect(command).toMatchObject({
      edit: { destination: { side: "player", zone: "backRank", slotId: "B0" } },
    });
  });
});

describe("createPoolCardDropCommand", () => {
  it("preserves the UUID-resolved card definition in the event-sourced deck mutation", () => {
    const card = [...makeBattleTestCardDatabase().values()][0];
    if (card === undefined) throw new Error("expected a fixture card");
    const definition = createBaseBattleDeckCardDefinition(card);
    const command = createPoolCardDropCommand(
      definition,
      { side: "player", zone: "deck", position: "top" },
      42,
    );

    expect(command).toMatchObject({
      id: "DEBUG_EDIT",
      sourceSurface: "pool-viewer",
      edit: {
        kind: "CREATE_CARD_FROM_DEFINITION",
        definition: { cardId: definition.cardId },
        destination: { side: "player", zone: "deck", position: "top" },
        createdAtMs: 42,
      },
    });
  });
});
