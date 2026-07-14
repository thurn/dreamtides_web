// Unit tests for the pure append updater and its in-transaction compaction.
//
// These tests use a TOY reducer/config only (no game imports). The single
// most important property here is compaction-equivalence: folding the
// post-compaction snapshot + live events must yield a byte-identical state to
// folding every original event from genesis. If compaction ever changed the
// meaning of the log, the engine would silently diverge between clients.

import { describe, expect, it } from "vitest";
import {
  COMPACT_TARGET,
  COMPACT_THRESHOLD,
  applyAppend,
  decodeEvent,
} from "./append";
import { foldEvents } from "./fold";
import { hashState } from "./hash";
import type { EncodedLogNode, EngineConfig, EventContext, EventOutcome, GameEvent, Genesis } from "./types";

interface ToyState {
  acc: number;
  seqs: number[];
}

const GENESIS: Genesis = { seed: "toy-seed", reducerVersion: "v1", createdAt: 0, contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null, journeyVariant: "v2" } };

// A pure left-fold whose result depends on (prior state, payload, seq-keyed
// rng, seq) but NOT on `intervening` or the snapshot horizon. That makes a
// full fold from genesis and a split fold across any compaction boundary
// mechanically equivalent, so the test isolates whether `applyAppend` folds
// the RIGHT events onto the RIGHT base at the RIGHT seqs.
const config: EngineConfig<ToyState> = {
  genesisState: () => ({ acc: 0, seqs: [] }),
  reducer: (state, event, ctx) => {
    const n = (event.payload.n as number) ?? 0;
    const draw = Math.floor(ctx.rng(0) * 1_000_000);
    return {
      state: { acc: state.acc + n + draw + ctx.seq, seqs: [...state.seqs, ctx.seq] },
      outcome: "applied",
    };
  },
  encode: (s) => JSON.stringify(s),
  decode: (raw) => JSON.parse(raw) as ToyState,
  hash: (s) => hashState(s),
};

function makeEvent(n: number): GameEvent {
  return { type: "T", payload: { n }, actor: "a", clientTimestamp: "0", basedOnSeq: 0 };
}

function emptyLog(): EncodedLogNode {
  return { genesis: JSON.stringify(GENESIS), baseSeq: 0, baseSnapshot: null, head: 0, events: {} };
}

/** Applies `count` events (payload n = 1..count) one at a time. */
function appendN(count: number): { log: EncodedLogNode; events: GameEvent[] } {
  let log = emptyLog();
  const events: GameEvent[] = [];
  for (let i = 1; i <= count; i++) {
    const ev = makeEvent(i);
    events.push(ev);
    log = applyAppend(config, log, ev);
  }
  return { log, events };
}

function numericEventKeys(log: EncodedLogNode): number[] {
  return Object.keys(log.events)
    .map(Number)
    .sort((a, b) => a - b);
}

describe("applyAppend compaction thresholds", () => {
  it("does not compact at exactly COMPACT_THRESHOLD live events", () => {
    const { log } = appendN(COMPACT_THRESHOLD);
    expect(log.head).toBe(COMPACT_THRESHOLD);
    expect(log.baseSeq).toBe(0);
    expect(log.baseSnapshot).toBeNull();
    expect(numericEventKeys(log)).toHaveLength(COMPACT_THRESHOLD);
  });

  it("compacts at COMPACT_THRESHOLD + 1 live events", () => {
    const { log } = appendN(COMPACT_THRESHOLD + 1);
    expect(log.head).toBe(COMPACT_THRESHOLD + 1);
    expect(log.baseSeq).toBe(COMPACT_THRESHOLD + 1 - COMPACT_TARGET);
    expect(log.baseSnapshot).not.toBeNull();
  });
});

