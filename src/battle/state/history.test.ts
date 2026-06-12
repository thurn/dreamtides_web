import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { makeBattleTestCardDatabase, makeBattleTestDreamcallers, makeBattleTestSite, makeBattleTestState } from "../test-support";
import { createInitialBattleState } from "./create-initial-state";
import {
  commitBattleHistoryEntry,
  createEmptyBattleHistory,
  redoBattleHistory,
  undoBattleHistory,
} from "./history";

describe("battle history", () => {
  it("restores an exact single-entry snapshot without UI state", () => {
    const mutable = createInitialBattleState(
      createBattleInit({
        battleEntryKey: "site-7::2::dreamscape-2",
        site: makeBattleTestSite(),
        state: makeBattleTestState(),
        cardDatabase: makeBattleTestCardDatabase(),
        dreamcallers: makeBattleTestDreamcallers(),
      }),
    );
    const before = {
      ...mutable,
      selectedCardId: mutable.sides.player.hand[0],
    };
    const after = {
      ...mutable,
      result: "victory" as const,
      selectedCardId: null,
    };
    const history = commitBattleHistoryEntry(
      createEmptyBattleHistory(),
      {
        commandId: "RECOMPUTE_RESULT",
        label: "Recompute Result",
        kind: "result",
        isComposite: false,
        actor: "system",
        sourceSurface: "auto-system",
        targets: [],
        timestamp: 0,
        undoPayload: null,
      },
      {
        mutable: before,
        lastTransition: null,
      },
      {
        mutable: after,
        lastTransition: null,
      },
    );

    const undone = undoBattleHistory(history);

    expect(undone).not.toBeNull();
    expect(undone?.restored.mutable).toEqual(mutable);
    expect("selectedCardId" in (undone?.restored.mutable ?? {})).toBe(false);
  });

  it("redos a stored snapshot without rerunning later mutations", () => {
    const mutable = createInitialBattleState(
      createBattleInit({
        battleEntryKey: "site-7::2::dreamscape-2",
        site: makeBattleTestSite(),
        state: makeBattleTestState(),
        cardDatabase: makeBattleTestCardDatabase(),
        dreamcallers: makeBattleTestDreamcallers(),
      }),
    );
    const after = {
      ...mutable,
      result: "defeat" as const,
      sides: {
        ...mutable.sides,
        enemy: {
          ...mutable.sides.enemy,
          score: 25,
        },
      },
    };
    const history = commitBattleHistoryEntry(
      createEmptyBattleHistory(),
      {
        commandId: "END_TURN",
        label: "End Turn",
        kind: "battle-flow",
        isComposite: true,
        actor: "player",
        sourceSurface: "action-bar",
        targets: [],
        timestamp: 0,
        undoPayload: null,
      },
      {
        mutable,
        lastTransition: null,
      },
      {
        mutable: after,
        lastTransition: null,
      },
    );
    const undone = undoBattleHistory(history);

    expect(undone).not.toBeNull();

    history.past[0].after.mutable.sides.enemy.score = 0;
    const redone = redoBattleHistory(undone!.history);

    expect(redone).not.toBeNull();
    expect(redone?.restored.mutable.sides.enemy.score).toBe(25);
    expect(redone?.entry.metadata.isComposite).toBe(true);
  });

  it("deep-clones card definitions inside stored snapshots", () => {
    const mutable = createInitialBattleState(
      createBattleInit({
        battleEntryKey: "site-7::2::dreamscape-2",
        site: makeBattleTestSite(),
        state: makeBattleTestState(),
        cardDatabase: makeBattleTestCardDatabase(),
        dreamcallers: makeBattleTestDreamcallers(),
      }),
    );
    const battleCardId = mutable.sides.player.hand[0];
    const originalName = mutable.cardInstances[battleCardId].definition.name;
    const history = commitBattleHistoryEntry(
      createEmptyBattleHistory(),
      {
        commandId: "END_TURN",
        label: "End Turn",
        kind: "battle-flow",
        isComposite: true,
        actor: "player",
        sourceSurface: "action-bar",
        targets: [],
        timestamp: 0,
        undoPayload: null,
      },
      {
        mutable,
        lastTransition: null,
      },
      {
        mutable: {
          ...mutable,
          result: "victory",
        },
        lastTransition: null,
      },
    );

    expect(history.past[0].before.mutable.cardInstances[battleCardId].definition.name).toBe(originalName);
    expect(history.past[0].before.mutable.cardInstances[battleCardId].definition).not.toBe(
      mutable.cardInstances[battleCardId].definition,
    );
    expect(history.past[0].before.mutable.cardInstances[battleCardId].markers).not.toBe(
      mutable.cardInstances[battleCardId].markers,
    );
    expect(history.past[0].before.mutable.cardInstances[battleCardId].notes).not.toBe(
      mutable.cardInstances[battleCardId].notes,
    );
    expect(history.past[0].before.mutable.cardInstances[battleCardId].provenance).not.toBe(
      mutable.cardInstances[battleCardId].provenance,
    );
  });

  it("commits an entry when only an instance's staticSparkBonus changes", () => {
    // Regression guard: `areBattleMutableStatesEqual` must compare
    // `staticSparkBonus`. If it omits the field, a before/after that differ
    // only in `staticSparkBonus` are treated as equal and the entry is
    // deduped to a no-op — silently dropping the Support spark edit.
    const mutable = createInitialBattleState(
      createBattleInit({
        battleEntryKey: "site-7::2::dreamscape-2",
        site: makeBattleTestSite(),
        state: makeBattleTestState(),
        cardDatabase: makeBattleTestCardDatabase(),
        dreamcallers: makeBattleTestDreamcallers(),
      }),
    );
    const battleCardId = mutable.sides.player.hand[0];
    const after = {
      ...mutable,
      cardInstances: {
        ...mutable.cardInstances,
        [battleCardId]: {
          ...mutable.cardInstances[battleCardId],
          staticSparkBonus:
            mutable.cardInstances[battleCardId].staticSparkBonus + 2,
        },
      },
    };
    const history = commitBattleHistoryEntry(
      createEmptyBattleHistory(),
      {
        commandId: "SET_CARD_STATIC_SPARK_BONUS",
        label: "Set Static Spark Bonus",
        kind: "card-instance",
        isComposite: false,
        actor: "system",
        sourceSurface: "auto-system",
        targets: [],
        timestamp: 0,
        undoPayload: null,
      },
      {
        mutable,
        lastTransition: null,
      },
      {
        mutable: after,
        lastTransition: null,
      },
    );

    expect(history.past.length).toBe(1);
  });

  it("deep-clones card note entries inside stored snapshots", () => {
    const mutable = createInitialBattleState(
      createBattleInit({
        battleEntryKey: "site-7::2::dreamscape-2",
        site: makeBattleTestSite(),
        state: makeBattleTestState(),
        cardDatabase: makeBattleTestCardDatabase(),
        dreamcallers: makeBattleTestDreamcallers(),
      }),
    );
    const battleCardId = mutable.sides.player.hand[0];
    mutable.cardInstances[battleCardId] = {
      ...mutable.cardInstances[battleCardId],
      notes: [
        {
          noteId: "note_0001",
          text: "remember me",
          createdAtTurnNumber: 1,
          createdAtSide: "player",
          createdAtMs: 0,
          expiry: { kind: "manual" },
        },
      ],
    };
    const history = commitBattleHistoryEntry(
      createEmptyBattleHistory(),
      {
        commandId: "END_TURN",
        label: "End Turn",
        kind: "battle-flow",
        isComposite: true,
        actor: "player",
        sourceSurface: "action-bar",
        targets: [],
        timestamp: 0,
        undoPayload: null,
      },
      {
        mutable,
        lastTransition: null,
      },
      {
        mutable: {
          ...mutable,
          result: "victory",
        },
        lastTransition: null,
      },
    );

    const clonedNote = history.past[0].before.mutable.cardInstances[battleCardId].notes[0];
    const originalNote = mutable.cardInstances[battleCardId].notes[0];
    expect(clonedNote).not.toBe(originalNote);
    expect(clonedNote.expiry).not.toBe(originalNote.expiry);
    expect(clonedNote).toEqual(originalNote);
  });
});
