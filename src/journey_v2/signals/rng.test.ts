import { describe, expect, it } from "vitest";
import { bandSample, auguryRng, weightedSample, type AuguryRng } from "./rng";

type ScoredItemId = `item-${number}`;

interface ScoredItem {
  id: ScoredItemId;
  score: number;
}

/** Returns the given draws in order, then repeats the last one. */
function scriptedRng(draws: readonly number[]): AuguryRng {
  let index = 0;
  return () => {
    const draw = draws[Math.min(index, draws.length - 1)];
    index += 1;
    return draw;
  };
}

function makeItems(count: number): ScoredItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    score: count - i,
  }));
}

describe("auguryRng", () => {
  it("produces values in [0, 1)", () => {
    const rng = auguryRng("seed", "site", "A");
    for (let i = 0; i < 100; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("is deterministic: same salt yields identical sequences", () => {
    const a = auguryRng("seed", "site", "A");
    const b = auguryRng("seed", "site", "A");
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("diverges for different salts", () => {
    const a = auguryRng("seed", "site", "A");
    const b = auguryRng("seed", "site", "B");
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("advances per call via the internal counter", () => {
    const rng = auguryRng("seed");
    const first = rng();
    const second = rng();
    expect(first).not.toEqual(second);
  });
});

describe("bandSample", () => {
  it("is deterministic for the same salt", () => {
    const items = makeItems(20);
    const resultA = bandSample(items, (t) => t.score, 3, auguryRng("s", "x"), {
      bandFraction: 0.25,
      bandMinimum: 5,
    });
    const resultB = bandSample(items, (t) => t.score, 3, auguryRng("s", "x"), {
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
      const picks = bandSample(items, (t) => t.score, 3, auguryRng("floor", String(seed)), {
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

  it("maps the first draw uniformly onto every in-band rank", () => {
    const items = makeItems(20);
    // A band of 5 splits [0, 1) into fifths: draw k/5 selects rank k.
    for (let rank = 0; rank < 5; rank += 1) {
      const picks = bandSample(
        items,
        (t) => t.score,
        1,
        scriptedRng([(rank + 0.5) / 5]),
        { bandFraction: 0.25, bandMinimum: 5 },
      );
      expect(picks.map((p) => p.id)).toEqual([`item-${rank}`]);
    }
  });

  it("returns fewer items when the band is smaller than count", () => {
    const items = makeItems(3);
    const picks = bandSample(items, (t) => t.score, 5, auguryRng("small"), {
      bandFraction: 0.25,
      bandMinimum: 5,
    });
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.id)).size).toBe(3);
  });

  it("returns an empty array for empty input", () => {
    const picks = bandSample([] as ScoredItem[], (t) => t.score, 3, auguryRng("empty"));
    expect(picks).toEqual([]);
  });
});

describe("weightedSample", () => {
  it("returns null for an empty list", () => {
    expect(weightedSample([] as ScoredItem[], () => 1, auguryRng("w"))).toBeNull();
  });

  it("picks in proportion to weight: draws below the heavy share pick it", () => {
    const items = [
      { id: "heavy", score: 9 },
      { id: "light", score: 1 },
    ];
    const pick = (draw: number) =>
      weightedSample(items, (t) => t.score, scriptedRng([draw]))?.id;
    expect(pick(0)).toBe("heavy");
    expect(pick(0.899)).toBe("heavy");
    expect(pick(0.9)).toBe("light");
    expect(pick(0.999)).toBe("light");
  });

  it("never picks zero-weight items", () => {
    const items = [
      { id: "zero", score: 0 },
      { id: "only", score: 1 },
    ];
    for (let seed = 0; seed < 50; seed += 1) {
      const pick = weightedSample(items, (t) => t.score, auguryRng("zero", String(seed)));
      expect(pick?.id).toBe("only");
    }
  });
});
