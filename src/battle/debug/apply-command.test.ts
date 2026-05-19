import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import { createBattleReducerState } from "../state/reducer";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { applyBattleCommand } from "./apply-command";

describe("applyBattleCommand", () => {
  it("routes typed gameplay commands into reducer history metadata", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];
    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "PLAY_CARD",
        battleCardId,
      },
      battleInit,
    );

    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.history.past[0].metadata.commandId).toBe("PLAY_CARD");
    expect(reduced.history.past[0].metadata.label).toContain("Play ");
    expect(reduced.history.past[0].metadata.kind).toBe("zone-move");
    expect(reduced.history.past[0].metadata.isComposite).toBe(false);
    expect(reduced.history.past[0].metadata.actor).toBe("player");
    expect(reduced.history.past[0].metadata.targets).toEqual([
      { kind: "card", ref: battleCardId },
    ]);
    expect(typeof reduced.history.past[0].metadata.timestamp).toBe("number");
    expect(reduced.history.past[0].metadata.undoPayload).toBeNull();
  });

  it("preserves SKIP_TO_REWARDS identity while forcing a victory result", () => {
    const { battleInit, state } = createTestBattle();
    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      { id: "SKIP_TO_REWARDS" },
      battleInit,
    );

    expect(reduced.mutable.forcedResult).toBe("victory");
    expect(reduced.mutable.result).toBe("victory");
    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.history.past[0].metadata).toMatchObject({
      commandId: "SKIP_TO_REWARDS",
      label: "Skip To Rewards",
      kind: "result",
      isComposite: true,
      actor: "debug",
    });
    expect(reduced.history.past[0].metadata.targets).toEqual([]);
    expect(reduced.history.past[0].metadata.undoPayload).toBeNull();
  });

  it("supports representative zone transfers through the typed debug command model", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];

    const toVoid = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId,
          destination: {
            side: "player",
            zone: "void",
          },
        },
      },
      battleInit,
    );

    expect(toVoid.mutable.sides.player.hand).not.toContain(battleCardId);
    expect(toVoid.mutable.sides.player.void).toContain(battleCardId);
    expect(toVoid.history.past[0].metadata.commandId).toBe("MOVE_CARD_TO_ZONE");

    const toReserve = applyBattleCommand(
      toVoid,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId,
          destination: {
            side: "player",
            zone: "reserve",
            slotId: "R0",
          },
        },
      },
      battleInit,
    );

    expect(toReserve.mutable.sides.player.void).not.toContain(battleCardId);
    expect(toReserve.mutable.sides.player.reserve.R0).toBe(battleCardId);
  });

  it("places debug-moved cards on the top or bottom of the deck in the requested order", () => {
    const { battleInit, state } = createTestBattle();
    const topMover = state.sides.player.hand[0];
    const bottomMover = state.sides.player.hand[1];
    const initialDeck = [...state.sides.player.deck];

    const toTop = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: topMover,
          destination: {
            side: "player",
            zone: "deck",
            position: "top",
          },
        },
      },
      battleInit,
    );

    expect(toTop.mutable.sides.player.deck[0]).toBe(topMover);

    const toBottom = applyBattleCommand(
      toTop,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: bottomMover,
          destination: {
            side: "player",
            zone: "deck",
            position: "bottom",
          },
        },
      },
      battleInit,
    );

    expect(toBottom.mutable.sides.player.deck[0]).toBe(topMover);
    expect(toBottom.mutable.sides.player.deck[toBottom.mutable.sides.player.deck.length - 1]).toBe(
      bottomMover,
    );
    expect(toBottom.mutable.sides.player.deck).toEqual([
      topMover,
      ...initialDeck,
      bottomMover,
    ]);
  });

  it("applies numeric debug edits for score, current energy, and max energy", () => {
    const { battleInit, state } = createTestBattle();
    state.sides.player.currentEnergy = 2;
    state.sides.player.maxEnergy = 3;
    state.sides.enemy.score = 4;

    const adjusted = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "ADJUST_CURRENT_ENERGY",
          side: "player",
          amount: -3,
        },
      },
      battleInit,
    );

    const maxAdjusted = applyBattleCommand(
      adjusted,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "ADJUST_MAX_ENERGY",
          side: "player",
          amount: 2,
        },
      },
      battleInit,
    );

    const scoreAdjusted = applyBattleCommand(
      maxAdjusted,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "ADJUST_SCORE",
          side: "enemy",
          amount: 3,
        },
      },
      battleInit,
    );

    expect(scoreAdjusted.mutable.sides.player.currentEnergy).toBe(-1);
    expect(scoreAdjusted.mutable.sides.player.maxEnergy).toBe(5);
    expect(scoreAdjusted.mutable.sides.enemy.score).toBe(7);
  });

  it("uses the documented kindle fallback targeting order", () => {
    const { battleInit, state } = createTestBattle();
    const preferredReserveCardId = state.sides.player.hand[0];
    const leftmostDeployedCardId = state.sides.player.hand[1];
    const leftmostReserveCardId = state.sides.player.hand[2];

    state.sides.player.hand = state.sides.player.hand.slice(3);
    state.sides.player.reserve.R2 = preferredReserveCardId;
    state.sides.player.deployed.D1 = leftmostDeployedCardId;
    state.sides.player.reserve.R1 = leftmostReserveCardId;

    const preferredKindle = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "KINDLE",
          side: "player",
          amount: 2,
          preferredBattleCardId: preferredReserveCardId,
        },
      },
      battleInit,
    );

    expect(preferredKindle.mutable.cardInstances[preferredReserveCardId].sparkDelta).toBe(2);

    const deployedFallback = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "KINDLE",
          side: "player",
          amount: 1,
          preferredBattleCardId: state.sides.enemy.hand[0],
        },
      },
      battleInit,
    );

    expect(deployedFallback.mutable.cardInstances[leftmostDeployedCardId].sparkDelta).toBe(1);
    expect(deployedFallback.mutable.cardInstances[leftmostReserveCardId].sparkDelta).toBe(0);

    state.sides.player.deployed.D1 = null;
    const reserveFallback = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "KINDLE",
          side: "player",
          amount: 3,
        },
      },
      battleInit,
    );

    expect(reserveFallback.mutable.cardInstances[leftmostReserveCardId].sparkDelta).toBe(3);

    state.sides.player.reserve.R1 = null;
    state.sides.player.reserve.R2 = null;
    const noOp = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "KINDLE",
          side: "player",
          amount: 4,
        },
      },
      battleInit,
    );

    expect(noOp.history.past).toHaveLength(0);
  });

  it("reveals and hides opponent hand cards through visibility debug edits", () => {
    const { battleInit, state } = createTestBattle();
    const enemyHandCardId = state.sides.enemy.hand[0];

    expect(state.cardInstances[enemyHandCardId].isRevealedToPlayer).toBe(false);

    const revealed = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_CARD_VISIBILITY",
          battleCardId: enemyHandCardId,
          isRevealedToPlayer: true,
        },
      },
      battleInit,
    );

    expect(revealed.mutable.cardInstances[enemyHandCardId].isRevealedToPlayer).toBe(true);
    expect(revealed.history.past[0].metadata.commandId).toBe("REVEAL_OPPONENT_HAND_CARD");

    const hidden = applyBattleCommand(
      revealed,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_CARD_VISIBILITY",
          battleCardId: enemyHandCardId,
          isRevealedToPlayer: false,
        },
      },
      battleInit,
    );

    expect(hidden.mutable.cardInstances[enemyHandCardId].isRevealedToPlayer).toBe(false);
    expect(hidden.history.past[1].metadata.commandId).toBe("HIDE_OPPONENT_HAND_CARD");
  });

  it("stamps the spec-recommended command envelope on dispatched commands", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];

    const before = Date.now();
    const handCommand = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "PLAY_CARD",
        battleCardId,
        sourceSurface: "hand-tray",
      },
      battleInit,
    );
    const after = Date.now();

    const metadata = handCommand.history.past[0].metadata;
    expect(metadata.commandId).toBe("PLAY_CARD");
    expect(metadata.kind).toBe("zone-move");
    expect(metadata.actor).toBe("player");
    expect(metadata.sourceSurface).toBe("hand-tray");
    expect(metadata.targets).toEqual([{ kind: "card", ref: battleCardId }]);
    expect(metadata.undoPayload).toBeNull();
    expect(metadata.timestamp).toBeGreaterThanOrEqual(before);
    expect(metadata.timestamp).toBeLessThanOrEqual(after);

    const enemyCardId = state.sides.enemy.hand[0];
    state.cardInstances[enemyCardId].isRevealedToPlayer = true;
    const visibilityCommand = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_CARD_VISIBILITY",
          battleCardId: enemyCardId,
          isRevealedToPlayer: false,
        },
        sourceSurface: "zone-browser-hand",
      },
      battleInit,
    );
    const visibilityMetadata = visibilityCommand.history.past[0].metadata;
    expect(visibilityMetadata.kind).toBe("visibility");
    expect(visibilityMetadata.actor).toBe("debug");
    expect(visibilityMetadata.sourceSurface).toBe("zone-browser-hand");
    expect(visibilityMetadata.targets).toEqual([
      { kind: "card", ref: enemyCardId },
    ]);

    const energyCommand = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "ADJUST_CURRENT_ENERGY",
          side: "player",
          amount: 1,
        },
        sourceSurface: "inspector",
      },
      battleInit,
    );
    const energyMetadata = energyCommand.history.past[0].metadata;
    expect(energyMetadata.kind).toBe("numeric-state");
    expect(energyMetadata.sourceSurface).toBe("inspector");
    expect(energyMetadata.targets).toEqual([{ kind: "side", ref: "player" }]);

    const forceCommand = applyBattleCommand(
      createBattleReducerState(state),
      { id: "FORCE_RESULT", result: "defeat" },
      battleInit,
    );
    const forceMetadata = forceCommand.history.past[0].metadata;
    expect(forceMetadata.kind).toBe("result");
    expect(forceMetadata.isComposite).toBe(true);
    expect(forceMetadata.actor).toBe("debug");
    expect(forceMetadata.targets).toEqual([]);
  });

  it("commits ADD_CARD_NOTE metadata and emits a note-added log event", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];
    const cardName = state.cardInstances[battleCardId].definition.name;
    const applied = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "ADD_CARD_NOTE",
          battleCardId,
          noteId: "note_test_1",
          text: "watch for dissolve",
          createdAtMs: 1700,
          expiry: { kind: "manual" },
        },
        sourceSurface: "note-editor",
      },
      battleInit,
    );

    const metadata = applied.history.past[0].metadata;
    expect(metadata.commandId).toBe("ADD_CARD_NOTE");
    expect(metadata.label).toBe(`Add Note to ${cardName}`);
    expect(metadata.kind).toBe("card-instance");
    expect(metadata.isComposite).toBe(false);
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("note-editor");
    expect(metadata.targets).toEqual([{ kind: "card", ref: battleCardId }]);
    expect(metadata.undoPayload).toBeNull();

    const noteEvent = applied.lastTransition?.logEvents.find(
      (event) => event.event === "battle_proto_note_added",
    );
    expect(noteEvent).toBeDefined();
    expect(noteEvent?.fields).toMatchObject({
      battleCardId,
      noteId: "note_test_1",
      text: "watch for dissolve",
      expiryKind: "manual",
      expirySide: null,
      expiryTurnNumber: null,
    });
    expect(applied.mutable.cardInstances[battleCardId].notes).toHaveLength(1);
    expect(applied.mutable.cardInstances[battleCardId].notes[0].noteId).toBe(
      "note_test_1",
    );
  });

  it("commits DISMISS_CARD_NOTE metadata and removes the targeted note", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];
    const cardName = state.cardInstances[battleCardId].definition.name;
    const withNote = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "ADD_CARD_NOTE",
          battleCardId,
          noteId: "note_to_dismiss",
          text: "ignore",
          createdAtMs: 10,
          expiry: { kind: "manual" },
        },
      },
      battleInit,
    );

    const applied = applyBattleCommand(
      withNote,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "DISMISS_CARD_NOTE",
          battleCardId,
          noteId: "note_to_dismiss",
        },
        sourceSurface: "inspector",
      },
      battleInit,
    );

    const metadata = applied.history.past[1].metadata;
    expect(metadata.commandId).toBe("DISMISS_CARD_NOTE");
    expect(metadata.label).toBe(`Dismiss Note on ${cardName}`);
    expect(metadata.kind).toBe("card-instance");
    expect(metadata.isComposite).toBe(false);
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("inspector");
    expect(metadata.targets).toEqual([{ kind: "card", ref: battleCardId }]);
    expect(metadata.undoPayload).toBeNull();

    expect(applied.mutable.cardInstances[battleCardId].notes).toHaveLength(0);
    const event = applied.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_note_dismissed",
    );
    expect(event?.fields).toMatchObject({
      battleCardId,
      noteId: "note_to_dismiss",
    });
  });

  it("commits CLEAR_CARD_NOTES metadata with the pre-clear note count", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];
    const cardName = state.cardInstances[battleCardId].definition.name;
    let current = createBattleReducerState(state);
    current = applyBattleCommand(
      current,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "ADD_CARD_NOTE",
          battleCardId,
          noteId: "note_a",
          text: "a",
          createdAtMs: 1,
          expiry: { kind: "manual" },
        },
      },
      battleInit,
    );
    current = applyBattleCommand(
      current,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "ADD_CARD_NOTE",
          battleCardId,
          noteId: "note_b",
          text: "b",
          createdAtMs: 2,
          expiry: { kind: "manual" },
        },
      },
      battleInit,
    );

    const cleared = applyBattleCommand(
      current,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "CLEAR_CARD_NOTES",
          battleCardId,
        },
        sourceSurface: "inspector",
      },
      battleInit,
    );

    const metadata = cleared.history.past[2].metadata;
    expect(metadata.commandId).toBe("CLEAR_CARD_NOTES");
    expect(metadata.label).toBe(`Clear Notes on ${cardName}`);
    expect(metadata.kind).toBe("card-instance");
    expect(metadata.isComposite).toBe(false);
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("inspector");
    expect(metadata.targets).toEqual([{ kind: "card", ref: battleCardId }]);
    expect(metadata.undoPayload).toBeNull();

    expect(cleared.mutable.cardInstances[battleCardId].notes).toHaveLength(0);
    const event = cleared.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_note_cleared",
    );
    expect(event?.fields).toMatchObject({
      battleCardId,
      noteCount: 2,
    });
  });

  it("commits SET_CARD_MARKERS metadata with a diff payload", () => {
    const { battleInit, state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];
    const cardName = state.cardInstances[battleCardId].definition.name;
    const applied = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_CARD_MARKERS",
          battleCardId,
          markers: { isPrevented: true, isCopied: false },
        },
        sourceSurface: "inspector",
      },
      battleInit,
    );

    const metadata = applied.history.past[0].metadata;
    expect(metadata.commandId).toBe("SET_CARD_MARKERS");
    expect(metadata.label).toBe(`Mark ${cardName} Prevented`);
    expect(metadata.kind).toBe("card-instance");
    expect(metadata.isComposite).toBe(false);
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("inspector");
    expect(metadata.targets).toEqual([{ kind: "card", ref: battleCardId }]);
    expect(metadata.undoPayload).toBeNull();

    expect(applied.mutable.cardInstances[battleCardId].markers).toEqual({
      isPrevented: true,
      isCopied: false,
    });
    const event = applied.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_marker_set",
    );
    expect(event?.fields).toMatchObject({
      battleCardId,
      markers: { isPrevented: true, isCopied: false },
      diff: { prevented: "set", copied: "unchanged" },
    });
  });

  it("commits CREATE_CARD_COPY metadata and emits a card-created log event", () => {
    const { battleInit, state } = createTestBattle();
    const sourceBattleCardId = state.sides.player.hand[0];
    const sourceName = state.cardInstances[sourceBattleCardId].definition.name;
    const previousOrdinal = state.nextBattleCardOrdinal;
    const applied = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "CREATE_CARD_COPY",
          sourceBattleCardId,
          destination: { side: "player", zone: "hand" },
          createdAtMs: 42,
        },
        sourceSurface: "inspector",
      },
      battleInit,
    );

    const metadata = applied.history.past[0].metadata;
    expect(metadata.commandId).toBe("CREATE_CARD_COPY");
    expect(metadata.label).toBe(`Create Copy of ${sourceName}`);
    expect(metadata.kind).toBe("zone-move");
    // bug-075: CREATE_CARD_COPY is composite (mints instance + bumps
    // ordinal + inserts into target zone).
    expect(metadata.isComposite).toBe(true);
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("inspector");
    expect(metadata.targets).toEqual([
      { kind: "card", ref: sourceBattleCardId },
      { kind: "zone", ref: "player:hand" },
    ]);
    expect(metadata.undoPayload).toBeNull();

    expect(applied.mutable.nextBattleCardOrdinal).toBe(previousOrdinal + 1);
    const mintedId = `bc_${String(previousOrdinal).padStart(4, "0")}`;
    const minted = applied.mutable.cardInstances[mintedId];
    expect(minted).toBeDefined();
    expect(minted.provenance.kind).toBe("generated-copy");
    expect(minted.provenance.sourceBattleCardId).toBe(sourceBattleCardId);
    expect(minted.provenance.createdAtMs).toBe(42);
    expect(minted.markers).toEqual({ isPrevented: false, isCopied: false });
    expect(minted.notes).toEqual([]);
    expect(applied.mutable.sides.player.hand).toContain(mintedId);

    const event = applied.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_card_created",
    );
    expect(event?.fields).toMatchObject({
      battleCardId: mintedId,
      provenanceKind: "generated-copy",
      sourceBattleCardId,
      destinationZone: "player:hand",
      name: sourceName,
      ownerSide: "player",
      subtype: state.cardInstances[sourceBattleCardId].definition.subtype,
    });
  });

  it("commits CREATE_FIGMENT metadata and emits a figment-created log event", () => {
    const { battleInit, state } = createTestBattle();
    const previousOrdinal = state.nextBattleCardOrdinal;
    const applied = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "CREATE_FIGMENT",
          side: "player",
          chosenSubtype: "Wisp",
          chosenSpark: 3,
          name: "Test Figment",
          destination: { side: "player", zone: "reserve", slotId: "R0" },
          createdAtMs: 123,
        },
        sourceSurface: "figment-creator",
      },
      battleInit,
    );

    const metadata = applied.history.past[0].metadata;
    expect(metadata.commandId).toBe("CREATE_FIGMENT");
    expect(metadata.label).toBe("Create Figment (Wisp/3)");
    expect(metadata.kind).toBe("zone-move");
    // bug-075: CREATE_FIGMENT is composite (mints instance + bumps ordinal +
    // inserts into target zone).
    expect(metadata.isComposite).toBe(true);
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("figment-creator");
    expect(metadata.targets).toEqual([
      { kind: "side", ref: "player" },
      { kind: "slot", ref: "player:reserve:R0" },
    ]);
    expect(metadata.undoPayload).toBeNull();

    const mintedId = `bc_${String(previousOrdinal).padStart(4, "0")}`;
    const minted = applied.mutable.cardInstances[mintedId];
    expect(minted.provenance.kind).toBe("generated-figment");
    expect(minted.provenance.chosenSubtype).toBe("Wisp");
    expect(minted.provenance.chosenSpark).toBe(3);
    expect(minted.provenance.sourceBattleCardId).toBeNull();
    expect(minted.definition.name).toBe("Test Figment");
    expect(minted.definition.subtype).toBe("Wisp");
    expect(minted.definition.printedSpark).toBe(3);
    expect(minted.definition.cardNumber).toBe(0);
    expect(minted.definition.imageNumber).toBe(0);
    expect(minted.definition.battleCardKind).toBe("character");
    expect(minted.definition.energyCost).toBe(0);
    expect(minted.definition.tides).toEqual([]);
    expect(applied.mutable.sides.player.reserve.R0).toBe(mintedId);

    const event = applied.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_card_created",
    );
    expect(event?.fields).toMatchObject({
      battleCardId: mintedId,
      provenanceKind: "generated-figment",
      sourceBattleCardId: null,
      destinationZone: "player:reserve:R0",
      name: "Test Figment",
      ownerSide: "player",
      printedSpark: 3,
      subtype: "Wisp",
    });
  });

  it("commits REORDER_DECK metadata and emits a deck-reordered log event", () => {
    const { battleInit, state } = createTestBattle();
    const originalDeck = [...state.sides.player.deck];
    const reorderedDeck = [...originalDeck];
    const lastIndex = reorderedDeck.length - 1;
    [reorderedDeck[0], reorderedDeck[lastIndex]] = [
      reorderedDeck[lastIndex],
      reorderedDeck[0],
    ];
    const applied = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "REORDER_DECK",
          side: "player",
          order: reorderedDeck,
        },
        sourceSurface: "deck-order-picker",
      },
      battleInit,
    );

    const metadata = applied.history.past[0].metadata;
    expect(metadata.commandId).toBe("REORDER_DECK");
    expect(metadata.label).toBe("Reorder Player Deck");
    expect(metadata.kind).toBe("zone-move");
    expect(metadata.isComposite).toBe(false);
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("deck-order-picker");
    expect(metadata.targets).toEqual([
      { kind: "side", ref: "player" },
      { kind: "zone", ref: "player:deck" },
    ]);
    expect(metadata.undoPayload).toBeNull();
    expect(applied.mutable.sides.player.deck).toEqual(reorderedDeck);

    const event = applied.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_deck_reordered",
    );
    expect(event?.fields).toMatchObject({
      side: "player",
      orderBefore: originalDeck,
      orderAfter: reorderedDeck,
    });
  });

  it("commits REVEAL_DECK_TOP metadata and flips the deck-top isRevealedToPlayer flag", () => {
    const { battleInit, state } = createTestBattle();
    const topOne = state.sides.enemy.deck[0];
    const topTwo = state.sides.enemy.deck[1];
    expect(state.cardInstances[topOne].isRevealedToPlayer).toBe(false);
    expect(state.cardInstances[topTwo].isRevealedToPlayer).toBe(false);

    const applied = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "REVEAL_DECK_TOP",
          side: "enemy",
          count: 2,
        },
        sourceSurface: "foresee-overlay",
      },
      battleInit,
    );

    const metadata = applied.history.past[0].metadata;
    expect(metadata.commandId).toBe("REVEAL_DECK_TOP");
    expect(metadata.label).toBe("Reveal Top 2 of Enemy Deck");
    expect(metadata.kind).toBe("visibility");
    expect(metadata.isComposite).toBe(false);
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("foresee-overlay");
    expect(metadata.targets).toEqual([{ kind: "zone", ref: "enemy:deck" }]);
    expect(metadata.undoPayload).toBeNull();

    expect(applied.mutable.cardInstances[topOne].isRevealedToPlayer).toBe(true);
    expect(applied.mutable.cardInstances[topTwo].isRevealedToPlayer).toBe(true);
    // Third card in the deck must remain hidden.
    const topThree = state.sides.enemy.deck[2];
    expect(applied.mutable.cardInstances[topThree].isRevealedToPlayer).toBe(false);
  });

  it("commits PLAY_FROM_DECK_TOP as one composite entry and materialises the top card", () => {
    const { battleInit, state } = createTestBattle();
    const characterBattleCardId = state.sides.player.hand.find((cardId) =>
      state.cardInstances[cardId].definition.battleCardKind === "character",
    );
    if (characterBattleCardId === undefined) {
      throw new Error("No character available to seed deck top");
    }
    state.sides.player.hand = state.sides.player.hand.filter(
      (cardId) => cardId !== characterBattleCardId,
    );
    state.sides.player.deck = [characterBattleCardId, ...state.sides.player.deck];

    const applied = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "PLAY_FROM_DECK_TOP",
          side: "player",
        },
        sourceSurface: "foresee-overlay",
      },
      battleInit,
    );

    const metadata = applied.history.past[0].metadata;
    expect(metadata.commandId).toBe("PLAY_FROM_DECK_TOP");
    expect(metadata.label).toBe("Play Top of Player Deck");
    expect(metadata.kind).toBe("zone-move");
    expect(metadata.isComposite).toBe(true);
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("foresee-overlay");
    expect(metadata.undoPayload).toBeNull();
    expect(metadata.targets).toEqual([
      { kind: "side", ref: "player" },
      { kind: "zone", ref: "player:deck" },
    ]);

    expect(applied.mutable.sides.player.deck).not.toContain(characterBattleCardId);
    expect(applied.mutable.sides.player.hand).not.toContain(characterBattleCardId);
    expect(applied.mutable.sides.player.reserve.R0).toBe(characterBattleCardId);
  });

  it("commits FORCE_JUDGMENT as one composite entry and bakes in judgment resolution", () => {
    const { battleInit, state } = createTestBattle();
    const playerCharacter = state.sides.player.hand.find((cardId) =>
      state.cardInstances[cardId].definition.battleCardKind === "character",
    );
    const enemyCharacter = state.sides.enemy.hand.find((cardId) =>
      state.cardInstances[cardId].definition.battleCardKind === "character",
    );
    if (playerCharacter === undefined || enemyCharacter === undefined) {
      throw new Error("Missing characters for force-judgment seed");
    }
    state.sides.player.hand = state.sides.player.hand.filter((cardId) => cardId !== playerCharacter);
    state.sides.enemy.hand = state.sides.enemy.hand.filter((cardId) => cardId !== enemyCharacter);
    state.sides.player.deployed.D0 = playerCharacter;
    state.sides.enemy.deployed.D0 = enemyCharacter;
    // Give player higher spark so judgment dissolves the enemy character.
    state.cardInstances[playerCharacter].sparkDelta =
      10 - state.cardInstances[playerCharacter].definition.printedSpark;
    state.cardInstances[enemyCharacter].sparkDelta =
      1 - state.cardInstances[enemyCharacter].definition.printedSpark;

    const applied = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "FORCE_JUDGMENT",
          side: "player",
        },
        sourceSurface: "action-bar",
      },
      battleInit,
    );

    const metadata = applied.history.past[0].metadata;
    expect(metadata.commandId).toBe("FORCE_JUDGMENT");
    expect(metadata.label).toBe("Force Judgment (Player)");
    expect(metadata.kind).toBe("battle-flow");
    expect(metadata.isComposite).toBe(true);
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("action-bar");
    expect(metadata.targets).toEqual([{ kind: "side", ref: "player" }]);
    expect(metadata.undoPayload).toBeNull();

    expect(applied.history.past).toHaveLength(1);
    expect(applied.mutable.sides.enemy.deployed.D0).toBeNull();
    expect(applied.mutable.sides.enemy.void).toContain(enemyCharacter);
    expect(applied.mutable.sides.player.score).toBeGreaterThan(state.sides.player.score);

    const extraJudgmentEvent = applied.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_extra_judgment",
    );
    expect(extraJudgmentEvent?.fields).toMatchObject({
      resolvedSide: "player",
      forced: true,
    });
    expect(extraJudgmentEvent?.fields.dissolvedCardIds).toEqual([enemyCharacter]);
  });

  it("commits GRANT_EXTRA_TURN metadata and increments pendingExtraTurns", () => {
    const { battleInit, state } = createTestBattle();
    const applied = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "GRANT_EXTRA_TURN",
          side: "player",
        },
        sourceSurface: "inspector",
      },
      battleInit,
    );

    const metadata = applied.history.past[0].metadata;
    expect(metadata.commandId).toBe("GRANT_EXTRA_TURN");
    expect(metadata.label).toBe("Grant Extra Turn to Player");
    expect(metadata.kind).toBe("battle-flow");
    expect(metadata.isComposite).toBe(false);
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("inspector");
    expect(metadata.targets).toEqual([{ kind: "side", ref: "player" }]);
    expect(metadata.undoPayload).toBeNull();

    expect(applied.mutable.sides.player.pendingExtraTurns).toBe(1);
    const event = applied.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_extra_turn_granted",
    );
    expect(event?.fields).toMatchObject({
      grantedSide: "player",
      pendingExtraTurnsAfter: 1,
    });
  });

  it("commits SET_SIDE_HAND_VISIBILITY metadata and emits a bulk visibility log event", () => {
    const { battleInit, state } = createTestBattle();
    const enemyHand = [...state.sides.enemy.hand];
    for (const battleCardId of enemyHand) {
      state.cardInstances[battleCardId].isRevealedToPlayer = true;
    }
    const applied = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_SIDE_HAND_VISIBILITY",
          side: "enemy",
          isRevealedToPlayer: false,
        },
        sourceSurface: "side-summary",
      },
      battleInit,
    );

    const metadata = applied.history.past[0].metadata;
    expect(metadata.commandId).toBe("HIDE_ALL_ENEMY_HAND_CARDS");
    expect(metadata.label).toBe("Hide All Enemy Hand Cards");
    expect(metadata.kind).toBe("visibility");
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("side-summary");
    expect(metadata.targets).toEqual([{ kind: "zone", ref: "enemy:hand" }]);

    for (const battleCardId of enemyHand) {
      expect(applied.mutable.cardInstances[battleCardId]?.isRevealedToPlayer).toBe(false);
    }

    const event = applied.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_hand_visibility_set",
    );
    expect(event?.fields).toMatchObject({
      affectedCount: enemyHand.length,
      isRevealedToPlayer: false,
      side: "enemy",
      sourceSurface: "side-summary",
    });
  });

  it("keeps enemy cards drawn through the debug draw action hidden", () => {
    const { battleInit, state } = createTestBattle();
    const drawnCardId = state.sides.enemy.deck[0];
    if (drawnCardId === undefined) {
      throw new Error("expected enemy deck to contain a card");
    }
    state.cardInstances[drawnCardId].isRevealedToPlayer = false;

    const applied = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "DRAW_CARD",
          side: "enemy",
        },
        sourceSurface: "inspector",
      },
      battleInit,
    );

    expect(applied.mutable.sides.enemy.hand).toContain(drawnCardId);
    expect(applied.mutable.cardInstances[drawnCardId].isRevealedToPlayer).toBe(false);
  });

  it("routes each debug edit to its spec history-kind category", () => {
    const { battleInit, state } = createTestBattle();
    const moveCardId = state.sides.player.hand[0];
    const battlefieldCardA = state.sides.player.hand[1];
    const battlefieldCardB = state.sides.enemy.hand[0];
    state.sides.player.hand = state.sides.player.hand.filter((cardId) =>
      cardId !== battlefieldCardA,
    );
    state.sides.enemy.hand = state.sides.enemy.hand.filter((cardId) =>
      cardId !== battlefieldCardB,
    );
    state.sides.player.deployed.D0 = battlefieldCardA;
    state.sides.enemy.deployed.D0 = battlefieldCardB;

    const zoneMove = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: moveCardId,
          destination: { side: "player", zone: "void" },
        },
      },
      battleInit,
    );
    expect(zoneMove.history.past[0].metadata.kind).toBe("zone-move");

    const swap = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SWAP_BATTLEFIELD_SLOTS",
          source: { side: "player", zone: "deployed", slotId: "D0" },
          target: { side: "enemy", zone: "deployed", slotId: "D0" },
        },
      },
      battleInit,
    );
    expect(swap.history.past[0].metadata.kind).toBe("battlefield-position");

    const spark = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_CARD_SPARK_DELTA",
          battleCardId: battlefieldCardA,
          value: 3,
        },
      },
      battleInit,
    );
    expect(spark.history.past[0].metadata.kind).toBe("card-instance");
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

  return {
    battleInit,
    state: createInitialBattleState(battleInit),
  };
}
