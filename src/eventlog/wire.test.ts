import { describe, expect, it } from "vitest";
import { decodeEvent, encodeEvent } from "./append";
import type { GameEvent, Genesis } from "./types";
import {
  decodeAppendableLogNode,
  decodeGenesis,
  decodeRtdbLogNode,
} from "./wire";

const GENESIS: Genesis = {
  seed: "wire-seed",
  reducerVersion: "v1",
  createdAt: 0,
  contentConfig: {
    poolVariant: "tides4",
    draftMode: "pool",
    fresh20PackSize: null,
  },
};

function event(seq: number): GameEvent {
  return {
    type: "T",
    payload: { seq },
    actor: "client-a",
    clientTimestamp: "0",
    basedOnSeq: seq - 1,
  };
}

describe("RTDB log wire decoding", () => {
  it("restores omitted null and empty children on a fresh room", () => {
    const decoded = decodeAppendableLogNode({
      genesis: JSON.stringify(GENESIS),
      baseSeq: 0,
      head: 0,
    });

    expect(decoded).toEqual({
      genesis: JSON.stringify(GENESIS),
      baseSeq: 0,
      baseSnapshot: null,
      head: 0,
      events: {},
    });
  });

  it("normalizes Firebase's dense integer-key array into appendable events", () => {
    const first = encodeEvent(event(1));
    const second = encodeEvent(event(2));
    const decoded = decodeAppendableLogNode({
      genesis: JSON.stringify(GENESIS),
      baseSeq: 0,
      head: 2,
      events: [null, first, second],
    });

    expect(decoded?.events).toEqual({ 1: first, 2: second });
  });

  it("normalizes malformed event values into a deterministic bounce placeholder", () => {
    const raw = {
      genesis: JSON.stringify(GENESIS),
      baseSeq: 0,
      head: 1,
      events: [null, { malformed: true }],
    };
    const decoded = decodeRtdbLogNode({
      ...raw,
    });

    expect(decoded?.events[1]).toEqual({ malformed: true });
    const appendable = decodeAppendableLogNode(raw);
    expect(appendable).not.toBeNull();
    expect(() => decodeEvent(appendable?.events[1] ?? "")).toThrow(
      "invalid shape",
    );
  });

  it("rejects malformed-but-valid JSON genesis values", () => {
    expect(decodeGenesis("null")).toBeNull();
    expect(decodeGenesis("[]")).toBeNull();
    expect(decodeGenesis(JSON.stringify({ seed: "missing-fields" }))).toBeNull();
  });

  it("accepts a structurally valid legacy genesis without content settings", () => {
    expect(
      decodeGenesis(
        JSON.stringify({
          seed: "legacy",
          reducerVersion: "v1",
          createdAt: 0,
        }),
      ),
    ).toEqual({
      seed: "legacy",
      reducerVersion: "v1",
      createdAt: 0,
    });
  });

  it("rejects invalid envelope counters and missing compacted snapshots", () => {
    expect(
      decodeRtdbLogNode({
        genesis: JSON.stringify(GENESIS),
        baseSeq: "0",
        head: 0,
      }),
    ).toBeNull();
    expect(
      decodeRtdbLogNode({
        genesis: JSON.stringify(GENESIS),
        baseSeq: 5,
        head: 5,
      }),
    ).toBeNull();
  });
});
