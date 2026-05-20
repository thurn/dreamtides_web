import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "./create-initial-state";
import {
  battleControllerReducer,
  createBattleControllerState,
} from "./controller";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";

describe("battleControllerReducer", () => {
  it("dispatches typed commands through the controller entry point", () => {
    const battleInit = createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    });
    const initialState = createBattleControllerState(
      createInitialBattleState(battleInit),
    );
    const battleCardId = initialState.mutable.sides.player.hand[0];
    const reduced = battleControllerReducer(
      initialState,
      {
        type: "APPLY_COMMAND",
        command: {
          id: "DEBUG_EDIT",
          edit: {
            kind: "MOVE_CARD_TO_ZONE",
            battleCardId,
            destination: { side: "player", zone: "reserve", slotId: "R0" },
          },
        },
      },
      battleInit,
    );

    expect(reduced.history.past).toHaveLength(1);
    expect(reduced.lastActivity?.kind).toBe("command");
    expect(reduced.lastActivity?.metadata.commandId).toBe("MOVE_CARD_TO_ZONE");
    expect(reduced.lastActivity?.metadata.label).toContain("Move ");
    expect(reduced.lastActivity?.metadata.kind).toBe("zone-move");
    expect(reduced.lastActivity?.metadata.actor).toBe("debug");
    expect(reduced.lastActivity?.metadata.targets[0]).toEqual(
      { kind: "card", ref: battleCardId },
    );
    expect(reduced.lastActivity?.metadata.undoPayload).toBeNull();
    expect(reduced.activityId).toBe(1);
  });

  it("keeps end-turn, undo, and redo reusable outside the screen component", () => {
    const battleInit = createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    });
    const initialState = createBattleControllerState(
      createInitialBattleState(battleInit),
    );

    const afterEndTurn = battleControllerReducer(
      initialState,
      { type: "APPLY_COMMAND", command: { id: "END_TURN" } },
      battleInit,
    );
    const undone = battleControllerReducer(
      afterEndTurn,
      { type: "UNDO" },
      battleInit,
    );
    const redone = battleControllerReducer(
      undone,
      { type: "REDO" },
      battleInit,
    );

    // END_TURN is a single composite covering the player's end-of-turn, the AI
    // main phase, and the handoff back to the player (Ambiguity 009 / H-26).
    expect(afterEndTurn.mutable.activeSide).toBe("player");
    expect(afterEndTurn.mutable.turnNumber).toBe(2);
    expect(afterEndTurn.history.past).toHaveLength(1);
    expect(undone.mutable.activeSide).toBe("player");
    expect(undone.mutable.turnNumber).toBe(1);
    expect(undone.history.future).toHaveLength(1);
    expect(undone.lastActivity?.kind).toBe("undo");
    expect(redone.mutable).toEqual(afterEndTurn.mutable);
    expect(redone.history.future).toHaveLength(0);
    expect(redone.lastActivity?.kind).toBe("redo");
  });

  it("END_TURN composite: history grows by one entry and single Undo restores exact pre-end-turn state (bug-069, H-14, M-11)", () => {
    const battleInit = createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    });
    // Start from a non-trivial pre-state so the assertion catches any drift
    // between the AI-follow-up branch and the snapshot-based undo.
    const initialState = createBattleControllerState(
      createInitialBattleState(battleInit),
    );
    const playerCardId = initialState.mutable.sides.player.hand[0];
    const afterPlay = battleControllerReducer(
      initialState,
      {
        type: "APPLY_COMMAND",
        command: {
          id: "DEBUG_EDIT",
          edit: {
            kind: "MOVE_CARD_TO_ZONE",
            battleCardId: playerCardId,
            destination: { side: "player", zone: "reserve", slotId: "R0" },
          },
        },
      },
      battleInit,
    );
    const preEndTurnMutable = afterPlay.mutable;
    const preEndTurnHistoryLength = afterPlay.history.past.length;

    const afterEndTurn = battleControllerReducer(
      afterPlay,
      { type: "APPLY_COMMAND", command: { id: "END_TURN" } },
      battleInit,
    );

    // H-14: the END_TURN composite covers player-end, enemy-start, enemy-main
    // (AI follow-up), enemy-end, and player-start as ONE history entry.
    expect(afterEndTurn.history.past.length).toBe(preEndTurnHistoryLength + 1);
    expect(afterEndTurn.history.past[afterEndTurn.history.past.length - 1].metadata.commandId).toBe("END_TURN");
    expect(afterEndTurn.mutable.turnNumber).toBe(2);

    const undone = battleControllerReducer(
      afterEndTurn,
      { type: "UNDO" },
      battleInit,
    );

    // M-11: a single Undo must restore the exact mutable state that existed
    // before the END_TURN composite, not a partially-rolled-back state.
    expect(undone.mutable).toEqual(preEndTurnMutable);
    expect(undone.history.past.length).toBe(preEndTurnHistoryLength);
    expect(undone.history.future.length).toBe(1);
  });

  it("restores Skip To Rewards transition metadata when redo reapplies a stored snapshot", () => {
    const battleInit = createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    });
    const initialState = createBattleControllerState(
      createInitialBattleState(battleInit),
    );

    const afterForcedVictory = battleControllerReducer(
      initialState,
      { type: "APPLY_COMMAND", command: { id: "FORCE_RESULT", result: "victory" } },
      battleInit,
    );
    const afterUndo = battleControllerReducer(
      afterForcedVictory,
      { type: "UNDO" },
      battleInit,
    );
    const afterSkipToRewards = battleControllerReducer(
      afterUndo,
      { type: "APPLY_COMMAND", command: { id: "SKIP_TO_REWARDS" } },
      battleInit,
    );
    const undone = battleControllerReducer(
      afterSkipToRewards,
      { type: "UNDO" },
      battleInit,
    );
    const redone = battleControllerReducer(
      undone,
      { type: "REDO" },
      battleInit,
    );

    expect(afterSkipToRewards.lastTransition?.metadata).toMatchObject({
      commandId: "SKIP_TO_REWARDS",
      label: "Skip To Rewards",
      kind: "result",
      isComposite: true,
      actor: "debug",
    });
    expect(undone.lastTransition).toBeNull();
    expect(redone.mutable).toEqual(afterSkipToRewards.mutable);
    expect(redone.lastTransition).toEqual(afterSkipToRewards.lastTransition);
    expect(redone.lastTransition?.metadata.commandId).toBe("SKIP_TO_REWARDS");
    expect(redone.history.future).toHaveLength(0);
  });
});
