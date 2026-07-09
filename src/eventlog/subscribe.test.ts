// Unit tests for the pure decode half of the subscription wrapper.
//
// `subscribeToLog` itself is a thin `onValue` wrapper (Firebase, exercised by
// the emulator suite). The interesting, throw-never contract lives in
// `decodeLogNode`, tested here without Firebase: a malformed event string, a
// sparse-array events node, and an object events node must all decode into a
// LogNode that folds cleanly — a malformed entry folding to a bounce, never a
// crash.

import { describe, expect, it } from "vitest";
import { foldEvents } from "./fold";
import { hashState } from "./hash";
import { decodeLogNode } from "./subscribe";
import type { EncodedLogNode, EngineConfig, GameEvent, Genesis } from "./types";

interface ToyState {
  seqs: number[];
}

const GENESIS: Genesis = { seed: "s", reducerVersion: "v1", createdAt: 0, contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null, journeyVariant: "v2" } };

const config: EngineConfig<ToyState> = {
  genesisState: () => ({ seqs: [] }),
  reducer: (state, _event, ctx) => ({
    state: { seqs: [...state.seqs, ctx.seq] },
    outcome: "applied",
  }),
  encode: (s) => JSON.stringify(s),
  decode: (raw) => JSON.parse(raw) as ToyState,
  hash: (s) => hashState(s),
};

function encodeEvent(event: GameEvent): string {
  return JSON.stringify(event);
}

function goodEvent(basedOnSeq: number): GameEvent {
  return { type: "T", payload: {}, actor: "a", clientTimestamp: "0", basedOnSeq };
}

describe("decodeLogNode", () => {
  it("decodes genesis, baseSnapshot, and an object events node", () => {
    const encoded: EncodedLogNode = {
      genesis: JSON.stringify(GENESIS),
      baseSeq: 0,
      baseSnapshot: null,
      head: 2,
      events: { 1: encodeEvent(goodEvent(0)), 2: encodeEvent(goodEvent(1)) },
    };
    const node = decodeLogNode(encoded);
    expect(node).not.toBeNull();
    expect(node?.genesis).toEqual(GENESIS);
    expect(node?.head).toBe(2);
    expect(node?.baseSnapshot).toBeNull();
    expect([...(node?.events.keys() ?? [])].sort((a, b) => a - b)).toEqual([1, 2]);
    // A pre-compaction node has no persisted index -> an empty map.
    expect(node?.appliedIndex.size).toBe(0);
  });

  it("returns null (never throws) for a corrupt genesis string", () => {
    const encoded: EncodedLogNode = {
      genesis: "{ not valid json",
      baseSeq: 0,
      baseSnapshot: null,
      head: 0,
      events: {},
    };
    expect(() => decodeLogNode(encoded)).not.toThrow();
    expect(decodeLogNode(encoded)).toBeNull();
  });

  it("returns null (never throws) for a corrupt baseSnapshot string", () => {
    const encoded: EncodedLogNode = {
      genesis: JSON.stringify(GENESIS),
      baseSeq: 2,
      baseSnapshot: "{ not valid json",
      head: 2,
      events: {},
    };
    expect(() => decodeLogNode(encoded)).not.toThrow();
    expect(decodeLogNode(encoded)).toBeNull();
  });

  it("decodes a persisted appliedIndex into a seq -> {actor, type} map", () => {
    const encoded: EncodedLogNode = {
      genesis: JSON.stringify(GENESIS),
      baseSeq: 2,
      baseSnapshot: JSON.stringify({ seqs: [1, 2] }),
      head: 3,
      events: { 3: encodeEvent(goodEvent(2)) },
      appliedIndex: JSON.stringify({ 1: { actor: "a", type: "T" }, 2: { actor: "b", type: "T" } }),
    };
    const node = decodeLogNode(encoded);
    expect(node).not.toBeNull();
    expect([...(node?.appliedIndex.keys() ?? [])].sort((a, b) => a - b)).toEqual([1, 2]);
    expect(node?.appliedIndex.get(1)).toEqual({ actor: "a", type: "T" });
    expect(node?.appliedIndex.get(2)).toEqual({ actor: "b", type: "T" });
  });

  it("carries a non-null baseSnapshot as the RAW encoded string, not pre-parsed (P3-2)", () => {
    const encoded: EncodedLogNode = {
      genesis: JSON.stringify(GENESIS),
      baseSeq: 2,
      baseSnapshot: JSON.stringify({ seqs: [1, 2] }),
      head: 2,
      events: {},
    };
    const node = decodeLogNode(encoded);
    expect(node).not.toBeNull();
    // Raw string, still valid JSON — decoding it is config.decode's job, not
    // this game-agnostic module's.
    expect(node?.baseSnapshot).toBe(encoded.baseSnapshot);
    expect(typeof node?.baseSnapshot).toBe("string");
    expect(config.decode(node?.baseSnapshot as string)).toEqual({ seqs: [1, 2] });
  });

  it("handles a sparse-array events node (RTDB integer-keyed form)", () => {
    // RTDB may hand back a sparse JS array with holes for missing low indices.
    const sparse: string[] = [];
    sparse[1] = encodeEvent(goodEvent(0));
    sparse[2] = encodeEvent(goodEvent(1));
    const encoded = {
      genesis: JSON.stringify(GENESIS),
      baseSeq: 0,
      baseSnapshot: null,
      head: 2,
      events: sparse as unknown as { [seq: number]: string },
    } satisfies EncodedLogNode;
    const node = decodeLogNode(encoded);
    expect(node).not.toBeNull();
    expect([...(node?.events.keys() ?? [])].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("never throws on a malformed event string and folds it to a bounce", () => {
    const encoded: EncodedLogNode = {
      genesis: JSON.stringify(GENESIS),
      baseSeq: 0,
      baseSnapshot: null,
      head: 2,
      events: { 1: "{not valid json", 2: encodeEvent(goodEvent(1)) },
    };
    const node = decodeLogNode(encoded);
    expect(node).not.toBeNull();
    const events = [...(node?.events.entries() ?? [])]
      .sort((a, b) => a[0] - b[0])
      .map(([seq, event]) => ({ seq, event }));

    const result = foldEvents(
      config,
      GENESIS,
      { seq: 0, state: config.genesisState(GENESIS) },
      events,
    );
    // The malformed entry bounced without reaching the reducer; the good one
    // applied.
    expect(result.outcomes[0].outcome).toBe("bounced");
    expect(result.outcomes[0].error).toBeDefined();
    expect(result.outcomes[1].outcome).toBe("applied");
    expect(result.state.seqs).toEqual([2]);
  });
});