describe("applyAppend containment (P1-5)", () => {
  it("commits the append and skips compaction when the compaction fold throws", () => {
    // A node already AT the threshold whose genesis JSON is corrupt: appending
    // one more event crosses the threshold, and the compaction block's
    // `JSON.parse(genesis)` throws. The append must still commit (the event is
    // added, compaction is skipped) rather than throw out of the updater.
    const events: { [seq: number]: string } = {};
    for (let seq = 1; seq <= COMPACT_THRESHOLD; seq++) {
      events[seq] = JSON.stringify(makeEvent(seq));
    }
    const node: EncodedLogNode = {
      genesis: "{ not valid json",
      baseSeq: 0,
      baseSnapshot: null,
      head: COMPACT_THRESHOLD,
      events,
    };

    let next: EncodedLogNode | undefined;
    expect(() => {
      next = applyAppend(config, node, makeEvent(999));
    }).not.toThrow();

    // The event committed at head + 1; compaction was skipped this pass
    // (baseSeq unmoved, no snapshot), leaving the live events to accumulate.
    expect(next?.head).toBe(COMPACT_THRESHOLD + 1);
    expect(next?.baseSeq).toBe(0);
    expect(next?.baseSnapshot).toBeNull();
    expect(next?.compactionError).toMatchObject({
      head: COMPACT_THRESHOLD + 1,
      baseSeq: 0,
      attemptedBaseSeq: COMPACT_THRESHOLD + 1 - COMPACT_TARGET,
    });
    expect(next?.compactionError?.message).toMatch(/json/i);
    expect(numericEventKeys(next as EncodedLogNode)).toHaveLength(COMPACT_THRESHOLD + 1);
  });

  it("clears a previous compaction error after a later compaction succeeds", () => {
    const before = appendN(COMPACT_THRESHOLD).log;
    const node: EncodedLogNode = {
      ...before,
      compactionError: {
        head: before.head,
        baseSeq: before.baseSeq,
        attemptedBaseSeq: 99,
        message: "previous failure",
      },
    };

    const next = applyAppend(config, node, makeEvent(999));

    expect(next.baseSeq).toBe(COMPACT_THRESHOLD + 1 - COMPACT_TARGET);
    expect(next.baseSnapshot).not.toBeNull();
    expect(next.compactionError).toBeUndefined();
  });
});

describe("applyAppend nonce dedup", () => {
  it("no-ops a duplicate nonce already present in the live event window", () => {
    const first = { ...makeEvent(1), nonce: "client-a:1" };
    const retry = { ...makeEvent(999), nonce: "client-a:1" };
    const afterFirst = applyAppend(config, emptyLog(), first);

    const afterRetry = applyAppend(config, afterFirst, retry);

    expect(afterRetry).toBe(afterFirst);
    expect(afterRetry.head).toBe(1);
    expect(numericEventKeys(afterRetry)).toEqual([1]);
    expect(decodeEvent(afterRetry.events[1])).toEqual(first);
  });

  it("no-ops a repeated logical intent even when another client supplies a new nonce", () => {
    const first = {
      ...makeEvent(1),
      actor: "client-a",
      nonce: "client-a:1",
      intentKey: "open-site:site-7",
    };
    const retry = {
      ...makeEvent(999),
      actor: "client-b",
      nonce: "client-b:4",
      intentKey: "open-site:site-7",
    };
    const afterFirst = applyAppend(config, emptyLog(), first);

    const afterRetry = applyAppend(config, afterFirst, retry);

    expect(afterRetry).toBe(afterFirst);
    expect(afterRetry.head).toBe(1);
    expect(decodeEvent(afterRetry.events[1])).toEqual(first);
  });

  it("retains logical intent deduplication after the winning event is compacted", () => {
    const first = {
      ...makeEvent(1),
      nonce: "client-a:1",
      intentKey: "complete-site:quest:9:site-7",
    };
    let log = applyAppend(config, emptyLog(), first);
    for (let index = 2; index <= COMPACT_THRESHOLD + 1; index += 1) {
      log = applyAppend(config, log, makeEvent(index));
    }
    expect(log.baseSeq).toBeGreaterThanOrEqual(1);
    expect(log.events[1]).toBeUndefined();

    const retry = {
      ...makeEvent(999),
      actor: "client-b",
      nonce: "client-b:4",
      intentKey: first.intentKey,
    };
    const afterRetry = applyAppend(config, log, retry);

    expect(afterRetry).toBe(log);
    expect(afterRetry.head).toBe(COMPACT_THRESHOLD + 1);
  });
});

