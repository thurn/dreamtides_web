import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import type { BattleCommand } from "../debug/commands";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import type { BattleInit, BattleMutableState } from "../types";
import {
  battleControllerReducer,
  createBattleControllerState,
} from "./controller";
import { createInitialBattleState } from "./create-initial-state";

/**
 * Undo round-trip coverage for every debug command emitted by the battle
 * inspector and zone browser (spec §M-10, §M-11, Bug 029). For each command
 * we snapshot the pre-apply state, apply the command, then dispatch UNDO
 * and assert the mutable state is byte-equivalent to the pre-state. This
 * guards against asymmetric reducer paths that mutate without recording
 * enough data in history to recover.
 */
/**
 * Regression coverage for bug-003: after a player places a hand card in R0
 * and ends the turn (which auto-runs the enemy follow-up), a single UNDO
 * must leave exactly one entry on the redo stack so REDO can replay the
 * END_TURN composite verbatim. QA observed `future="Redo0"` and a disabled
 * redo button after this sequence on Task 03 HEAD; this asserts the invariant
 * end-to-end through the controller reducer (the same path the component
 * dispatches against) so any future reducer regression that drops the
 * END_TURN frame from the redo stack trips here first.
 */
describe("END_TURN undo/redo redo-stack coverage (bug-003)", () => {
  it("redo restores END_TURN composite after a single undo", () => {
    const { battleInit, state } = createTestBattle();
    const initial = createBattleControllerState(state);
    const playerHandCardId = initial.mutable.sides.player.hand[0];

    // Step 1: place the hand card in R0 (mirrors QA step 2).
    const afterPlay = battleControllerReducer(
      initial,
      {
        type: "APPLY_COMMAND",
        command: {
          id: "DEBUG_EDIT",
          edit: {
            kind: "MOVE_CARD_TO_ZONE",
            battleCardId: playerHandCardId,
            destination: { side: "player", zone: "reserve", slotId: "R0" },
          },
        },
      },
      battleInit,
    );
    expect(afterPlay.history.past.length).toBe(1);

    // Step 2: end the turn (END_TURN composite + enemy AI follow-up).
    const afterEndTurn = battleControllerReducer(
      afterPlay,
      {
        type: "APPLY_COMMAND",
        command: { id: "END_TURN" },
      },
      battleInit,
    );
    expect(afterEndTurn.history.past.length).toBe(2);
    expect(afterEndTurn.history.future.length).toBe(0);

    // Step 3: undo once.
    const afterUndo = battleControllerReducer(
      afterEndTurn,
      { type: "UNDO" },
      battleInit,
    );

    expect(afterUndo.history.past.length).toBe(1);
    // The END_TURN frame MUST be on the redo stack so the UI re-enables the
    // redo button and "Redo1" renders in the stat readout.
    expect(afterUndo.history.future.length).toBe(1);
    expect(afterUndo.mutable).toEqual(afterPlay.mutable);

    // Step 4: redo must replay END_TURN and land on exactly the
    // post-END_TURN snapshot captured in step 2.
    const afterRedo = battleControllerReducer(
      afterUndo,
      { type: "REDO" },
      battleInit,
    );

    expect(afterRedo.history.past.length).toBe(2);
    expect(afterRedo.history.future.length).toBe(0);
    expect(afterRedo.mutable).toEqual(afterEndTurn.mutable);
  });
});

