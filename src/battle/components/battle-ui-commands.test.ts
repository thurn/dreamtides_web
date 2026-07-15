import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { createPlayCardFromHandCommand } from "./battle-ui-commands";

function board() {
  return createInitialBattleState(
    createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    }),
  );
}

describe("createPlayCardFromHandCommand", () => {
  it("always chooses the first open back-rank slot for a character", () => {
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
