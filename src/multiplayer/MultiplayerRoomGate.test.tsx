// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import type { Database } from "firebase/database";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiplayerRoomGate } from "./MultiplayerRoomGate";
import { buildActionLogEntry } from "./action-log";
import type { MultiplayerRoom } from "./room-types";

type RoomSubscriptionSnapshot =
  | { status: "ready"; room: MultiplayerRoom }
  | { status: "missing" }
  | { status: "error"; message: string };

type RoomListener = (snapshot: RoomSubscriptionSnapshot) => void;

const serviceMocks = vi.hoisted(() => ({
  createRoomEvictingStale: vi.fn(),
  pruneRoomActionLog: vi.fn(),
  subscribeToRoom: vi.fn(),
  writePresence: vi.fn(),
}));

const roomIdMocks = vi.hoisted(() => ({
  generateRoomId: vi.fn(() => "ab12cd"),
}));

vi.mock("./room-service", () => ({
  createRoomEvictingStale: serviceMocks.createRoomEvictingStale,
  pruneRoomActionLog: serviceMocks.pruneRoomActionLog,
  subscribeToRoom: serviceMocks.subscribeToRoom,
  writePresence: serviceMocks.writePresence,
}));

vi.mock("./room-id", () => ({
  generateRoomId: roomIdMocks.generateRoomId,
}));

const database = { app: { name: "test-app" } } as Database;
const roots: Root[] = [];

function mount(element: ReactElement): {
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

function makeRoom(overrides: Partial<MultiplayerRoom> = {}): MultiplayerRoom {
  return {
    metadata: {
      schemaVersion: 2,
      createdAt: "2026-05-08T12:00:00.000Z",
      updatedAt: "2026-05-08T12:00:00.000Z",
    },
    questState: null,
    battleState: null,
    presence: {},
    actionLog: {},
    ...overrides,
  };
}

function makeActionLog(count: number): MultiplayerRoom["actionLog"] {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const actionNumber = index + 1;
      return [
        `action-${actionNumber}`,
        buildActionLogEntry({
          actorId: "client-1",
          action: "testAction",
          source: "test",
          summary: { actionNumber },
          timestamp: `2026-05-08T12:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(
            index % 60,
          ).padStart(2, "0")}.000Z`,
        }),
      ];
    }),
  );
}

function subscribeWith(snapshot: RoomSubscriptionSnapshot): void {
  serviceMocks.subscribeToRoom.mockImplementation(
    (_database: Database, _roomId: string, listener: RoomListener) => {
      listener(snapshot);
      return vi.fn();
    },
  );
}

function subscribeManually(): {
  emit: (snapshot: RoomSubscriptionSnapshot) => void;
} {
  let roomListener: RoomListener | null = null;

  serviceMocks.subscribeToRoom.mockImplementation(
    (_database: Database, _roomId: string, listener: RoomListener) => {
      roomListener = listener;
      return vi.fn();
    },
  );

  return {
    emit: (snapshot: RoomSubscriptionSnapshot) => {
      if (roomListener === null) {
        throw new Error("Missing room listener");
      }

      roomListener(snapshot);
    },
  };
}

async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>("[data-create-game]");
  if (!button) {
    throw new Error("Missing create game button");
  }

  return button;
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceMocks.createRoomEvictingStale.mockResolvedValue(undefined);
  serviceMocks.pruneRoomActionLog.mockResolvedValue(undefined);
  serviceMocks.subscribeToRoom.mockReturnValue(vi.fn());
  serviceMocks.writePresence.mockResolvedValue(undefined);
  roomIdMocks.generateRoomId.mockReturnValue("ab12cd");
  window.history.replaceState(null, "", "/");
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: vi.fn(() => "client-uuid") },
  });
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

