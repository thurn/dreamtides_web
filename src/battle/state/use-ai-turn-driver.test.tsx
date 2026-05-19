// @vitest-environment jsdom

import { act, type Dispatch, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLog } from "../../logging";
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
import { useAiTurnDriver } from "./use-ai-turn-driver";

interface HarnessSnapshot {
  dispatch: Dispatch<BattleControllerAction>;
  state: BattleReducerState;
}

function mountHarness({
  battleInit,
  initialState,
  onStateChange,
}: {
  battleInit: BattleInit;
  initialState: BattleMutableState;
  onStateChange: (value: HarnessSnapshot) => void;
}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <Harness
        battleInit={battleInit}
        initialState={initialState}
        onStateChange={onStateChange}
      />,
    );
  });

  return { container, root };
}

function Harness({
  battleInit,
  initialState,
  onStateChange,
}: {
  battleInit: BattleInit;
  initialState: BattleMutableState;
  onStateChange: (value: HarnessSnapshot) => void;
}) {
  const [state, dispatch] = useBattleController(initialState, battleInit);
  useAiTurnDriver(state, dispatch, battleInit.enableAi);

  useEffect(() => {
    onStateChange({ dispatch, state });
  }, [dispatch, onStateChange, state]);

  return null;
}

function readLatestSnapshot(
  snapshot: HarnessSnapshot | null,
): HarnessSnapshot {
  if (snapshot === null) {
    throw new Error("Harness did not publish a snapshot");
  }

  return snapshot;
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

describe("useAiTurnDriver", () => {
  it("does not fire RUN_AI_TURN when the player takes the opening turn", () => {
    const { battleInit, initialState } = createTestBattle();
    let latest: HarnessSnapshot | null = null;
    const { root } = mountHarness({
      battleInit,
      initialState,
      onStateChange: (value) => {
        latest = value;
      },
    });

    const snapshot = readLatestSnapshot(latest);
    expect(snapshot.state.mutable.activeSide).toBe("player");
    expect(snapshot.state.history.past).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it("drains the opening enemy turn exactly once when the enemy starts on main phase", () => {
    const { battleInit, initialState } = createTestBattle();
    initialState.activeSide = "enemy";
    initialState.phase = "day";

    let latest: HarnessSnapshot | null = null;
    const { root } = mountHarness({
      battleInit,
      initialState,
      onStateChange: (value) => {
        latest = value;
      },
    });

    const snapshot = readLatestSnapshot(latest);
    expect(snapshot.state.history.past).toHaveLength(1);
    expect(snapshot.state.lastTransition?.metadata.commandId).toBe("RUN_AI_TURN");

    act(() => {
      root.unmount();
    });
  });

  it("does not drain the opening enemy turn when enableAi is false", () => {
    const { battleInit, initialState } = createTestBattle({ enableAi: false });
    initialState.activeSide = "enemy";
    initialState.phase = "day";

    let latest: HarnessSnapshot | null = null;
    const { root } = mountHarness({
      battleInit,
      initialState,
      onStateChange: (value) => {
        latest = value;
      },
    });

    const snapshot = readLatestSnapshot(latest);
    expect(snapshot.state.history.past).toHaveLength(0);
    expect(snapshot.state.mutable.activeSide).toBe("enemy");
    expect(snapshot.state.mutable.phase).toBe("day");

    act(() => {
      root.unmount();
    });
  });

  it("latches after the initial tick so redo-driven state shapes never re-fire", () => {
    const { battleInit, initialState } = createTestBattle();
    let latest: HarnessSnapshot | null = null;
    const { root } = mountHarness({
      battleInit,
      initialState,
      onStateChange: (value) => {
        latest = value;
      },
    });

    act(() => {
      readLatestSnapshot(latest).dispatch({
        type: "APPLY_COMMAND",
        command: { id: "END_TURN" },
      });
    });

    const afterEndTurn = readLatestSnapshot(latest);
    const afterEndTurnHistoryLength = afterEndTurn.state.history.past.length;

    act(() => {
      afterEndTurn.dispatch({ type: "UNDO" });
    });

    act(() => {
      readLatestSnapshot(latest).dispatch({ type: "REDO" });
    });

    expect(readLatestSnapshot(latest).state.history.past).toHaveLength(
      afterEndTurnHistoryLength,
    );

    act(() => {
      root.unmount();
    });
  });
});

function createTestBattle({ enableAi = true }: { enableAi?: boolean } = {}) {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
    enableAi,
  });

  return {
    battleInit,
    initialState: createInitialBattleState(battleInit),
  };
}
