import { describe, expect, it } from "vitest";
import { bandSample, merchantRng, weightedSample } from "./rng";

type ScoredItemId = `item-${number}`;

interface ScoredItem {
  id: ScoredItemId;
  score: number;
}

function makeItems(count: number): ScoredItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    score: count - i,
  }));
}

describe("merchantRng", () => {
  it("produces values in [0, 1)", () => {
    const rng = merchantRng("seed", "site", "A");
    for (let i = 0; i < 100; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("is deterministic: same salt yields identical sequences", () => {
    const a = merchantRng("seed", "site", "A");
    const b = merchantRng("seed", "site", "A");
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("diverges for different salts", () => {
    const a = merchantRng("seed", "site", "A");
    const b = merchantRng("seed", "site", "B");
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("advances per call via the internal counter", () => {
    const rng = merchantRng("seed");
    const first = rng();
    const second = rng();
    expect(first).not.toEqual(second);
  });
});

describe("bandSample", () => {
  it("is deterministic for the same salt", () => {
    const items = makeItems(20);
    const resultA = bandSample(items, (t) => t.score, 3, merchantRng("s", "x"), {
      bandFraction: 0.25,
      bandMinimum: 5,
    });
    const resultB = bandSample(items, (t) => t.score, 3, merchantRng("s", "x"), {
      bandFraction: 0.25,
      bandMinimum: 5,
    });
    expect(resultA).toEqual(resultB);
  });

  it("keeps the band-floor invariant across 50 seeds: every pick is in-band and distinct", () => {
    const n = 20;
    const items = makeItems(n);
    const bandFraction = 0.25;
    const bandMinimum = 5;
    const bandSize = Math.max(Math.ceil(bandFraction * n), Math.min(bandMinimum, n));
    const sortedScores = items.map((t) => t.score).sort((a, b) => b - a);
    const worstInBandScore = sortedScores[bandSize - 1];
    for (let seed = 0; seed < 50; seed += 1) {
      const picks = bandSample(items, (t) => t.score, 3, merchantRng("floor", String(seed)), {
        bandFraction,
        bandMinimum,
      });
      expect(picks).toHaveLength(3);
      const ids = new Set(picks.map((p) => p.id));
      expect(ids.size).toBe(picks.length);
      for (const pick of picks) {
        expect(pick.score).toBeGreaterThanOrEqual(worstInBandScore);
      }
    }
  });

  it("spreads first picks across the band over 200 seeds (no residual argmax)", () => {
    const items = makeItems(20);
    const firstPicks = new Set<ScoredItemId>();
    for (let seed = 0; seed < 200; seed += 1) {
      const picks = bandSample(items, (t) => t.score, 3, merchantRng("dist", String(seed)), {
        bandFraction: 0.25,
        bandMinimum: 5,
      });
      firstPicks.add(picks[0].id);
    }
    expect(firstPicks.size).toBeGreaterThanOrEqual(4);
  });

  it("returns fewer items when the band is smaller than count", () => {
    const items = makeItems(3);
    const picks = bandSample(items, (t) => t.score, 5, merchantRng("small"), {
      bandFraction: 0.25,
      bandMinimum: 5,
    });
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.id)).size).toBe(3);
  });

  it("returns an empty array for empty input", () => {
    const picks = bandSample([] as ScoredItem[], (t) => t.score, 3, merchantRng("empty"));
    expect(picks).toEqual([]);
  });
});

describe("weightedSample", () => {
  it("returns null for an empty list", () => {
    expect(weightedSample([] as ScoredItem[], () => 1, merchantRng("w"))).toBeNull();
  });

  it("picks the heavy item 60-95% of the time over 500 seeds with 9:1 weights", () => {
    const items = [
      { id: "heavy", score: 9 },
      { id: "light", score: 1 },
    ];
    let heavyCount = 0;
    for (let seed = 0; seed < 500; seed += 1) {
      const pick = weightedSample(items, (t) => t.score, merchantRng("weighted", String(seed)));
      if (pick?.id === "heavy") {
        heavyCount += 1;
      }
    }
    const fraction = heavyCount / 500;
    expect(fraction).toBeGreaterThanOrEqual(0.6);
    expect(fraction).toBeLessThanOrEqual(0.95);
  });

  it("never picks zero-weight items", () => {
    const items = [
      { id: "zero", score: 0 },
      { id: "only", score: 1 },
    ];
    for (let seed = 0; seed < 50; seed += 1) {
      const pick = weightedSample(items, (t) => t.score, merchantRng("zero", String(seed)));
      expect(pick?.id).toBe("only");
    }
  });
});
