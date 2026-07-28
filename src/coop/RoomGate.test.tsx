// @vitest-environment jsdom

// Rendering tests for RoomGate's content-config gate: a delivered genesis whose
// pinned `contentConfig` differs from this client's local runtime config shows
// the read-only config gate; a matching one mounts the room's children. Firebase
// and the room/sink IO are mocked so the gate logic is exercised in isolation,
// mirroring the version-gate wiring.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Genesis, LogNode } from "../eventlog/types";
import type { RuntimeConfig } from "../runtime/runtime-config";

const BUILD_HASH = "build-1";

// Captured subscriber so a test can hand RoomGate a chosen log node.
let deliverNode: ((node: LogNode) => void) | null = null;

vi.mock("./build-hash", () => ({
  getBuildHash: () => BUILD_HASH,
}));

vi.mock("../eventlog/subscribe", () => ({
  subscribeToLog: (_db: unknown, _roomId: unknown, onNode: (node: LogNode) => void) => {
    deliverNode = onNode;
    return () => {
      deliverNode = null;
    };
  },
}));

vi.mock("../eventlog/room", async () => {
  const actual = await vi.importActual<typeof import("../eventlog/room")>("../eventlog/room");
  return {
    ...actual,
    mintClientId: () => "client-test",
    generateRoomId: () => "newrm2",
    createRoomEvictingStale: vi.fn().mockResolvedValue(undefined),
    writePresence: vi.fn().mockResolvedValue(undefined),
    connectedClientCount: () => 0,
  };
});

vi.mock("./journey-log-sink", () => ({
  installJourneyLogSink: () => ({
    flushNow: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("firebase/database", () => ({
  onValue: () => () => {},
  ref: () => ({}),
}));

// Imported after the mocks are registered.
const { RoomGate } = await import("./RoomGate");

function runtimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    seedOverride: null,
    aiMode: true,
    gameId: "abc123",
    databaseMode: "emulator",
    poolVariant: "tides4",
    draftMode: "pool",
    fresh20PackSize: undefined,
    ...overrides,
  };
}

function genesisWith(contentConfig: Genesis["contentConfig"]): Genesis {
  return {
    seed: "seed-1",
    reducerVersion: BUILD_HASH,
    createdAt: 0,
    contentConfig,
  };
}

function nodeWith(genesis: Genesis): LogNode {
  return {
    genesis,
    baseSeq: 0,
    baseSnapshot: null,
    head: 0,
    events: new Map(),
    appliedIndex: new Map(),
  };
}

let container: HTMLDivElement;
let root: Root;

function mount(config: RuntimeConfig): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <RoomGate db={{} as never} gameId={config.gameId} runtimeConfig={config}>
        {() => <div data-room-children="true">room children</div>}
      </RoomGate>,
    );
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  deliverNode = null;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("RoomGate content-config gate", () => {
  it("renders the config gate when genesis.contentConfig differs from the local runtime config", async () => {
    mount(runtimeConfig());
    await flush();

    // Room pinned a different pool variant than the local config.
    act(() => {
      deliverNode?.(
        nodeWith(
          genesisWith({
            poolVariant: "idf3",
            draftMode: "pool",
            fresh20PackSize: null,
          }),
        ),
      );
    });
    await flush();

    expect(container.querySelector("[data-config-gate]")).not.toBeNull();
    expect(container.querySelector("[data-room-children]")).toBeNull();
  });

  it("mounts children when contentConfig matches", async () => {
    mount(runtimeConfig());
    await flush();

    // Room's pinned config equals contentConfigFromRuntime(runtimeConfig()).
    act(() => {
      deliverNode?.(
        nodeWith(
          genesisWith({
            poolVariant: "tides4",
            draftMode: "pool",
            fresh20PackSize: null,
          }),
        ),
      );
    });
    await flush();

    expect(container.querySelector("[data-config-gate]")).toBeNull();
    expect(container.querySelector("[data-room-children]")).not.toBeNull();
  });

  it("treats a genesis with no contentConfig as a mismatch (config gate)", async () => {
    mount(runtimeConfig());
    await flush();

    const legacyGenesis = {
      seed: "seed-1",
      reducerVersion: BUILD_HASH,
      createdAt: 0,
    } as unknown as Genesis;
    act(() => {
      deliverNode?.(nodeWith(legacyGenesis));
    });
    await flush();

    expect(container.querySelector("[data-config-gate]")).not.toBeNull();
    expect(container.querySelector("[data-room-children]")).toBeNull();
  });
});
