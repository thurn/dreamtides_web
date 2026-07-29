import { describe, expect, it, vi } from "vitest";
import type { EncodedLogNode, EngineConfig, GameEvent, Genesis } from "./types";

const firebase = vi.hoisted<{
  current: EncodedLogNode | null;
  options: unknown;
}>(() => ({ current: null, options: null }));

vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path: string) => ({ path }),
  runTransaction: vi.fn(
    (
      _ref: unknown,
      updater: (current: EncodedLogNode | null) => EncodedLogNode | undefined,
      options: unknown,
    ) => {
      firebase.options = options;
      const next = updater(firebase.current);
      if (next === undefined) {
        return Promise.resolve({
          committed: false,
          snapshot: { val: () => firebase.current },
        });
      }
      firebase.current = next;
      return Promise.resolve({
        committed: true,
        snapshot: { val: () => firebase.current },
      });
    },
  ),
}));

const { appendEvent } = await import("./append");

interface State {
  count: number;
}

const genesis: Genesis = {
  seed: "seed",
  reducerVersion: "v1",
  createdAt: 0,
  contentConfig: {
    poolVariant: "test",
    draftMode: "pool",
    fresh20PackSize: null,
  },
};

const config: EngineConfig<State> = {
  genesisState: () => ({ count: 0 }),
  reducer: (state) => ({
    state: { count: state.count + 1 },
    outcome: "applied",
  }),
  encode: JSON.stringify,
  decode: (raw) => JSON.parse(raw) as State,
  hash: JSON.stringify,
};

function event(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    type: "T",
    payload: {},
    actor: "client-a",
    clientTimestamp: "0",
    basedOnSeq: 0,
    ...overrides,
  };
}

function emptyLog(): EncodedLogNode {
  return {
    genesis: JSON.stringify(genesis),
    baseSeq: 0,
    baseSnapshot: null,
    head: 0,
    events: {},
  };
}

describe("appendEvent Firebase transaction behavior", () => {
  it("disables Firebase local transaction events", async () => {
    firebase.current = emptyLog();

    await appendEvent({} as never, "room", config, event({ nonce: "n-1" }));

    expect(firebase.options).toEqual({ applyLocally: false });
  });

  it("returns the original winner sequence for duplicate intent keys", async () => {
    firebase.current = emptyLog();
    await expect(
      appendEvent(
        {} as never,
        "room",
        config,
        event({ nonce: "n-1", intentKey: "logical-transition" }),
      ),
    ).resolves.toBe(1);
    await expect(
      appendEvent(
        {} as never,
        "room",
        config,
        event({
          actor: "client-b",
          nonce: "n-2",
          intentKey: "logical-transition",
          payload: { different: true },
        }),
      ),
    ).resolves.toBe(1);
    expect(firebase.current?.head).toBe(1);
  });

  it("returns the original winner when a joining client's RTDB node omits baseSnapshot", async () => {
    firebase.current = emptyLog();
    await appendEvent(
      {} as never,
      "room",
      config,
      event({ nonce: "host-1", intentKey: "tutorial:journey-1:begin" }),
    );
    if (firebase.current !== null) {
      delete firebase.current.baseSnapshot;
    }

    await expect(
      appendEvent(
        {} as never,
        "room",
        config,
        event({
          actor: "joining-client",
          nonce: "joiner-1",
          intentKey: "tutorial:journey-1:begin",
        }),
      ),
    ).resolves.toBe(1);
    expect(firebase.current?.head).toBe(1);
  });
});
