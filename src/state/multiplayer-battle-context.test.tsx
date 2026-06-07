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
    dispatchBattleCommandToRoom: vi.fn(() => Promise.resolve(undefined)),
    dispatchBattleHistoryNav: vi.fn(() => Promise.resolve(undefined)),
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
  });
  const initial = createInitialBattleState(init);
  return {
    init,
    reducer: {
      mutable: initial,
      history: { past: [], future: [] },
      lastTransition: null,
      commandSerial: 0,
      lastActivityKind: null,
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

function ScoreAdjuster() {
  const value = useMultiplayerBattle();
  const score = value.reducerState?.mutable.sides.player.score ?? 0;
  return (
    <button
      type="button"
      data-score={String(score)}
      onClick={() => value.dispatch({
        type: "APPLY_COMMAND",
        command: {
          id: "DEBUG_EDIT",
          edit: { kind: "ADJUST_SCORE", side: "player", amount: 1 },
          sourceSurface: "status-strip",
        },
      })}
    >
      {score}
    </button>
  );
}

describe("useMultiplayerBattle", () => {
  beforeEach(() => {
    vi.mocked(battleService.dispatchBattleCommandToRoom).mockClear();
    vi.mocked(battleService.dispatchBattleHistoryNav).mockClear();
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
        connectedCount={1}
        battleState={fakeBattleState}
      >
        <CaptureValue onValue={(value) => captured.push(value)} />
      </MultiplayerBattleProvider>,
    );

    const value = captured[captured.length - 1];
    expect(value).toBeDefined();
    expect(value.battleState).not.toBeNull();

    await act(async () => {
      value.dispatch({
        type: "APPLY_COMMAND",
        command: {
          id: "DEBUG_EDIT",
          edit: {
            kind: "MOVE_CARD_TO_ZONE",
            battleCardId: "p#0",
            destination: { side: "player", zone: "backRank", slotId: "B0" },
          },
          sourceSurface: "hand-tray",
        },
      });
      await Promise.resolve();
    });

    const commandInput = vi.mocked(battleService.dispatchBattleCommandToRoom).mock
      .calls[0]?.[0];
    expect(commandInput).toBeDefined();
    expect(commandInput?.roomId).toBe("room-1");
    expect(commandInput?.actorId).toBe("client-a");
    expect(commandInput?.command.id).toBe("DEBUG_EDIT");
  });

  it("updates reducerState optimistically before the database write resolves", () => {
    vi.mocked(battleService.dispatchBattleCommandToRoom).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const fakeBattleState = makeFakeBattleState();
    const { container } = mount(
      <MultiplayerBattleProvider
        database={{} as Database}
        roomId="room-1"
        clientId="client-a"
        connectedCount={1}
        battleState={fakeBattleState}
      >
        <ScoreAdjuster />
      </MultiplayerBattleProvider>,
    );

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.getAttribute("data-score")).toBe("0");

    act(() => {
      button?.click();
    });

    expect(button?.getAttribute("data-score")).toBe("1");
    expect(battleService.dispatchBattleCommandToRoom).toHaveBeenCalledTimes(1);
    expect(fakeBattleState.reducer.commandSerial).toBe(0);
  });

  it("keeps optimistic reducerState when a stale room snapshot re-renders", () => {
    vi.mocked(battleService.dispatchBattleCommandToRoom).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const fakeBattleState = makeFakeBattleState();
    const element = (
      <MultiplayerBattleProvider
        database={{} as Database}
        roomId="room-1"
        clientId="client-a"
        connectedCount={1}
        battleState={fakeBattleState}
      >
        <ScoreAdjuster />
      </MultiplayerBattleProvider>
    );
    const { container, root } = mount(element);
    const button = container.querySelector<HTMLButtonElement>("button");

    act(() => {
      button?.click();
    });
    expect(button?.getAttribute("data-score")).toBe("1");

    act(() => {
      root.render(element);
    });

    expect(button?.getAttribute("data-score")).toBe("1");
    expect(fakeBattleState.reducer.commandSerial).toBe(0);
  });

  it("returns null battleState when the room slot is null", () => {
    const captured: MultiplayerBattleValue[] = [];
    mount(
      <MultiplayerBattleProvider
        database={{} as Database}
        roomId="room-1"
        clientId="client-a"
        connectedCount={1}
        battleState={null}
      >
        <CaptureValue onValue={(value) => captured.push(value)} />
      </MultiplayerBattleProvider>,
    );
    const value = captured[captured.length - 1];
    expect(value).toBeDefined();
    expect(value.battleState).toBeNull();
    expect(value.reducerState).toBeNull();
  });

  it("dispatches UNDO/REDO through dispatchBattleHistoryNav", async () => {
    const fakeBattleState = makeFakeBattleState();
    const captured: MultiplayerBattleValue[] = [];
    mount(
      <MultiplayerBattleProvider
        database={{} as Database}
        roomId="room-2"
        clientId="client-b"
        connectedCount={1}
        battleState={fakeBattleState}
      >
        <CaptureValue onValue={(value) => captured.push(value)} />
      </MultiplayerBattleProvider>,
    );

    const value = captured[captured.length - 1];
    expect(value).toBeDefined();

    await act(async () => {
      value.dispatch({ type: "UNDO" });
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
      value.dispatch({ type: "REDO" });
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

  it("hydrates reducerState.lastActivity from lastActivityKind", () => {
    const fakeBattleState = makeFakeBattleState();
    // Inject a stand-in past entry so the hydrator has metadata to attach.
    const stubMetadata = {
      label: "Test command",
      commandId: "MOVE_CARD_TO_ZONE",
      targets: [],
      undoPayload: null,
    } as unknown as SharedBattleState["reducer"]["history"]["past"][number]["metadata"];
    const stubEntry = {
      metadata: stubMetadata,
      before: {
        mutable: fakeBattleState.reducer.mutable,
        lastTransition: null,
      },
      after: {
        mutable: fakeBattleState.reducer.mutable,
        lastTransition: null,
      },
    } as unknown as SharedBattleState["reducer"]["history"]["past"][number];
    const undoneState: SharedBattleState = {
      init: fakeBattleState.init,
      reducer: {
        ...fakeBattleState.reducer,
        history: { past: [], future: [stubEntry] },
        lastActivityKind: "undo",
      },
    };

    const captured: MultiplayerBattleValue[] = [];
    mount(
      <MultiplayerBattleProvider
        database={{} as Database}
        roomId="room-undo"
        clientId="client-u"
        connectedCount={1}
        battleState={undoneState}
      >
        <CaptureValue onValue={(value) => captured.push(value)} />
      </MultiplayerBattleProvider>,
    );

    const value = captured[captured.length - 1];
    expect(value).toBeDefined();
    expect(value.reducerState).not.toBeNull();
    expect(value.reducerState!.lastActivity).not.toBeNull();
    expect(value.reducerState!.lastActivity!.kind).toBe("undo");
    expect(value.reducerState!.lastActivity!.metadata).toBe(stubMetadata);
  });

  it("leaves reducerState.lastActivity null when lastActivityKind is null", () => {
    const fakeBattleState = makeFakeBattleState();
    expect(fakeBattleState.reducer.lastActivityKind).toBeNull();
    const captured: MultiplayerBattleValue[] = [];
    mount(
      <MultiplayerBattleProvider
        database={{} as Database}
        roomId="room-fresh"
        clientId="client-f"
        connectedCount={1}
        battleState={fakeBattleState}
      >
        <CaptureValue onValue={(value) => captured.push(value)} />
      </MultiplayerBattleProvider>,
    );
    const value = captured[captured.length - 1];
    expect(value).toBeDefined();
    expect(value.reducerState!.lastActivity).toBeNull();
  });
});
