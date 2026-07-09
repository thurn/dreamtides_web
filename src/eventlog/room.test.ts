// Unit tests for the pure parts of room lifecycle: room-id alphabet/length
// and the stale-room eviction boundary. Firebase-backed behavior (createRoom,
// createRoomEvictingStale's RTDB update, writePresence) is covered by the
// Task 9 emulator test; this file only exercises logic that needs no IO.

import { describe, expect, it } from "vitest";
import {
  ROOM_PRESERVATION_WINDOW_MS,
  connectedClientCount,
  generateRoomId,
  genesisLogNode,
  isValidRoomId,
  normalizeRoomId,
  shouldEvict,
} from "./room";
import type { ContentConfig, Genesis } from "./types";

const CONTENT_CONFIG: ContentConfig = {
  poolVariant: "tides4",
  draftMode: "pool",
  fresh20PackSize: null,
  journeyVariant: "v2",
};

function genesisAt(createdAt: number): string {
  const genesis: Genesis = {
    seed: "s",
    reducerVersion: "v1",
    createdAt,
    contentConfig: CONTENT_CONFIG,
  };
  return JSON.stringify(genesis);
}

describe("generateRoomId / isValidRoomId", () => {
  it("round-trips: every generated id is valid", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateRoomId();
      expect(isValidRoomId(id)).toBe(true);
    }
  });

  it("generates 6-character lowercase alphanumeric ids by default", () => {
    const id = generateRoomId();
    expect(id).toHaveLength(6);
    expect(id).toMatch(/^[a-z0-9]+$/);
  });

  it("rejects ids shorter than 4 characters", () => {
    expect(isValidRoomId("abc")).toBe(false);
  });

  it("rejects ids longer than 24 characters", () => {
    expect(isValidRoomId("a".repeat(25))).toBe(false);
  });

  it("accepts ids at the boundary lengths 4 and 24", () => {
    expect(isValidRoomId("a".repeat(4))).toBe(true);
    expect(isValidRoomId("a".repeat(24))).toBe(true);
  });

  it("rejects ids containing uppercase or non-alphanumeric characters", () => {
    expect(isValidRoomId("ABCDEF")).toBe(false);
    expect(isValidRoomId("abc-de")).toBe(false);
    expect(isValidRoomId("abc def")).toBe(false);
  });
});

describe("normalizeRoomId", () => {
  it("trims and lowercases a valid id", () => {
    expect(normalizeRoomId("  ABC123  ")).toBe("abc123");
  });

  it("returns null for null input", () => {
    expect(normalizeRoomId(null)).toBeNull();
  });

  it("returns null when normalization still fails validation", () => {
    expect(normalizeRoomId("ab")).toBeNull();
    expect(normalizeRoomId("has spaces in")).toBeNull();
  });
});

describe("shouldEvict (stale-room eviction boundary)", () => {
  const now = 1_000_000_000_000; // arbitrary epoch ms "now"

  it("preserves a room created 23 hours ago", () => {
    const createdAt = now - 23 * 60 * 60 * 1000;
    expect(shouldEvict(genesisAt(createdAt), now)).toBe(false);
  });

  it("evicts a room created 25 hours ago", () => {
    const createdAt = now - 25 * 60 * 60 * 1000;
    expect(shouldEvict(genesisAt(createdAt), now)).toBe(true);
  });

  it("preserves a room right at the boundary (exactly the window)", () => {
    const createdAt = now - ROOM_PRESERVATION_WINDOW_MS;
    expect(shouldEvict(genesisAt(createdAt), now)).toBe(false);
  });

  it("preserves a room whose genesis is unparseable", () => {
    expect(shouldEvict("not valid json", now)).toBe(false);
    expect(shouldEvict(undefined, now)).toBe(false);
    expect(shouldEvict(null, now)).toBe(false);
    expect(shouldEvict("{}", now)).toBe(false);
    expect(shouldEvict(JSON.stringify({ seed: "s" }), now)).toBe(false);
  });

  it("preserves a room whose createdAt is not a finite number", () => {
    expect(
      shouldEvict(
        JSON.stringify({ seed: "s", reducerVersion: "v1", createdAt: "not-a-number" }),
        now,
      ),
    ).toBe(false);
  });
});

describe("genesisLogNode (createRoom's written node)", () => {
  it("writes genesis.contentConfig verbatim", () => {
    const contentConfig: ContentConfig = {
      poolVariant: "idf3",
      draftMode: "fresh20",
      fresh20PackSize: 20,
      journeyVariant: "classic",
    };
    const genesis: Genesis = {
      seed: "room-seed",
      reducerVersion: "build-abc",
      createdAt: 1_700_000_000_000,
      contentConfig,
    };
    // createRoom / createRoomEvictingStale both `set` this node, so the decoded
    // genesis is exactly what lands in RTDB.
    const decoded = JSON.parse(genesisLogNode(genesis).genesis) as Genesis;
    expect(decoded).toEqual(genesis);
    expect(decoded.contentConfig).toEqual(contentConfig);
  });
});

describe("connectedClientCount", () => {
  it("counts only entries flagged connected", () => {
    const presence = {
      a: { connected: true, lastSeenAt: "t1" },
      b: { connected: false, lastSeenAt: "t2" },
      c: { connected: true, lastSeenAt: "t3" },
    };
    expect(connectedClientCount(presence)).toBe(2);
  });

  it("returns 0 for an empty known presence snapshot", () => {
    expect(connectedClientCount({})).toBe(0);
  });

  it("returns null while the presence snapshot is unknown", () => {
    expect(connectedClientCount(null)).toBeNull();
    expect(connectedClientCount(undefined)).toBeNull();
  });
});
