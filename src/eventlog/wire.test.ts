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
    atlasFoldHash: "fixture-atlas-fold-hash",
    sitesFoldHash: "fixture-sites-fold-hash",
    draftFoldHash: "fixture-draft-fold-hash",
    cardRolesFoldHash: "fixture-card-roles-fold-hash",
    economyFoldHash: "fixture-economy-fold-hash",
    rewardSelectionFoldHash: "fixture-reward-selection-fold-hash",
    auguryFoldHash: "fixture-augury-fold-hash",
    explorationFoldHash: "fixture-exploration-fold-hash",
    tutorialFoldHash: "fixture-tutorial-fold-hash",
    defaultStartingEssence: 137,
    dreamsignCap: 9,
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
    expect(
      decodeGenesis(JSON.stringify({ seed: "missing-fields" })),
    ).toBeNull();
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

  it("decodes legacy content settings without an Atlas hash for compatibility gating", () => {
    const legacy = {
      ...GENESIS,
      contentConfig: {
        poolVariant: "tides4",
      },
    };
    expect(decodeGenesis(JSON.stringify(legacy))).toEqual(legacy);
  });

  it("decodes an older pinned genesis without a Sites hash for compatibility gating", () => {
    const older = structuredClone(GENESIS);
    delete older.contentConfig?.sitesFoldHash;
    expect(decodeGenesis(JSON.stringify(older))).toEqual(older);
  });

  it("rejects a malformed Atlas hash field", () => {
    const malformed = {
      ...GENESIS,
      contentConfig: { ...GENESIS.contentConfig, atlasFoldHash: 42 },
    };
    expect(decodeGenesis(JSON.stringify(malformed))).toBeNull();
  });

  it("rejects a room configured with any draft-pool strategy except tides4", () => {
    const malformed = {
      ...GENESIS,
      contentConfig: { ...GENESIS.contentConfig, poolVariant: "unknown" },
    };
    expect(decodeGenesis(JSON.stringify(malformed))).toBeNull();
  });

  it("round-trips the pinned Draft fold hash", () => {
    expect(
      decodeGenesis(JSON.stringify(GENESIS))?.contentConfig?.draftFoldHash,
    ).toBe("fixture-draft-fold-hash");
  });

  it("round-trips the pinned card-role fold hash", () => {
    expect(
      decodeGenesis(JSON.stringify(GENESIS))?.contentConfig?.cardRolesFoldHash,
    ).toBe("fixture-card-roles-fold-hash");
  });

  it("round-trips the pinned tutorial fold hash", () => {
    expect(
      decodeGenesis(JSON.stringify(GENESIS))?.contentConfig?.tutorialFoldHash,
    ).toBe("fixture-tutorial-fold-hash");
  });

  it.each([
    ["draftFoldHash", 42],
    ["cardRolesFoldHash", 42],
    ["sitesFoldHash", 42],
    ["economyFoldHash", 42],
    ["rewardSelectionFoldHash", 42],
    ["auguryFoldHash", 42],
    ["explorationFoldHash", 42],
    ["tutorialFoldHash", 42],
    ["defaultStartingEssence", -1],
    ["dreamsignCap", 1.5],
  ])("rejects a malformed %s field", (field, value) => {
    const malformed = {
      ...GENESIS,
      contentConfig: { ...GENESIS.contentConfig, [field]: value },
    };
    expect(decodeGenesis(JSON.stringify(malformed))).toBeNull();
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
