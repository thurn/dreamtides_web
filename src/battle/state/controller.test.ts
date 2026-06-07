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
            destination: { side: "player", zone: "backRank", slotId: "B0" },
          },
        },
      },
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

  it("keeps command, undo, and redo reusable outside the screen component", () => {
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

    const afterSetPhase = battleControllerReducer(
      initialState,
      {
        type: "APPLY_COMMAND",
        command: {
          id: "DEBUG_EDIT",
          edit: { kind: "SET_PHASE", phase: "dusk" },
        },
      },
    );
    const undone = battleControllerReducer(
      afterSetPhase,
      { type: "UNDO" },
    );
    const redone = battleControllerReducer(
      undone,
      { type: "REDO" },
    );

    // The phase label changes; nothing else does. Undo/redo reproduce exact
    // snapshots through the controller reducer.
    expect(afterSetPhase.mutable.phase).toBe("dusk");
    expect(afterSetPhase.mutable.activeSide).toBe("player");
    expect(afterSetPhase.mutable.turnNumber).toBe(1);
    expect(afterSetPhase.history.past).toHaveLength(1);
    expect(undone.mutable.phase).toBe("day");
    expect(undone.history.future).toHaveLength(1);
    expect(undone.lastActivity?.kind).toBe("undo");
    expect(redone.mutable).toEqual(afterSetPhase.mutable);
    expect(redone.history.future).toHaveLength(0);
    expect(redone.lastActivity?.kind).toBe("redo");
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
    );
    const afterUndo = battleControllerReducer(
      afterForcedVictory,
      { type: "UNDO" },
    );
    const afterSkipToRewards = battleControllerReducer(
      afterUndo,
      { type: "APPLY_COMMAND", command: { id: "SKIP_TO_REWARDS" } },
    );
    const undone = battleControllerReducer(
      afterSkipToRewards,
      { type: "UNDO" },
    );
    const redone = battleControllerReducer(
      undone,
      { type: "REDO" },
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