describe("applyAppend keeps events dense", () => {
  it("leaves exactly the dense integer keys (baseSeq, head] after compaction", () => {
    const { log } = appendN(COMPACT_THRESHOLD + 1);
    const expected: number[] = [];
    for (let seq = log.baseSeq + 1; seq <= log.head; seq++) {
      expected.push(seq);
    }
    expect(numericEventKeys(log)).toEqual(expected);
    expect(numericEventKeys(log)).toHaveLength(COMPACT_TARGET);
  });

  it("does not mutate its input node (safe across transaction retries)", () => {
    const before = appendN(COMPACT_THRESHOLD).log;
    const snapshotKeys = numericEventKeys(before);
    const snapshotHead = before.head;
    const next = applyAppend(config, before, makeEvent(999));
    // Input untouched.
    expect(before.head).toBe(snapshotHead);
    expect(numericEventKeys(before)).toEqual(snapshotKeys);
    expect(before.baseSeq).toBe(0);
    // Output advanced.
    expect(next.head).toBe(snapshotHead + 1);
  });
});

describe("compaction-equivalence invariant", () => {
  it("fold(genesis, allEvents) equals fold(decode(baseSnapshot), liveEvents) after repeated compaction", () => {
    // 350 events triggers compaction twice (at head 201 and head 302).
    const { log, events } = appendN(350);
    expect(log.baseSnapshot).not.toBeNull();
    // Two compactions moved baseSeq to 202.
    expect(log.baseSeq).toBeGreaterThan(COMPACT_TARGET);

    const fullEvents = events.map((event, i) => ({ seq: i + 1, event }));
    const fullState = foldEvents(
      config,
      GENESIS,
      { seq: 0, state: config.genesisState(GENESIS) },
      fullEvents,
    ).state;

    const liveEvents = numericEventKeys(log).map((seq) => ({
      seq,
      event: decodeEvent(log.events[seq]),
    }));
    const liveState = foldEvents(
      config,
      GENESIS,
      { seq: log.baseSeq, state: config.decode(log.baseSnapshot as string) },
      liveEvents,
    ).state;

    expect(hashState(liveState)).toBe(hashState(fullState));
  });
});

// ---------------------------------------------------------------------------
// Outcome-immutability across compaction (audit finding P0-1).
//
// A CAS-sensitive toy reducer whose outcome depends on `intervening`: an ADD
// bounces if any APPLIED partner event (a different actor) intervened, or if
// the intervening window is "unknown". A pure self-chain (one actor, all
// basedOnSeq 0) must therefore apply EVERY event — and must keep doing so
// after the events fall below the compaction horizon, because compaction now
// persists the applied index that lets the window stay enumerable.
// ---------------------------------------------------------------------------

interface CasState {
  applied: number[];
}

const CAS_GENESIS: Genesis = { seed: "cas-seed", reducerVersion: "v1", createdAt: 0, contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null, journeyVariant: "v2" } };

const casConfig: EngineConfig<CasState> = {
  genesisState: () => ({ applied: [] }),
  reducer: (state: CasState, event: GameEvent, ctx: EventContext): { state: CasState; outcome: EventOutcome } => {
    if (ctx.intervening === "unknown") {
      return { state, outcome: "bounced" };
    }
    if (ctx.intervening.some((entry) => entry.actor !== event.actor)) {
      return { state, outcome: "bounced" };
    }
    return { state: { applied: [...state.applied, ctx.seq] }, outcome: "applied" };
  },
  encode: (s) => JSON.stringify(s),
  decode: (raw) => JSON.parse(raw) as CasState,
  hash: (s) => hashState(s),
};

function casEvent(): GameEvent {
  // Pure self-chain: same actor, always based on genesis (seq 0).
  return { type: "ADD", payload: {}, actor: "A", clientTimestamp: "0", basedOnSeq: 0 };
}