describe("Debug command undo round-trips (M-10, M-11)", () => {
  for (const { name, buildState, command } of casesFromFactory()) {
    it(`round-trips through UNDO for ${name}`, () => {
      const { battleInit, state } = buildState();
      const initial = createBattleControllerState(state);

      const applied = battleControllerReducer(
        initial,
        { type: "APPLY_COMMAND", command },
        battleInit,
      );
      // Some commands (kindle with no valid target, for example) become a
      // no-op. Assert we have actual history to undo when the test names
      // a real state change.
      expect(applied.history.past.length).toBeGreaterThan(0);

      if (name === "CREATE_CARD_COPY" || name === "CREATE_FIGMENT") {
        // The allocator bumps nextBattleCardOrdinal and inserts a fresh
        // instance; assert the apply branch actually produced a new id.
        expect(applied.mutable.nextBattleCardOrdinal).toBeGreaterThan(
          initial.mutable.nextBattleCardOrdinal,
        );
        const mintedId = `bc_${String(initial.mutable.nextBattleCardOrdinal).padStart(4, "0")}`;
        expect(applied.mutable.cardInstances[mintedId]).toBeDefined();
      }

      const undone = battleControllerReducer(
        applied,
        { type: "UNDO" },
        battleInit,
      );

      expect(undone.mutable).toEqual(initial.mutable);
      expect(undone.history.future.length).toBeGreaterThan(0);
      expect(undone.lastActivity?.kind).toBe("undo");

      if (name === "CREATE_CARD_COPY" || name === "CREATE_FIGMENT") {
        // Explicitly assert the snapshot undo reversed the allocator bump
        // and removed the minted instance from the dictionary.
        expect(undone.mutable.nextBattleCardOrdinal).toBe(
          initial.mutable.nextBattleCardOrdinal,
        );
        const mintedId = `bc_${String(initial.mutable.nextBattleCardOrdinal).padStart(4, "0")}`;
        expect(undone.mutable.cardInstances[mintedId]).toBeUndefined();
      }
    });

    it(`round-trips through UNDO + REDO for ${name} (bug-021, H-10, M-11)`, () => {
      const { battleInit, state } = buildState();
      const initial = createBattleControllerState(state);

      const applied = battleControllerReducer(
        initial,
        { type: "APPLY_COMMAND", command },
        battleInit,
      );
      expect(applied.history.past.length).toBeGreaterThan(0);

      const undone = battleControllerReducer(
        applied,
        { type: "UNDO" },
        battleInit,
      );
      expect(undone.mutable).toEqual(initial.mutable);
      expect(undone.history.future.length).toBeGreaterThan(0);

      const redone = battleControllerReducer(
        undone,
        { type: "REDO" },
        battleInit,
      );
      // Bug 021 / H-10: redo replays the recorded post-state verbatim,
      // not a fresh recomputation — so the minted card ids, scores, and
      // derived result fields on the redone mutable state must equal the
      // originally applied mutable state.
      expect(redone.mutable).toEqual(applied.mutable);
      expect(redone.history.future.length).toBe(0);
      expect(redone.lastActivity?.kind).toBe("redo");
    });
  }
});

