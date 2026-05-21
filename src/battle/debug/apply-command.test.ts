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
    const { state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];
    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId,
          destination: { side: "player", zone: "reserve", slotId: "R0" },
        },
      },
    );

    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.history.past[0].metadata.commandId).toBe("MOVE_CARD_TO_ZONE");
    expect(reduced.history.past[0].metadata.label).toContain("Move ");
    expect(reduced.history.past[0].metadata.kind).toBe("zone-move");
    expect(reduced.history.past[0].metadata.actor).toBe("debug");
    expect(reduced.history.past[0].metadata.targets[0]).toEqual(
      { kind: "card", ref: battleCardId },
    );
    expect(typeof reduced.history.past[0].metadata.timestamp).toBe("number");
    expect(reduced.history.past[0].metadata.undoPayload).toBeNull();
  });

  it("preserves SKIP_TO_REWARDS identity while forcing a victory result", () => {
    const { state } = createTestBattle();
    const reduced = applyBattleCommand(
      createBattleReducerState(state),
      { id: "SKIP_TO_REWARDS" },
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
    const { state } = createTestBattle();
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
    );

    expect(toReserve.mutable.sides.player.void).not.toContain(battleCardId);
    expect(toReserve.mutable.sides.player.reserve.R0).toBe(battleCardId);
  });

  it("moves a hand card onto the stack as a zero-cost stack entry", () => {
    const { state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];

    const toStack = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId,
          destination: {
            side: "player",
            zone: "stack",
          },
        },
      },
    );

    expect(toStack.mutable.sides.player.hand).not.toContain(battleCardId);
    expect(toStack.mutable.stack).toHaveLength(1);
    const stackEntry = toStack.mutable.stack?.[0];
    expect(stackEntry?.battleCardId).toBe(battleCardId);
    expect(stackEntry?.side).toBe("player");
    expect(stackEntry?.paidCost).toBe(0);
    expect(typeof stackEntry?.stackEntryId).toBe("string");

    const toVoid = applyBattleCommand(
      toStack,
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
    );

    expect(toVoid.mutable.stack).toEqual([]);
    expect(toVoid.mutable.sides.player.void).toContain(battleCardId);
  });

  it("places debug-moved cards on the top or bottom of the deck in the requested order", () => {
    const { state } = createTestBattle();
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
    const { state } = createTestBattle();
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
    );

    const filled = applyBattleCommand(
      maxAdjusted,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "INCREASE_MAX_ENERGY_AND_FILL",
          side: "player",
        },
      },
    );

    const scoreAdjusted = applyBattleCommand(
      filled,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "ADJUST_SCORE",
          side: "enemy",
          amount: 3,
        },
      },
    );

    expect(scoreAdjusted.mutable.sides.player.currentEnergy).toBe(6);
    expect(scoreAdjusted.mutable.sides.player.maxEnergy).toBe(6);
    expect(scoreAdjusted.mutable.sides.enemy.score).toBe(7);
  });

  it("uses the documented kindle fallback targeting order", () => {
    const { state } = createTestBattle();
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
    );

    expect(noOp.history.past).toHaveLength(0);
  });

  it("reveals and hides opponent hand cards through visibility debug edits", () => {
    const { state } = createTestBattle();
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
    );

    expect(hidden.mutable.cardInstances[enemyHandCardId].isRevealedToPlayer).toBe(false);
    expect(hidden.history.past[1].metadata.commandId).toBe("HIDE_OPPONENT_HAND_CARD");
  });

  it("stamps the spec-recommended command envelope on dispatched commands", () => {
    const { state } = createTestBattle();
    const battleCardId = state.sides.player.hand[0];

    const before = Date.now();
    const handCommand = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId,
          destination: { side: "player", zone: "reserve", slotId: "R0" },
        },
        sourceSurface: "hand-tray",
      },
    );
    const after = Date.now();

    const metadata = handCommand.history.past[0].metadata;
    expect(metadata.commandId).toBe("MOVE_CARD_TO_ZONE");
    expect(metadata.kind).toBe("zone-move");
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("hand-tray");
    expect(metadata.targets[0]).toEqual({ kind: "card", ref: battleCardId });
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
    );
    const energyMetadata = energyCommand.history.past[0].metadata;
    expect(energyMetadata.kind).toBe("numeric-state");
    expect(energyMetadata.sourceSurface).toBe("inspector");
    expect(energyMetadata.targets).toEqual([{ kind: "side", ref: "player" }]);

    const forceCommand = applyBattleCommand(
      createBattleReducerState(state),
      { id: "FORCE_RESULT", result: "defeat" },
    );
    const forceMetadata = forceCommand.history.past[0].metadata;
    expect(forceMetadata.kind).toBe("result");
    expect(forceMetadata.isComposite).toBe(true);
    expect(forceMetadata.actor).toBe("debug");
    expect(forceMetadata.targets).toEqual([]);
  });

  it("commits ADD_CARD_NOTE metadata and emits a note-added log event", () => {
    const { state } = createTestBattle();
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
    const { state } = createTestBattle();
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
    const { state } = createTestBattle();
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
    const { state } = createTestBattle();
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
    const { state } = createTestBattle();
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
    const { state } = createTestBattle();
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
      figmentCount: 1,
      name: "Test Figment",
      ownerSide: "player",
      printedSpark: 3,
      subtype: "Wisp",
    });
  });

  it("stacks matching figments for the same side instead of creating a second battlefield card", () => {
    const { state } = createTestBattle();
    const first = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "CREATE_FIGMENT",
          side: "player",
          chosenSubtype: "Shadow",
          chosenSpark: 1,
          name: "Shadow Figment",
          destination: { side: "player", zone: "reserve", slotId: "R0" },
          createdAtMs: 1,
        },
        sourceSurface: "figment-creator",
      },
    );
    const firstFigmentId = first.mutable.sides.player.reserve.R0;
    if (firstFigmentId === null) {
      throw new Error("Expected first Shadow Figment in R0");
    }

    const second = applyBattleCommand(
      first,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "CREATE_FIGMENT",
          side: "player",
          chosenSubtype: "Shadow",
          chosenSpark: 1,
          name: "Shadow Figment",
          destination: { side: "player", zone: "reserve", slotId: "R1" },
          createdAtMs: 2,
        },
        sourceSurface: "figment-creator",
      },
    );

    expect(second.mutable.sides.player.reserve.R0).toBe(firstFigmentId);
    expect(second.mutable.sides.player.reserve.R1).toBeNull();
    expect(second.mutable.cardInstances[firstFigmentId].figmentCount).toBe(2);
    expect(Object.values(second.mutable.sides.player.reserve).filter((cardId) => {
      if (cardId === null) return false;
      return second.mutable.cardInstances[cardId].definition.subtype === "Shadow";
    })).toHaveLength(1);
    expect(second.lastTransition?.logEvents.find(
      (entry) => entry.event === "battle_proto_card_created",
    )?.fields).toMatchObject({
      battleCardId: firstFigmentId,
      destinationZone: "player:reserve:R0",
      figmentCount: 2,
      subtype: "Shadow",
    });
  });

  it("keeps different figment types as separate battlefield cards", () => {
    const { state } = createTestBattle();
    const first = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "CREATE_FIGMENT",
          side: "player",
          chosenSubtype: "Shadow",
          chosenSpark: 1,
          name: "Shadow Figment",
          destination: { side: "player", zone: "reserve", slotId: "R0" },
          createdAtMs: 1,
        },
      },
    );
    const second = applyBattleCommand(
      first,
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "CREATE_FIGMENT",
          side: "player",
          chosenSubtype: "Warrior",
          chosenSpark: 1,
          name: "Warrior Figment",
          destination: { side: "player", zone: "reserve", slotId: "R1" },
          createdAtMs: 2,
        },
      },
    );

    expect(second.mutable.sides.player.reserve.R0).toMatch(/^bc_/);
    expect(second.mutable.sides.player.reserve.R1).toMatch(/^bc_/);
    expect(second.mutable.sides.player.reserve.R1).not.toBe(second.mutable.sides.player.reserve.R0);
    expect(second.mutable.cardInstances[second.mutable.sides.player.reserve.R0 ?? ""].definition.subtype).toBe("Shadow");
    expect(second.mutable.cardInstances[second.mutable.sides.player.reserve.R1 ?? ""].definition.subtype).toBe("Warrior");
  });

  it("commits REORDER_DECK metadata and emits a deck-reordered log event", () => {
    const { state } = createTestBattle();
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
    const { state } = createTestBattle();
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
    const { state } = createTestBattle();
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

  it("commits SET_PHASE metadata and changes only the phase label", () => {
    const { state } = createTestBattle();
    const before = createBattleReducerState(state).mutable;
    const applied = applyBattleCommand(
      createBattleReducerState(state),
      {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_PHASE",
          phase: "dusk",
        },
        sourceSurface: "action-bar",
      },
    );

    const metadata = applied.history.past[0].metadata;
    expect(metadata.commandId).toBe("SET_PHASE");
    expect(metadata.label).toBe("Set Phase to Dusk");
    expect(metadata.kind).toBe("battle-flow");
    expect(metadata.isComposite).toBe(false);
    expect(metadata.actor).toBe("debug");
    expect(metadata.sourceSurface).toBe("action-bar");
    expect(metadata.targets).toEqual([]);
    expect(metadata.undoPayload).toBeNull();

    expect(applied.history.past).toHaveLength(1);
    // SET_PHASE touches nothing but the phase label.
    expect(applied.mutable.phase).toBe("dusk");
    expect(applied.mutable.activeSide).toBe(before.activeSide);
    expect(applied.mutable.turnNumber).toBe(before.turnNumber);
    expect(applied.mutable.result).toBe(before.result);
    expect(applied.mutable.sides.player.currentEnergy).toBe(before.sides.player.currentEnergy);
    expect(applied.mutable.sides.player.maxEnergy).toBe(before.sides.player.maxEnergy);
    expect(applied.mutable.sides.player.score).toBe(before.sides.player.score);
    expect(applied.mutable.sides.player.hand).toEqual(before.sides.player.hand);
    expect(applied.mutable.sides.player.deck).toEqual(before.sides.player.deck);
    expect(applied.mutable.sides.player.deployed).toEqual(before.sides.player.deployed);
    expect(applied.mutable.sides.player.reserve).toEqual(before.sides.player.reserve);
    expect(applied.mutable.sides.enemy.deployed).toEqual(before.sides.enemy.deployed);
    expect(applied.lastTransition?.logEvents).toEqual([]);
  });

  it("commits SET_SIDE_HAND_VISIBILITY metadata and emits a bulk visibility log event", () => {
    const { state } = createTestBattle();
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
    const { state } = createTestBattle();
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
    );

    expect(applied.mutable.sides.enemy.hand).toContain(drawnCardId);
    expect(applied.mutable.cardInstances[drawnCardId].isRevealedToPlayer).toBe(false);
  });

  it("routes each debug edit to its spec history-kind category", () => {
    const { state } = createTestBattle();
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