/** Appends `count` pure-self-chain CAS events one at a time via applyAppend. */
function appendCasChain(count: number): { log: EncodedLogNode; events: GameEvent[] } {
  let log: EncodedLogNode = {
    genesis: JSON.stringify(CAS_GENESIS),
    baseSeq: 0,
    baseSnapshot: null,
    head: 0,
    events: {},
  };
  const events: GameEvent[] = [];
  for (let i = 1; i <= count; i++) {
    const ev = casEvent();
    events.push(ev);
    log = applyAppend(casConfig, log, ev);
  }
  return { log, events };
}

describe("applyAppend outcome-immutability across compaction", () => {
  it("a stale-basedOnSeq self-chain keeps its applied outcome across two compactions", () => {
    // Enough events (> 2 * COMPACT_THRESHOLD) that compaction runs at least
    // twice, pushing the earliest events well below the second horizon.
    const count = 2 * COMPACT_THRESHOLD + 10;
    const { log, events } = appendCasChain(count);
    expect(log.baseSeq).toBeGreaterThan(COMPACT_THRESHOLD);
    expect(log.baseSnapshot).not.toBeNull();

    // Fold every original event from genesis (base.seq 0 — full enumeration).
    const fullEvents = events.map((event, i) => ({ seq: i + 1, event }));
    const fullResult = foldEvents(
      casConfig,
      CAS_GENESIS,
      { seq: 0, state: casConfig.genesisState(CAS_GENESIS) },
      fullEvents,
    );

    // Fold the compacted snapshot + the remaining live events, seeding the
    // persisted applied index so the below-horizon window stays enumerable.
    const liveEvents = numericEventKeys(log).map((seq) => ({
      seq,
      event: decodeEvent(log.events[seq]),
    }));
    const liveResult = foldEvents(
      casConfig,
      CAS_GENESIS,
      { seq: log.baseSeq, state: casConfig.decode(log.baseSnapshot as string) },
      liveEvents,
      { appliedBySeq: decodeIndexForTest(log.appliedIndex), coveredFromSeq: 0 },
    );

    // Same final state AND hash: every event applied on both paths.
    expect(hashState(liveResult.state)).toBe(hashState(fullResult.state));

    // The whole self-chain applied on the from-genesis path (nothing bounced).
    expect(fullResult.outcomes.every((o) => o.outcome === "applied")).toBe(true);

    // Per-seq outcomes agree for every live seq (applied on both paths).
    const fullBySeq = new Map(fullResult.outcomes.map((o) => [o.seq, o.outcome]));
    for (const outcome of liveResult.outcomes) {
      expect(outcome.outcome).toBe(fullBySeq.get(outcome.seq));
      expect(outcome.outcome).toBe("applied");
    }
  });

  it("compaction writes an appliedIndex covering exactly the applied seqs <= baseSeq", () => {
    const count = 2 * COMPACT_THRESHOLD + 10;
    const { log } = appendCasChain(count);

    const index = decodeIndexForTest(log.appliedIndex);
    // Every applied event with seq in (0, baseSeq] is present — the whole
    // self-chain applies, so that is exactly seqs 1..baseSeq.
    const keys = [...index.keys()].sort((a, b) => a - b);
    const expected: number[] = [];
    for (let seq = 1; seq <= log.baseSeq; seq++) {
      expected.push(seq);
    }
    expect(keys).toEqual(expected);
    // No entry above the horizon leaks into the persisted index.
    for (const seq of keys) {
      expect(seq).toBeLessThanOrEqual(log.baseSeq);
    }
    expect(index.get(1)).toEqual({ actor: "A", type: "ADD" });
  });
});

/**
 * Test-only decode of the persisted appliedIndex JSON into a seq -> entry map.
 * Kept inline so the RED phase does not depend on a production export.
 */
function decodeIndexForTest(raw: string | undefined): Map<number, AppliedEntryShape> {
  const map = new Map<number, AppliedEntryShape>();
  if (raw === undefined) {
    return map;
  }
  const record = JSON.parse(raw) as Record<string, AppliedEntryShape>;
  for (const [key, value] of Object.entries(record)) {
    map.set(Number(key), value);
  }
  return map;
}

interface AppliedEntryShape {
  actor: string;
  type: string;
}
