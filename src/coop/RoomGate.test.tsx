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
import { resetLog } from "../logging";
import type { RuntimeConfig } from "../runtime/runtime-config";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";

const REDUCER_VERSION = "dreamtides-coop-v16";
const ATLAS_FOLD_HASH = "fixture-atlas-fold-hash";
const DRAFT_DATA = draftDataFixture();
const ECONOMY = economyFixture();
const PINNED_ECONOMY = {
  economyFoldHash: ECONOMY.foldHash,
  defaultStartingEssence: ECONOMY.journey.defaultStartingEssence,
  dreamsignCap: ECONOMY.journey.dreamsignCap,
  opponentsFoldHash: opponentsFixture().foldHash,
};

// Captured subscriber so a test can hand RoomGate a chosen log node.
let deliverNode: ((node: LogNode) => void) | null = null;

vi.mock("./build-hash", () => ({
  getBuildHash: () => "build-1",
}));

vi.mock("../eventlog/subscribe", () => ({
  subscribeToLog: (
    _db: unknown,
    _roomId: unknown,
    onNode: (node: LogNode) => void,
  ) => {
    deliverNode = onNode;
    return () => {
      deliverNode = null;
    };
  },
}));

vi.mock("../eventlog/room", async () => {
  const actual =
    await vi.importActual<typeof import("../eventlog/room")>(
      "../eventlog/room",
    );
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
const { createFreshGenesis, RoomGate, roomScopedClientId } =
  await import("./RoomGate");

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
    reducerVersion: REDUCER_VERSION,
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
let root: Root | null = null;

function mount(config: RuntimeConfig): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <RoomGate
        db={{} as never}
        gameId={config.gameId}
        runtimeConfig={config}
        atlasFoldHash={ATLAS_FOLD_HASH}
        draftData={DRAFT_DATA}
        economyData={ECONOMY}
        opponentsData={opponentsFixture()}
      >
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
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  deliverNode = null;
  resetLog();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("RoomGate content-config gate", () => {
  it("pins new rooms to the semantic reducer protocol", () => {
    const genesis = createFreshGenesis({
      poolVariant: "tides4",
      draftMode: "pool",
      fresh20PackSize: null,
      atlasFoldHash: ATLAS_FOLD_HASH,
      draftFoldHash: DRAFT_DATA.foldHash,
      ...PINNED_ECONOMY,
    });

    expect(genesis.reducerVersion).toBe(REDUCER_VERSION);
    expect(genesis.contentConfig.atlasFoldHash).toBe(ATLAS_FOLD_HASH);
  });

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
            atlasFoldHash: ATLAS_FOLD_HASH,
            draftFoldHash: DRAFT_DATA.foldHash,
            ...PINNED_ECONOMY,
          }),
        ),
      );
    });
    await flush();

    expect(container.querySelector("[data-config-gate]")).not.toBeNull();
    expect(container.querySelector("[data-room-children]")).toBeNull();
    expect(container.textContent).toContain("Use This Game’s Settings");
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
            atlasFoldHash: ATLAS_FOLD_HASH,
            draftFoldHash: DRAFT_DATA.foldHash,
            ...PINNED_ECONOMY,
          }),
        ),
      );
    });
    await flush();

    expect(container.querySelector("[data-config-gate]")).toBeNull();
    expect(container.querySelector("[data-room-children]")).not.toBeNull();
  });

  it("gates a room pinned to different opponent rules", async () => {
    mount(runtimeConfig());
    await flush();

    act(() => {
      deliverNode?.(
        nodeWith(
          genesisWith({
            poolVariant: "tides4",
            draftMode: "pool",
            fresh20PackSize: null,
            atlasFoldHash: ATLAS_FOLD_HASH,
            draftFoldHash: DRAFT_DATA.foldHash,
            ...PINNED_ECONOMY,
            opponentsFoldHash: "c".repeat(64),
          }),
        ),
      );
    });
    await flush();

    expect(container.querySelector("[data-config-gate]")).not.toBeNull();
    expect(container.textContent).toContain("Opponent Rules");
  });

  it("does not adopt a room whose Draft fold hash differs", async () => {
    mount(runtimeConfig());
    await flush();

    act(() => {
      deliverNode?.(
        nodeWith(
          genesisWith({
            poolVariant: "tides4",
            draftMode: "pool",
            fresh20PackSize: null,
            atlasFoldHash: ATLAS_FOLD_HASH,
            draftFoldHash: "different-draft-fold-hash",
            ...PINNED_ECONOMY,
          }),
        ),
      );
    });
    await flush();

    expect(container.querySelector("[data-config-gate]")).not.toBeNull();
    expect(container.textContent).toContain("Start a New Game");
    expect(container.textContent).not.toContain("Use This Game’s Settings");
  });

  it("treats a genesis with no contentConfig as a mismatch (config gate)", async () => {
    mount(runtimeConfig());
    await flush();

    const legacyGenesis: Genesis = {
      seed: "seed-1",
      reducerVersion: REDUCER_VERSION,
      createdAt: 0,
    };
    act(() => {
      deliverNode?.(nodeWith(legacyGenesis));
    });
    await flush();

    expect(container.querySelector("[data-config-gate]")).not.toBeNull();
    expect(container.querySelector("[data-room-children]")).toBeNull();
    expect(container.textContent).toContain("Start a New Game");
  });

  it("does not adopt a room whose Atlas fold hash differs", async () => {
    mount(runtimeConfig());
    await flush();

    act(() => {
      deliverNode?.(
        nodeWith(
          genesisWith({
            poolVariant: "tides4",
            draftMode: "pool",
            fresh20PackSize: null,
            atlasFoldHash: "different-atlas-fold-hash",
            ...PINNED_ECONOMY,
          }),
        ),
      );
    });
    await flush();

    expect(container.querySelector("[data-config-gate]")).not.toBeNull();
    expect(container.textContent).toContain("Start a New Game");
    expect(container.textContent).not.toContain("Use This Game’s Settings");
  });

  it("does not adopt a room whose economy fold hash differs", async () => {
    mount(runtimeConfig());
    await flush();

    act(() => {
      deliverNode?.(
        nodeWith(
          genesisWith({
            poolVariant: "tides4",
            draftMode: "pool",
            fresh20PackSize: null,
            atlasFoldHash: ATLAS_FOLD_HASH,
            ...PINNED_ECONOMY,
            economyFoldHash: "different-economy-fold-hash",
          }),
        ),
      );
    });
    await flush();

    expect(container.querySelector("[data-config-gate]")).not.toBeNull();
    expect(container.textContent).toContain("Start a New Game");
    expect(container.textContent).not.toContain("Use This Game’s Settings");
  });

  it("gates a current-version genesis whose content config predates Atlas hashes", async () => {
    mount(runtimeConfig());
    await flush();

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

    expect(container.querySelector("[data-config-gate]")).not.toBeNull();
    expect(container.textContent).toContain("Start a New Game");
  });

  it("renders the version gate for a prior reducer build", async () => {
    mount(runtimeConfig());
    await flush();

    act(() => {
      deliverNode?.(
        nodeWith({
          ...genesisWith({
            poolVariant: "tides4",
            draftMode: "pool",
            fresh20PackSize: null,
            atlasFoldHash: ATLAS_FOLD_HASH,
            ...PINNED_ECONOMY,
          }),
          reducerVersion: "0dfbc840a6a3-6d94b82e9b7a",
        }),
      );
    });
    await flush();

    expect(container.querySelector("[data-version-gate]")).not.toBeNull();
    expect(container.querySelector("[data-room-children]")).toBeNull();
  });

  it("renders the version gate for an incompatible reducer protocol", async () => {
    mount(runtimeConfig());
    await flush();

    act(() => {
      deliverNode?.(
        nodeWith({
          ...genesisWith({
            poolVariant: "tides4",
            draftMode: "pool",
            fresh20PackSize: null,
            atlasFoldHash: ATLAS_FOLD_HASH,
            ...PINNED_ECONOMY,
          }),
          reducerVersion: "incompatible-rules-v2",
        }),
      );
    });
    await flush();

    expect(container.querySelector("[data-version-gate]")).not.toBeNull();
    expect(container.querySelector("[data-room-children]")).toBeNull();
  });
});

describe("room-scoped client identity", () => {
  it("reuses the stored identity when a controlling tab reloads", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };

    const first = roomScopedClientId("room42", storage);
    const reloaded = roomScopedClientId("room42", storage);

    expect(reloaded).toBe(first);
  });
});
