// The stored-genesis wire contract for game modes: a D97 genesis keeps its
// mode through encode and decode, a journey genesis stays without one, and an
// unknown mode makes the genesis unreadable.

import { describe, expect, it } from "vitest";
import { testJourneySeed } from "../types/test-identities";
import { genesisMode, type Genesis } from "./types";
import { decodeGenesis } from "./wire";

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
    expect(decodeGenesis(JSON.stringify({ ...GENESIS, mode: "coop" }))).toBeNull();
  });
});
