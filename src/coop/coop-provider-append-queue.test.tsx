// @vitest-environment jsdom

import { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendFn } from "./actions";

// This test exercises the REAL `createLogClient`/`LogClient.submit` — including
// its not-initialized gate (submit REJECTS until the first log node has folded
// and a confirmed baseline exists to stamp `basedOnSeq`). The only fakes are
// the IO surface (`subscribeToLog`/`appendEvent`) and the engine config, wired
// to an in-memory log whose node deliveries land on a MICROTASK. That async
// delivery reproduces production (Firebase `onValue`), where a draft appended
// during the mount-time bootstrap can reach the client before its baseline.
//
// The fake lives in `vi.hoisted` so the hoisted `vi.mock` factories can bind to
// it. A "node delivery" pushes the current log snapshot to the subscriber on a
// microtask; `append` assigns the next dense seq and schedules a delivery.
const fake = vi.hoisted(() => {
  interface FakeEvent {
    type: string;
    payload: Record<string, unknown>;
    actor: string;
    clientTimestamp: string;
    basedOnSeq: number;
    nonce?: string;
    stateHashAfter?: string;
  }
  interface FakeNode {
    genesis: { seed: string; reducerVersion: string; createdAt: number };
    baseSeq: number;
    baseSnapshot: unknown;
    head: number;
    events: Map<number, FakeEvent>;
    appliedIndex: Map<number, { actor: string; type: string }>;
  }
  const genesis = { seed: "s", reducerVersion: "v", createdAt: 0, contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null, atlasFoldHash: "fixture-atlas-fold-hash" } };
  const committed: FakeEvent[] = [];
  let subscriber: ((node: unknown) => void) | null = null;

  function buildNode(): FakeNode {
    const events = new Map<number, FakeEvent>();
    committed.forEach((event, index) => events.set(index + 1, event));
    // Pre-compaction node: no compacted history, so an empty applied index —
    // the LogClient seeds `appliedBySeq` from this on the initial full refold.
    return {
      genesis,
      baseSeq: 0,
      baseSnapshot: null,
      head: committed.length,
      events,
      appliedIndex: new Map(),
    };
  }
  function deliver(): void {
    const node = buildNode();
    // Async delivery: the subscriber is invoked on a later microtask, never
    // synchronously — exactly the Firebase `onValue` timing.
    void Promise.resolve().then(() => subscriber?.(node));
  }
  return {
    genesis,
    committedCount: (): number => committed.length,
    subscribe(onNode: (node: unknown) => void): () => void {
      subscriber = onNode;
      deliver(); // initial baseline node (may be empty: head 0)
      return () => {
        subscriber = null;
      };
    },
    append(event: unknown): Promise<number> {
      committed.push(event as FakeEvent);
      const seq = committed.length;
      deliver();
      return Promise.resolve(seq);
    },
    reset(): void {
      committed.length = 0;
      subscriber = null;
    },
  };
});

vi.mock("../eventlog/subscribe", () => ({
  subscribeToLog: (_db: unknown, _roomId: unknown, onNode: (node: unknown) => void) =>
    fake.subscribe(onNode),
}));
vi.mock("../eventlog/append", () => ({
  appendEvent: (_db: unknown, _roomId: unknown, _config: unknown, event: unknown) =>
    fake.append(event),
}));
// A toy engine config: every event applies and bumps a counter. JSON encode/
// decode/hash keep it deterministic so the divergence tripwire stays quiet.
vi.mock("../rules/replay/replay", () => ({
  GAME_ENGINE_CONFIG: {
    genesisState: () => ({ n: 0 }),
    reducer: (state: { n: number }) => ({ state: { n: state.n + 1 }, outcome: "applied" }),
    encode: (state: unknown) => JSON.stringify(state),
    decode: (raw: string) => JSON.parse(raw) as unknown,
    hash: (state: unknown) => JSON.stringify(state),
  },
}));
// The presence subscription reaches for the real Firebase RTDB; stub it out so
// the fake `db` never hits Firebase internals.
vi.mock("firebase/database", () => ({
  ref: vi.fn(() => ({})),
  onValue: vi.fn(() => () => {}),
}));

import { CoopProvider, useAppend, useEventOutcomes } from "./hooks";
import type { RoomReadyContext } from "./RoomGate";

function makeContext(): RoomReadyContext {
  return {
    db: {} as RoomReadyContext["db"],
    roomId: "room-1",
    clientId: "client-test",
    genesis: fake.genesis,
    logSink: {
      recordCoopEvent: () => false,
      recordBounce: () => {},
      recordDivergence: () => {},
    } as unknown as RoomReadyContext["logSink"],
  };
}

