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
import type { EncodedLogNode, EngineConfig, GameEvent, Genesis } from "./types";

interface ToyState {
  acc: number;
  seqs: number[];
}

const GENESIS: Genesis = { seed: "toy-seed", reducerVersion: "v1", createdAt: 0 };

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
