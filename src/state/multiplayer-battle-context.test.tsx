// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Database } from "firebase/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MultiplayerBattleProvider,
  useMultiplayerBattle,
  type MultiplayerBattleValue,
} from "./multiplayer-battle-context";
import * as battleService from "../multiplayer/battle-service";
import { createBattleInit } from "../battle/integration/create-battle-init";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../battle/test-support";
import type { SharedBattleState } from "../multiplayer/battle-types";

vi.mock("../multiplayer/battle-service", async () => {
  const actual = await vi.importActual<typeof import("../multiplayer/battle-service")>(
    "../multiplayer/battle-service",
  );
  return {
    ...actual,
    dispatchBattleCommandToRoom: vi.fn(async () => undefined),
    dispatchBattleHistoryNav: vi.fn(async () => undefined),
    dispatchClearForcedResult: vi.fn(async () => undefined),
  };
});

const roots: Root[] = [];

function makeFakeBattleState(): SharedBattleState {
  const init = createBattleInit({
    battleEntryKey: "context-test",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
    seedOverride: 1,
    enableAi: false,
  });
  const initial = createInitialBattleState(init);
  return {
    init,
    reducer: {
      mutable: initial,
      history: { past: [], future: [] },
      lastTransition: null,
      commandSerial: 0,
    },
  };
}

function mount(element: ReactNode): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function CaptureValue({
  onValue,
}: {
  onValue: (value: MultiplayerBattleValue) => void;
}) {
  const value = useMultiplayerBattle();
  onValue(value);
  return null;
}

describe("useMultiplayerBattle", () => {
  beforeEach(() => {
    vi.mocked(battleService.dispatchBattleCommandToRoom).mockClear();
    vi.mocked(battleService.dispatchBattleHistoryNav).mockClear();
    vi.mocked(battleService.dispatchClearForcedResult).mockClear();
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => {
        root.unmount();
      });
    }
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("dispatches a command through dispatchBattleCommandToRoom", async () => {
    const fakeBattleState = makeFakeBattleState();
    const captured: MultiplayerBattleValue[] = [];
    mount(
      <MultiplayerBattleProvider
        database={{} as Database}
        roomId="room-1"
        clientId="client-a"
        battleState={fakeBattleState}
      >
        <CaptureValue onValue={(value) => captured.push(value)} />
      </MultiplayerBattleProvider>,
    );

    const value = captured[captured.length - 1];
    expect(value).toBeDefined();
    expect(value!.battleState).not.toBeNull();

    await act(async () => {
      value!.dispatch({
        type: "APPLY_COMMAND",
        command: {
          id: "PLAY_CARD",
          battleCardId: "p#0",
          sourceSurface: "hand-tray",
        },
      });
      await Promise.resolve();
    });

    expect(battleService.dispatchBattleCommandToRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        actorId: "client-a",
        command: expect.objectContaining({ id: "PLAY_CARD" }),
      }),
    );
  });

  it("returns null battleState when the room slot is null", () => {
    const captured: MultiplayerBattleValue[] = [];
    mount(
      <MultiplayerBattleProvider
        database={{} as Database}
        roomId="room-1"
        clientId="client-a"
        battleState={null}
      >
        <CaptureValue onValue={(value) => captured.push(value)} />
      </MultiplayerBattleProvider>,
    );
    const value = captured[captured.length - 1];
    expect(value).toBeDefined();
    expect(value!.battleState).toBeNull();
    expect(value!.reducerState).toBeNull();
  });

  it("dispatches UNDO/REDO through dispatchBattleHistoryNav", async () => {
    const fakeBattleState = makeFakeBattleState();
    const captured: MultiplayerBattleValue[] = [];
    mount(
      <MultiplayerBattleProvider
        database={{} as Database}
        roomId="room-2"
        clientId="client-b"
        battleState={fakeBattleState}
      >
        <CaptureValue onValue={(value) => captured.push(value)} />
      </MultiplayerBattleProvider>,
    );

    const value = captured[captured.length - 1];
    expect(value).toBeDefined();

    await act(async () => {
      value!.dispatch({ type: "UNDO" });
      await Promise.resolve();
    });
    expect(battleService.dispatchBattleHistoryNav).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-2",
        actorId: "client-b",
        direction: "undo",
      }),
    );

    await act(async () => {
      value!.dispatch({ type: "REDO" });
      await Promise.resolve();
    });
    expect(battleService.dispatchBattleHistoryNav).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-2",
        actorId: "client-b",
        direction: "redo",
      }),
    );
  });

  it("dispatches CLEAR_FORCED_RESULT through dispatchClearForcedResult", async () => {
    const fakeBattleState = makeFakeBattleState();
    const captured: MultiplayerBattleValue[] = [];
    mount(
      <MultiplayerBattleProvider
        database={{} as Database}
        roomId="room-3"
        clientId="client-c"
        battleState={fakeBattleState}
      >
        <CaptureValue onValue={(value) => captured.push(value)} />
      </MultiplayerBattleProvider>,
    );

    const value = captured[captured.length - 1];
    expect(value).toBeDefined();

    await act(async () => {
      value!.dispatch({ type: "CLEAR_FORCED_RESULT" });
      await Promise.resolve();
    });
    expect(battleService.dispatchClearForcedResult).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-3",
        actorId: "client-c",
      }),
    );
  });
});
