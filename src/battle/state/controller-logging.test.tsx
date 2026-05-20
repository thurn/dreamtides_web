// @vitest-environment jsdom

import { act, type Dispatch, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../../logging";
import { createBattleInit } from "../integration/create-battle-init";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import type { BattleInit, BattleMutableState, BattleReducerState } from "../types";
import {
  type BattleControllerAction,
  useBattleController,
} from "./controller";
import { createInitialBattleState } from "./create-initial-state";

function mountControllerHarness({
  battleInit,
  initialState,
  onStateChange,
}: {
  battleInit: BattleInit;
  initialState: BattleMutableState;
  onStateChange: (
    value: {
      dispatch: Dispatch<BattleControllerAction>;
      state: BattleReducerState;
    },
  ) => void;
}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ControllerHarness
        battleInit={battleInit}
        initialState={initialState}
        onStateChange={onStateChange}
      />,
    );
  });

  return { container, root };
}

function ControllerHarness({
  battleInit,
  initialState,
  onStateChange,
}: {
  battleInit: BattleInit;
  initialState: BattleMutableState;
  onStateChange: (
    value: {
      dispatch: Dispatch<BattleControllerAction>;
      state: BattleReducerState;
    },
  ) => void;
}) {
  const [state, dispatch] = useBattleController(initialState, battleInit);

  useEffect(() => {
    onStateChange({ dispatch, state });
  }, [dispatch, onStateChange, state]);

  return null;
}

beforeEach(() => {
  resetLog();
  vi.spyOn(console, "log").mockImplementation(() => {});
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useBattleController", () => {
  it("emits command and history telemetry outside PlayableBattleScreen", () => {
    const { battleInit, initialState } = createTestBattle();
    let latest:
      | {
        dispatch: Dispatch<BattleControllerAction>;
        state: BattleReducerState;
      }
      | null = null;
    const { root } = mountControllerHarness({
      battleInit,
      initialState,
      onStateChange: (value) => {
        latest = value;
      },
    });

    act(() => {
      latest?.dispatch({
        type: "APPLY_COMMAND",
        command: { id: "SKIP_TO_REWARDS" },
      });
    });
    act(() => {
      latest?.dispatch({ type: "UNDO" });
    });
    act(() => {
      latest?.dispatch({ type: "REDO" });
    });

    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "battle_proto_command_applied",
          battleId: battleInit.battleId,
          commandId: "SKIP_TO_REWARDS",
          isComposite: true,
          label: "Skip To Rewards",
        }),
        expect.objectContaining({
          event: "battle_proto_history_undo",
          battleId: battleInit.battleId,
          commandId: "SKIP_TO_REWARDS",
        }),
        expect.objectContaining({
          event: "battle_proto_history_redo",
          battleId: battleInit.battleId,
          commandId: "SKIP_TO_REWARDS",
        }),
      ]),
    );

    act(() => {
      root.unmount();
    });
  });

  it(
    "emits exactly one battle_proto_command_applied per user command",
    () => {
      const { battleInit, initialState } = createTestBattle();
      let latest:
        | {
          dispatch: Dispatch<BattleControllerAction>;
          state: BattleReducerState;
        }
        | null = null;
      const { root } = mountControllerHarness({
        battleInit,
        initialState,
        onStateChange: (value) => {
          latest = value;
        },
      });

      // A user-initiated SET_PHASE edit logs exactly one
      // `battle_proto_command_applied` entry with commandId SET_PHASE.
      act(() => {
        latest?.dispatch({
          type: "APPLY_COMMAND",
          command: {
            id: "DEBUG_EDIT",
            edit: { kind: "SET_PHASE", phase: "dusk" },
          },
        });
      });

      const afterSetPhase = getLogEntries().filter(
        (entry) =>
          entry.event === "battle_proto_command_applied"
          && entry.commandId === "SET_PHASE",
      );
      expect(afterSetPhase).toHaveLength(1);

      act(() => {
        root.unmount();
      });
    },
  );
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
    initialState: createInitialBattleState(battleInit),
  };
}