function createTestBattle(): { battleInit: BattleInit; state: BattleMutableState } {
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

interface DebugUndoCase {
  name: string;
  buildState: () => ReturnType<typeof createTestBattle>;
  command: BattleCommand;
}

function casesFromFactory(): DebugUndoCase[] {
  const seed = createTestBattle();
  const playerHandCardId = seed.state.sides.player.hand[0];
  const enemyHandCardId = seed.state.sides.enemy.hand[0];

  return [
    {
      name: "MOVE_CARD_TO_ZONE (hand to void)",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: playerHandCardId,
          destination: { side: "player", zone: "void" },
        },
      },
    },
    {
      name: "MOVE_CARD_TO_ZONE (hand to deck top)",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: playerHandCardId,
          destination: { side: "player", zone: "deck", position: "top" },
        },
      },
    },
    {
      name: "MOVE_CARD_TO_ZONE (hand to reserve slot)",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: playerHandCardId,
          destination: { side: "player", zone: "reserve", slotId: "R0" },
        },
      },
    },
    {
      name: "DISCARD_CARD",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "DISCARD_CARD", battleCardId: playerHandCardId },
      },
    },
    {
      name: "DRAW_CARD",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "DRAW_CARD", side: "player" },
      },
    },
    {
      name: "KINDLE",
      buildState: () => {
        const fresh = createTestBattle();
        // Stage a reserve character so kindle has a deterministic target.
        const characterId = fresh.state.sides.player.hand.find((battleCardId) =>
          fresh.state.cardInstances[battleCardId].definition.battleCardKind === "character",
        );
        if (characterId === undefined) {
          throw new Error("No character in hand to stage for kindle");
        }
        fresh.state.sides.player.hand = fresh.state.sides.player.hand.filter(
          (battleCardId) => battleCardId !== characterId,
        );
        fresh.state.sides.player.reserve.R0 = characterId;
        return fresh;
      },
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "KINDLE", side: "player", amount: 2 },
      },
    },
    {
      name: "SET_CARD_SPARK_DELTA",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_CARD_SPARK_DELTA",
          battleCardId: playerHandCardId,
          value: 4,
        },
      },
    },
    {
      name: "ADJUST_SCORE",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "ADJUST_SCORE", side: "player", amount: 3 },
      },
    },
    {
      name: "ADJUST_CURRENT_ENERGY",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "ADJUST_CURRENT_ENERGY", side: "player", amount: 2 },
      },
    },
    {
      name: "ADJUST_MAX_ENERGY",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "ADJUST_MAX_ENERGY", side: "enemy", amount: 2 },
      },
    },
    {
      name: "SET_CARD_VISIBILITY",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_CARD_VISIBILITY",
          battleCardId: enemyHandCardId,
          isRevealedToPlayer: true,
        },
      },
    },
    {
      name: "SET_SIDE_HAND_VISIBILITY",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_SIDE_HAND_VISIBILITY",
          side: "enemy",
          isRevealedToPlayer: true,
        },
      },
    },
    {
      name: "SWAP_BATTLEFIELD_SLOTS",
      buildState: () => {
        const fresh = createTestBattle();
        const a = fresh.state.sides.player.hand[0];
        const b = fresh.state.sides.player.hand[1];
        fresh.state.sides.player.hand = fresh.state.sides.player.hand.slice(2);
        fresh.state.sides.player.deployed.D0 = a;
        fresh.state.sides.player.reserve.R0 = b;
        return fresh;
      },
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SWAP_BATTLEFIELD_SLOTS",
          source: { side: "player", zone: "deployed", slotId: "D0" },
          target: { side: "player", zone: "reserve", slotId: "R0" },
        },
      },
    },
    {
      name: "MOVE_CARD_TO_ZONE (hand to reserve)",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: playerHandCardId,
          destination: { side: "player", zone: "reserve", slotId: "R0" },
        },
      },
    },
    {
      name: "ADD_CARD_NOTE",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "ADD_CARD_NOTE",
          battleCardId: playerHandCardId,
          noteId: "note_undo_round_trip",
          text: "undo round-trip",
          createdAtMs: 777,
          expiry: { kind: "manual" },
        },
      },
    },
    {
      name: "DISMISS_CARD_NOTE",
      buildState: () => {
        const fresh = createTestBattle();
        fresh.state.cardInstances[playerHandCardId].notes = [
          {
            noteId: "note_to_dismiss",
            text: "dismissable",
            createdAtTurnNumber: fresh.state.turnNumber,
            createdAtSide: fresh.state.activeSide,
            createdAtMs: 1,
            expiry: { kind: "manual" },
          },
        ];
        return fresh;
      },
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "DISMISS_CARD_NOTE",
          battleCardId: playerHandCardId,
          noteId: "note_to_dismiss",
        },
      },
    },
    {
      name: "CLEAR_CARD_NOTES",
      buildState: () => {
        const fresh = createTestBattle();
        fresh.state.cardInstances[playerHandCardId].notes = [
          {
            noteId: "note_a",
            text: "a",
            createdAtTurnNumber: fresh.state.turnNumber,
            createdAtSide: fresh.state.activeSide,
            createdAtMs: 1,
            expiry: { kind: "manual" },
          },
          {
            noteId: "note_b",
            text: "b",
            createdAtTurnNumber: fresh.state.turnNumber,
            createdAtSide: fresh.state.activeSide,
            createdAtMs: 2,
            expiry: { kind: "manual" },
          },
        ];
        return fresh;
      },
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "CLEAR_CARD_NOTES",
          battleCardId: playerHandCardId,
        },
      },
    },
    {
      name: "SET_CARD_MARKERS",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_CARD_MARKERS",
          battleCardId: playerHandCardId,
          markers: { isPrevented: true, isCopied: true },
        },
      },
    },
    {
      name: "CREATE_CARD_COPY",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "CREATE_CARD_COPY",
          sourceBattleCardId: playerHandCardId,
          destination: { side: "player", zone: "hand" },
          createdAtMs: 17,
        },
      },
    },
    {
      name: "CREATE_FIGMENT",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "CREATE_FIGMENT",
          side: "player",
          chosenSubtype: "Wisp",
          chosenSpark: 2,
          name: "UndoFigment",
          destination: { side: "player", zone: "reserve", slotId: "R0" },
          createdAtMs: 11,
        },
      },
    },
    {
      name: "MOVE_CARD_TO_ZONE (reserve to deployed)",
      buildState: () => {
        const fresh = createTestBattle();
        const character = fresh.state.sides.player.hand.find((battleCardId) =>
          fresh.state.cardInstances[battleCardId].definition.battleCardKind === "character",
        );
        if (character === undefined) {
          throw new Error("No character in hand to seed reserve repositioning");
        }
        fresh.state.sides.player.hand = fresh.state.sides.player.hand.filter(
          (battleCardId) => battleCardId !== character,
        );
        fresh.state.sides.player.reserve.R1 = character;
        return fresh;
      },
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: seed.state.sides.player.hand.find((battleCardId) =>
            seed.state.cardInstances[battleCardId].definition.battleCardKind === "character",
          ) ?? playerHandCardId,
          destination: { side: "player", zone: "deployed", slotId: "D0" },
        },
      },
    },
    {
      name: "REORDER_DECK",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "REORDER_DECK",
          side: "player",
          order: (() => {
            const deck = [...seed.state.sides.player.deck];
            const lastIndex = deck.length - 1;
            [deck[0], deck[lastIndex]] = [deck[lastIndex], deck[0]];
            return deck;
          })(),
        },
      },
    },
    {
      name: "REVEAL_DECK_TOP",
      buildState: () => {
        const fresh = createTestBattle();
        for (const battleCardId of fresh.state.sides.enemy.deck) {
          fresh.state.cardInstances[battleCardId].isRevealedToPlayer = false;
        }
        return fresh;
      },
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "REVEAL_DECK_TOP",
          side: "enemy",
          count: 3,
        },
      },
    },
    {
      name: "PLAY_FROM_DECK_TOP",
      buildState: () => {
        const fresh = createTestBattle();
        const character = fresh.state.sides.player.hand.find((battleCardId) =>
          fresh.state.cardInstances[battleCardId].definition.battleCardKind === "character",
        );
        if (character === undefined) {
          throw new Error("No character to stage for PLAY_FROM_DECK_TOP");
        }
        fresh.state.sides.player.hand = fresh.state.sides.player.hand.filter(
          (battleCardId) => battleCardId !== character,
        );
        fresh.state.sides.player.deck = [character, ...fresh.state.sides.player.deck];
        return fresh;
      },
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "PLAY_FROM_DECK_TOP",
          side: "player",
        },
      },
    },
    {
      name: "GRANT_EXTRA_TURN",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "GRANT_EXTRA_TURN",
          side: "player",
        },
      },
    },
    {
      name: "SET_SCORE",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_SCORE", side: "player", value: 7 },
      },
    },
    {
      name: "SET_CURRENT_ENERGY",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_CURRENT_ENERGY", side: "player", value: 4 },
      },
    },
    {
      name: "SET_MAX_ENERGY",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_MAX_ENERGY", side: "enemy", value: 5 },
      },
    },
    {
      name: "SET_CARD_SPARK",
      buildState: createTestBattle,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "SET_CARD_SPARK",
          battleCardId: playerHandCardId,
          value: 9,
        },
      },
    },
    {
      name: "FORCE_RESULT",
      buildState: createTestBattle,
      command: { id: "FORCE_RESULT", result: "defeat" },
    },
    {
      name: "SKIP_TO_REWARDS",
      buildState: createTestBattle,
      command: { id: "SKIP_TO_REWARDS" },
    },
    {
      name: "END_TURN",
      buildState: createTestBattle,
      command: { id: "END_TURN" },
    },
    {
      name: "FORCE_JUDGMENT",
      buildState: () => {
        const fresh = createTestBattle();
        const playerCharacter = fresh.state.sides.player.hand.find((cardId) =>
          fresh.state.cardInstances[cardId].definition.battleCardKind === "character",
        );
        const enemyCharacter = fresh.state.sides.enemy.hand.find((cardId) =>
          fresh.state.cardInstances[cardId].definition.battleCardKind === "character",
        );
        if (playerCharacter === undefined || enemyCharacter === undefined) {
          throw new Error("Missing characters to seed FORCE_JUDGMENT undo case");
        }
        fresh.state.sides.player.hand = fresh.state.sides.player.hand.filter(
          (cardId) => cardId !== playerCharacter,
        );
        fresh.state.sides.enemy.hand = fresh.state.sides.enemy.hand.filter(
          (cardId) => cardId !== enemyCharacter,
        );
        fresh.state.sides.player.deployed.D0 = playerCharacter;
        fresh.state.sides.enemy.deployed.D0 = enemyCharacter;
        fresh.state.cardInstances[playerCharacter].sparkDelta =
          10 - fresh.state.cardInstances[playerCharacter].definition.printedSpark;
        fresh.state.cardInstances[enemyCharacter].sparkDelta =
          1 - fresh.state.cardInstances[enemyCharacter].definition.printedSpark;
        return fresh;
      },
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "FORCE_JUDGMENT",
          side: "player",
        },
      },
    },
  ];
}
