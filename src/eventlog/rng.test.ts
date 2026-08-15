import { testJourneySeed } from "../types/test-identities";
import { describe, expect, it } from "vitest";
import { eventRng } from "./rng";

describe("eventRng", () => {
  it("is deterministic for the same (seed, seq, drawIndex)", () => {
    const draw1 = eventRng(testJourneySeed("seed-a"), 3)(7);
    const draw2 = eventRng(testJourneySeed("seed-a"), 3)(7);
    expect(draw1).toBe(draw2);
  });

  it("produces independent streams across seq and drawIndex", () => {
    // Sample 100 (seq, drawIndex) triples derived from a fixed seed, and
    // compare each draw to the draw at a neighboring seq or drawIndex.
    // At least 99 of 100 pairs must differ (collisions should be
    // astronomically rare with a good hash, but avoid a flaky test).
    const seed = "seed-b";
    let collisions = 0;
    for (let i = 0; i < 100; i += 1) {
      const seq = i;
      const drawIndex = i * 2;
      const base = eventRng(testJourneySeed(seed), seq)(drawIndex);
      const variedSeq = eventRng(testJourneySeed(seed), seq + 1)(drawIndex);
      const variedDrawIndex = eventRng(testJourneySeed(seed), seq)(drawIndex + 1);
      if (base === variedSeq || base === variedDrawIndex) {
        collisions += 1;
      }
    }
    expect(collisions).toBeLessThanOrEqual(1);
  });

  it("returns values in [0, 1) across 1000 draws", () => {
    for (let i = 0; i < 1000; i += 1) {
      const seed = `seed-${i % 7}`;
      const seq = i;
      const drawIndex = i * 3;
      const value = eventRng(testJourneySeed(seed), seq)(drawIndex);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("differs across different seeds for the same (seq, drawIndex)", () => {
    const a = eventRng(testJourneySeed("seed-x"), 1)(1);
    const b = eventRng(testJourneySeed("seed-y"), 1)(1);
    expect(a).not.toBe(b);
  });
});