/**
 * Appends drafts in its OWN mount effect. React flushes child effects before
 * the parent CoopProvider's client-creating effect, so at these calls the
 * LogClient does not yet exist (or has no baseline) — the `?goto=` bootstrap
 * race. Each draft's resolved seq is reported via `onSeq`.
 */
function BootstrapChild({
  types,
  onSeq,
}: {
  types: string[];
  onSeq: (type: string, seq: number) => void;
}): null {
  const append = useAppend();
  useEffect(() => {
    for (const type of types) {
      void append({ type, payload: {} }).then((seq) => onSeq(type, seq));
    }
  }, [append, onSeq, types]);
  return null;
}

/** Collects confirmed event outcomes (fired once per confirmed seq). */
function OutcomeCollector({
  onOutcome,
}: {
  onOutcome: (type: string, seq: number, outcome: string) => void;
}): null {
  useEventOutcomes((event, seq, outcome) => onOutcome(event.type, seq, outcome));
  return null;
}

/** Hands the live `append` fn to the test so it can append after the baseline. */
function CaptureAppend({ onReady }: { onReady: (append: AppendFn) => void }): null {
  const append = useAppend();
  useEffect(() => onReady(append), [append, onReady]);
  return null;
}

describe("CoopProvider append queue (real LogClient submit gate)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fake.reset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function settle(): Promise<void> {
    // Drain the chained microtask deliveries (subscribe -> flush -> submit ->
    // append -> re-delivery -> fold) until quiescent.
    await act(async () => {
      for (let i = 0; i < 25; i++) {
        await Promise.resolve();
      }
    });
  }

  it("folds a pre-baseline append exactly once after async node delivery", async () => {
    const seqs: Array<[string, number]> = [];
    const outcomes: Array<[string, number, string]> = [];
    await act(async () => {
      root.render(
        <CoopProvider context={makeContext()}>
          <BootstrapChild
            types={["LOAD_STATE"]}
            onSeq={(type, seq) => seqs.push([type, seq])}
          />
          <OutcomeCollector onOutcome={(t, s, o) => outcomes.push([t, s, o])} />
        </CoopProvider>,
      );
      await Promise.resolve();
    });
    await settle();

    // Submitted (not rejected-and-lost): resolved with the committed seq.
    expect(seqs).toEqual([["LOAD_STATE", 1]]);
    // Confirmed-folded EXACTLY ONCE (onEventOutcome fires once per seq).
    const loads = outcomes.filter(([type]) => type === "LOAD_STATE");
    expect(loads).toEqual([["LOAD_STATE", 1, "applied"]]);
  });

  it("flushes two pre-baseline appends in FIFO order", async () => {
    const seqs: Array<[string, number]> = [];
    const outcomes: Array<[string, number, string]> = [];
    await act(async () => {
      root.render(
        <CoopProvider context={makeContext()}>
          <BootstrapChild
            types={["FIRST", "SECOND"]}
            onSeq={(type, seq) => seqs.push([type, seq])}
          />
          <OutcomeCollector onOutcome={(t, s, o) => outcomes.push([t, s, o])} />
        </CoopProvider>,
      );
      await Promise.resolve();
    });
    await settle();

    // FIFO: the first-queued draft gets the earlier seq.
    expect(seqs).toEqual([
      ["FIRST", 1],
      ["SECOND", 2],
    ]);
    // Confirmed in the same order, each exactly once.
    const applied = outcomes.filter(([, , outcome]) => outcome === "applied");
    expect(applied).toEqual([
      ["FIRST", 1, "applied"],
      ["SECOND", 2, "applied"],
    ]);
  });

  it("submits immediately once the baseline exists (no queuing latency)", async () => {
    // A holder (not a bare `let`) so TS does not narrow the captured value to
    // `null` — the assignment happens inside a callback its flow can't see.
    const holder: { append: AppendFn | null } = { append: null };
    await act(async () => {
      root.render(
        <CoopProvider context={makeContext()}>
          <CaptureAppend onReady={(fn) => (holder.append = fn)} />
        </CoopProvider>,
      );
      await Promise.resolve();
    });
    // Let the empty baseline node fold so the client is initialized.
    await settle();
    const append = holder.append;
    if (append === null) {
      throw new Error("append was not captured");
    }
    expect(fake.committedCount()).toBe(0);

    // An append AFTER the baseline calls submit synchronously: io.append runs
    // now (committed count grows immediately), never via the pending queue.
    let resolvedSeq: number | null = null;
    await act(async () => {
      void append({ type: "POST", payload: {} }).then((seq) => {
        resolvedSeq = seq;
      });
      // Synchronously after the call, the event is already committed — proof it
      // was not parked in the pending queue.
      expect(fake.committedCount()).toBe(1);
      await Promise.resolve();
    });
    await settle();
    expect(resolvedSeq).toBe(1);
  });
});
