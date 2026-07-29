import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearReplayFixtureProviders,
  registerReplayFixtureProviders,
} from "../rules/replay/fixture-providers";
import {
  CoopFuzzRoom,
  runCoopFuzz,
} from "./coop-fuzz-harness";

beforeEach(registerReplayFixtureProviders);
afterEach(clearReplayFixtureProviders);

describe("two-client coop fuzz model", () => {
  it("converges through randomized stale delivery, remounts, and RTDB shapes", async () => {
    await runCoopFuzz({ seed: 20260729, runs: 25, operations: 25 });
  });

  it("lets a valid keyed retry follow a bounced stale contender", async () => {
    const room = new CoopFuzzRoom();
    try {
      room.deliverBoth("object");
      await room.submitStateAware("publisher", 1);
      room.deliverBoth("array");

      await room.submitStateAware("host", 2);
      await room.submitSharedKey("publisher", 1);
      room.deliver("host", "object");
      await room.submitSharedKey("host", 1);

      expect(() => room.assertHealthy()).not.toThrow();
    } finally {
      room.close();
    }
  });

  it("contains a malformed committed event and reports it on both clients", () => {
    const room = new CoopFuzzRoom();
    try {
      room.deliverBoth("firebase-omissions");
      room.injectMalformedEvent();
      expect(() => room.assertHealthy()).not.toThrow();
    } finally {
      room.close();
    }
  });

  it("converges from a compacted snapshot and non-zero base sequence", () => {
    const room = new CoopFuzzRoom();
    try {
      room.deliverBoth("object");
      room.forceCompaction();
      expect(room.baseSeq).toBeGreaterThan(0);
      room.remount("publisher", "array");
      room.remount("host", "firebase-omissions");
      expect(() => room.assertHealthy()).not.toThrow();
    } finally {
      room.close();
    }
  });
});
