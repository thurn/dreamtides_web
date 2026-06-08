// The shared affinity grower's best-of-K seed selection: `poolCoherence` scores
// how tightly a grown pool's cards partner each other, and `growPoolFromCorpus`
// uses it to keep the most coherent of `tuning.seedDraws` candidate seeds. These
// tests pin the coherence calculation and confirm best-of-K picks the coherent
// seed over a scattered one on a hand-built corpus.

import { describe, expect, it } from "vitest";

import {
  type AffinityCorpus,
  type AffinityGrowerTuning,
  growPoolFromCorpus,
  poolCoherence,
} from "./affinity-grower.ts";
import { buildPoolData } from "./pool-data.ts";

describe("poolCoherence", () => {
  it("averages affinity over ordered distinct-card pairs", () => {
    const affinity = new Map<string, Map<string, number>>([
      ["a", new Map<string, number>([["b", 1]])],
      ["b", new Map<string, number>([["a", 0]])],
    ]);
    // pairs: a->b = 1, b->a = 0 → mean 0.5.
    expect(poolCoherence(new Map([["a", 1], ["b", 1]]), affinity)).toBeCloseTo(0.5, 12);
  });

  it("is zero for a single-card pool (no pairs)", () => {
    expect(poolCoherence(new Map([["a", 2]]), new Map())).toBe(0);
  });
});

// A corpus with two disjoint clusters: {tight1, tight2} partner each other
// strongly, while {loose} has only weak ties to a scatter of singletons. Growing
// from a tight seed yields a high-coherence pool; growing from `loose` yields a
// low-coherence one.
const tuning: AffinityGrowerTuning = {
  cap: 2,
  seedAffinityWeight: 0.4,
  priorWeight: 0,
  secondCopyFactor: 0.55,
  topPartnerCount: 4,
};
const corpus: AffinityCorpus = {
  cards: ["tight1", "tight2", "tight3", "loose", "x", "y", "z"],
  affinity: new Map<string, Map<string, number>>([
    ["tight1", new Map([["tight2", 1], ["tight3", 0.9]])],
    ["tight2", new Map([["tight1", 1], ["tight3", 0.9]])],
    ["tight3", new Map([["tight1", 0.9], ["tight2", 0.9]])],
    ["loose", new Map([["x", 0.05], ["y", 0.05], ["z", 0.05]])],
    ["x", new Map([["loose", 0.05]])],
    ["y", new Map([["loose", 0.05]])],
    ["z", new Map([["loose", 0.05]])],
  ]),
  prior: new Map(),
};

describe("growPoolFromCorpus best-of-K seeding", () => {
  // A poolData with no cardNameById map, so the grower keys on the corpus tokens
  // verbatim; the corpus is passed in directly.
  const poolData = buildPoolData([]);

  it("with seedDraws=1 grows from the single drawn seed", () => {
    // rng returns 3/7 < the index of `loose` window → draws `loose` (index 3).
    const draw = [3 / 7];
    let i = 0;
    const res = growPoolFromCorpus(() => draw[i++], poolData, corpus, 6, { ...tuning, seedDraws: 1 }, "t");
    expect(res.selected).toEqual(["t", "card:loose"]);
  });

  it("with seedDraws>1 keeps the seed that grows the most coherent pool", () => {
    // Two candidate draws: first `loose` (index 3), then `tight1` (index 0). The
    // tight cluster grows the more coherent pool, so it must win even though it
    // was drawn second.
    const draws = [3 / 7, 0];
    let i = 0;
    const res = growPoolFromCorpus(() => draws[i++], poolData, corpus, 6, { ...tuning, seedDraws: 2 }, "t");
    expect(res.selected).toEqual(["t", "card:tight1"]);
    // all K rng draws are consumed regardless of the winner
    expect(i).toBe(2);
  });
});
