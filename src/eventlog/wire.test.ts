// The stored wire contract: a D97 genesis keeps its mode through encode and
// decode, a journey genesis stays without one, and an unknown mode makes the
// genesis unreadable; a stored event written with an extra envelope field
// (an older log's `basedOnSeq`) still decodes.

import { describe, expect, it } from "vitest";
import { testJourneySeed } from "../types/test-identities";
import { genesisMode, type Genesis } from "./types";
import { decodeEvent, decodeGenesis } from "./wire";

const GENESIS: Genesis = {
  seed: testJourneySeed("wire-genesis"),
  reducerVersion: "test",
  createdAt: 1,
  contentConfig: {
    poolVariant: "tides4",
    defaultStartingEssence: 100,
    dreamsignCap: 3,
  },
};

describe("decodeGenesis", () => {
  it("keeps a D97 mode and leaves a journey genesis without one", () => {
    const d97 = decodeGenesis(JSON.stringify({ ...GENESIS, mode: "d97" }));
    expect(d97?.mode).toBe("d97");
    expect(d97 === null ? null : genesisMode(d97)).toBe("d97");
    const journey = decodeGenesis(JSON.stringify(GENESIS));
    expect(journey === null ? null : "mode" in journey).toBe(false);
    expect(journey === null ? null : genesisMode(journey)).toBe("journey");
  });

  it("rejects an unknown mode", () => {
    expect(decodeGenesis(JSON.stringify({ ...GENESIS, mode: "unknown-mode" }))).toBeNull();
  });
});

describe("decodeEvent", () => {
  it("decodes a stored event that carries an older envelope field", () => {
    const event = decodeEvent(JSON.stringify({ type: "START_JOURNEY", payload: {}, actor: "p1", clientTimestamp: "t", basedOnSeq: 0 }));
    expect(event.type).toBe("START_JOURNEY");
    expect("basedOnSeq" in event).toBe(false);
  });
});