describe("MultiplayerRoomGate", () => {
  it("shows Create Game when no game id is present", () => {
    const { container } = mount(
      <MultiplayerRoomGate database={database} gameId={null}>
        {() => <div>Quest App</div>}
      </MultiplayerRoomGate>,
    );

    expect(createButton(container).textContent).toBe("Create Game");
  });

  it("creates a room and navigates to ?game=ab12cd", async () => {
    const { container } = mount(
      <MultiplayerRoomGate database={database} gameId={null}>
        {() => <div>Quest App</div>}
      </MultiplayerRoomGate>,
    );

    await act(async () => {
      createButton(container).click();
      await Promise.resolve();
    });

    expect(roomIdMocks.generateRoomId).toHaveBeenCalledOnce();
    expect(serviceMocks.createRoomEvictingStale).toHaveBeenCalledWith(
      database,
      "ab12cd",
      expect.any(String),
    );
    expect(window.location.search).toBe("?game=ab12cd");
    expect(container.textContent).toContain("Loading ab12cd");
  });

  it("renders children when subscribed room is ready and calls writePresence", () => {
    subscribeWith({
      status: "ready",
      room: makeRoom({
        presence: {
          "client-a": { connected: true, lastSeenAt: "2026-05-08T12:00:00.000Z" },
          "client-b": { connected: false, lastSeenAt: "2026-05-08T12:00:00.000Z" },
        },
      }),
    });

    const { container } = mount(
      <MultiplayerRoomGate database={database} gameId="ab12cd">
        {(session) => (
          <div data-child-room={session.roomId} data-child-client={session.clientId}>
            Room {session.roomId}
          </div>
        )}
      </MultiplayerRoomGate>,
    );

    expect(container.textContent).toContain("1 connected");
    expect(container.textContent).toContain("Room ab12cd");
    expect(container.querySelector("[data-child-client]")?.getAttribute("data-child-client")).toBe(
      "client-client-uuid",
    );
    expect(serviceMocks.writePresence).toHaveBeenCalledWith(
      database,
      "ab12cd",
      "client-client-uuid",
      expect.any(String),
    );

    // The presence pill must be positioned out of normal flow so it does
    // not add height to the document. Without `position: fixed` here, the
    // pill's text added 24px to body height, which broke any screen
    // (e.g. DraftSiteScreen) that sized itself precisely against `100vh`.
    const presencePill = container.querySelector("[data-connected-count]");
    if (!(presencePill instanceof HTMLElement)) {
      throw new Error("Expected presence pill to be rendered");
    }
    expect(presencePill.className).toMatch(/\bfixed\b/);
  });

  it("writes presence once for repeated ready snapshots in the same room", async () => {
    const subscription = subscribeManually();
    const { container } = mount(
      <MultiplayerRoomGate database={database} gameId="ab12cd">
        {(session) => <div>Room {session.roomId}</div>}
      </MultiplayerRoomGate>,
    );

    await act(async () => {
      subscription.emit({
        status: "ready",
        room: makeRoom({
          presence: {
            "client-a": { connected: true, lastSeenAt: "2026-05-08T12:00:00.000Z" },
          },
        }),
      });
      await flushEffects();
    });

    expect(serviceMocks.writePresence).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("1 connected");

    await act(async () => {
      subscription.emit({
        status: "ready",
        room: makeRoom({
          presence: {
            "client-a": { connected: true, lastSeenAt: "2026-05-08T12:00:00.000Z" },
            "client-b": { connected: true, lastSeenAt: "2026-05-08T12:01:00.000Z" },
          },
        }),
      });
      await flushEffects();
    });

    expect(serviceMocks.writePresence).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("2 connected");
    expect(container.textContent).toContain("Room ab12cd");
  });

  it("prunes oversized action logs", async () => {
    subscribeWith({
      status: "ready",
      room: makeRoom({ actionLog: makeActionLog(61) }),
    });

    mount(
      <MultiplayerRoomGate database={database} gameId="ab12cd">
        {() => <div>Quest App</div>}
      </MultiplayerRoomGate>,
    );

    await act(async () => {
      await flushEffects();
    });

    expect(serviceMocks.pruneRoomActionLog).toHaveBeenCalledWith(database, "ab12cd");
  });

  it("keeps action logs at the maintenance threshold", async () => {
    subscribeWith({
      status: "ready",
      room: makeRoom({ actionLog: makeActionLog(60) }),
    });

    mount(
      <MultiplayerRoomGate database={database} gameId="ab12cd">
        {() => <div>Quest App</div>}
      </MultiplayerRoomGate>,
    );

    await act(async () => {
      await flushEffects();
    });

    expect(serviceMocks.pruneRoomActionLog).not.toHaveBeenCalled();
  });

  it("shows Firebase setup issue when presence cannot be written", async () => {
    serviceMocks.writePresence.mockRejectedValue(new Error("Presence denied"));
    const subscription = subscribeManually();
    const { container } = mount(
      <MultiplayerRoomGate database={database} gameId="ab12cd">
        {() => <div>Quest App</div>}
      </MultiplayerRoomGate>,
    );

    await act(async () => {
      subscription.emit({ status: "ready", room: makeRoom() });
      await flushEffects();
    });

    expect(container.textContent).toContain("Firebase setup issue");
    expect(container.textContent).toContain("Presence denied");
  });

  it("creates a client id when crypto.randomUUID is unavailable", () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: vi.fn((bytes: Uint8Array) => {
          bytes.set([
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
            0x0d, 0x0e, 0x0f,
          ]);
          return bytes;
        }),
      },
    });
    subscribeWith({ status: "ready", room: makeRoom() });

    const { container } = mount(
      <MultiplayerRoomGate database={database} gameId="ab12cd">
        {(session) => <div data-child-client={session.clientId}>Quest App</div>}
      </MultiplayerRoomGate>,
    );

    expect(container.querySelector("[data-child-client]")?.getAttribute("data-child-client")).toBe(
      "client-000102030405060708090a0b0c0d0e0f",
    );
  });

  it("shows missing room state", () => {
    subscribeWith({ status: "missing" });

    const { container } = mount(
      <MultiplayerRoomGate database={database} gameId="ab12cd">
        {() => <div>Quest App</div>}
      </MultiplayerRoomGate>,
    );

    expect(container.textContent).toContain("Game not found");
    expect(createButton(container).textContent).toBe("Create New Game");
  });

  it("shows Firebase errors", () => {
    subscribeWith({ status: "error", message: "Permission denied" });

    const { container } = mount(
      <MultiplayerRoomGate database={database} gameId="ab12cd">
        {() => <div>Quest App</div>}
      </MultiplayerRoomGate>,
    );

    expect(container.textContent).toContain("Firebase setup issue");
    expect(container.textContent).toContain("Permission denied");
    expect(container.textContent).toContain("VITE_FIREBASE_API_KEY");
    expect(container.textContent).toContain("VITE_FIREBASE_DATABASE_URL");
  });
});
