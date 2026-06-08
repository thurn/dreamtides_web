// `sigseed` grows a Dreamcaller's pool ONLY from its signature cards: each run
// seeds the pool with a random subset of the signature and expands by the shared
// affinity grower. These tests pin the properties that make that true and safe:
//   * the multi-seed grower is a faithful generalisation — a one-card seed set
//     reproduces the single-seed grower exactly (the refactor guard);
//   * the subset draw stays within its size bounds, picks only signature cards,
//     and is deterministic in the rng;
//   * every `sigseed` pool is anchored on actual signature cards (its seeds are a
//     subset of the signature, never an off-theme card) and stays deterministic
//     in the seed; and
//   * the FALLBACK invariant — an empty (or wholly off-corpus) signature has
//     nothing to anchor on, so it reproduces `pickcohere` bit-for-bit.

import { describe, expect, it } from "vitest";

import { growAffinityPool, growAffinityPoolFromSeeds } from "./affinity-grower.ts";
import { generatePoolFromData } from "./generate.ts";
import { buildPoolData } from "./pool-data.ts";
import type { PickRecord } from "./types.ts";
import {
  SIGSEED,
  buildSigSeedCorpus,
  drawSignatureSubset,
} from "./variant-sigseed.ts";

// Same synthetic corpus shape the picksig tests use: a tight signature cluster
// (anchor `sig-card` + three partners taken once the anchor is in pool) buried in
// many prior-1 noise cards a uniform pool would prefer. Only seeding ON the
// signature reliably pulls the cluster into the pool.
function takeInOrder(cards: readonly string[]): PickRecord {
  return { packs: cards.map((c) => [c, "void-filler"]), picks: cards.map((c) => [c]) };
}
function passOver(passed: string, taken: string): PickRecord {
  return { packs: [[passed, taken]], picks: [[taken]] };
}
function takeAlone(card: string): PickRecord {
  return { packs: [[card, "void-filler"]], picks: [[card]] };
}

const SIG = "sig-card";
const PARTNERS = ["part-a", "part-b", "part-c"];
const SIGNATURE = [SIG, ...PARTNERS];
const NOISE = Array.from({ length: 160 }, (_, i) => `card-${String(i).padStart(3, "0")}`);

function clusterCorpusRecords(): PickRecord[] {
  const records: PickRecord[] = [];
  for (const n of NOISE) records.push(takeAlone(n));
  for (let r = 0; r < 4; r += 1) {
    records.push(takeInOrder([SIG, ...PARTNERS]));
    for (const p of PARTNERS) records.push(passOver(p, NOISE[0]));
  }
  return records;
}

function clusterPoolData() {
  return buildPoolData([], undefined, undefined, undefined, clusterCorpusRecords());
}

describe("growAffinityPoolFromSeeds", () => {
  const corpus = buildSigSeedCorpus(clusterPoolData());
  if (!corpus) throw new Error("expected a corpus");

  it("reproduces the single-seed grower for a one-card seed set", () => {
    const single = growAffinityPool(corpus, SIG, 60, SIGSEED);
    const multi = growAffinityPoolFromSeeds(corpus, [SIG], 60, SIGSEED);
    expect([...multi.counts.entries()].sort()).toEqual([...single.counts.entries()].sort());
    expect(multi.provenance).toEqual(single.provenance);
  });

  it("seeds the pool with every chosen card, each flagged isSeed in order", () => {
    const grown = growAffinityPoolFromSeeds(corpus, [SIG, "part-a"], 60, SIGSEED);
    expect(grown.counts.get(SIG)).toBeGreaterThanOrEqual(1);
    expect(grown.counts.get("part-a")).toBeGreaterThanOrEqual(1);
    expect(grown.provenance.cardProvenanceByName[SIG].isSeed).toBe(true);
    expect(grown.provenance.cardProvenanceByName["part-a"].isSeed).toBe(true);
    // The headline seed is the first seed; both seeds carry addOrder 0 and 1.
    expect(grown.provenance.seedCardName).toBe(SIG);
    expect(grown.provenance.cardProvenanceByName[SIG].addOrder).toBe(0);
    expect(grown.provenance.cardProvenanceByName["part-a"].addOrder).toBe(1);
  });

  it("de-duplicates a repeated seed card", () => {
    const grown = growAffinityPoolFromSeeds(corpus, [SIG, SIG], 40, SIGSEED);
    // Two copies of the same seed collapse to one distinct seed, not a double.
    expect(grown.provenance.cardProvenanceByName[SIG].copies).toBeLessThanOrEqual(SIGSEED.cap);
    const seeds = Object.values(grown.provenance.cardProvenanceByName).filter((p) => p.isSeed);
    expect(seeds).toHaveLength(1);
  });
});

describe("drawSignatureSubset", () => {
  const keys = ["a", "b", "c", "d", "e", "f"];

  it("draws a subset of size 1..min(maxSeedCards, keys), all from the keys", () => {
    for (let i = 0; i < 50; i += 1) {
      let calls = 0;
      const rng = () => [0.07, 0.3, 0.6, 0.83, 0.95][calls++ % 5];
      const subset = drawSignatureSubset(rng, keys, 3);
      expect(subset.length).toBeGreaterThanOrEqual(1);
      expect(subset.length).toBeLessThanOrEqual(3);
      expect(new Set(subset).size).toBe(subset.length); // distinct
      for (const k of subset) expect(keys).toContain(k);
    }
  });

  it("never exceeds the number of available keys", () => {
    const subset = drawSignatureSubset(() => 0.99, ["x", "y"], 5);
    expect(subset.length).toBeLessThanOrEqual(2);
    for (const k of subset) expect(["x", "y"]).toContain(k);
  });

  it("is deterministic for a fixed rng sequence", () => {
    const seq = [0.42, 0.11, 0.77, 0.5, 0.9, 0.2];
    const draw = () => {
      let i = 0;
      const rng = () => seq[i++ % seq.length];
      return drawSignatureSubset(rng, keys, 3);
    };
    expect(draw()).toEqual(draw());
  });

  it("returns nothing for an empty signature", () => {
    expect(drawSignatureSubset(() => 0.5, [], 3)).toEqual([]);
  });
});

describe("sigseed pool generation", () => {
  const poolData = clusterPoolData();

  function pool(signature: readonly string[], seed: number, variant: "sigseed" | "pickcohere") {
    return generatePoolFromData(poolData, seed, undefined, variant, undefined, undefined, signature);
  }
  function seedCardsOf(p: ReturnType<typeof pool>): string[] {
    const prov = p.seedProvenance;
    if (!prov) throw new Error("expected seed provenance");
    return Object.entries(prov.cardProvenanceByName)
      .filter(([, v]) => v.isSeed)
      .map(([k]) => k);
  }

  it("anchors every pool on signature cards only", () => {
    const sigSet = new Set(SIGNATURE);
    for (let seed = 0; seed < 30; seed += 1) {
      const seeds = seedCardsOf(pool(SIGNATURE, seed, "sigseed"));
      expect(seeds.length).toBeGreaterThanOrEqual(1);
      expect(seeds.length).toBeLessThanOrEqual(SIGSEED.maxSeedCards);
      for (const s of seeds) expect(sigSet.has(s)).toBe(true);
    }
  });

  it("pulls the signature cluster into the pool where a uniform pool does not", () => {
    const inCluster = (keys: Set<string>) =>
      SIGNATURE.filter((c) => keys.has(c)).length >= 2;
    let sigHits = 0;
    let cohereHits = 0;
    const seeds = 40;
    for (let seed = 0; seed < seeds; seed += 1) {
      if (inCluster(new Set(pool(SIGNATURE, seed, "sigseed").counts.keys()))) sigHits += 1;
      if (inCluster(new Set(pool(SIGNATURE, seed, "pickcohere").counts.keys()))) cohereHits += 1;
    }
    expect(sigHits / seeds).toBeGreaterThan(0.8);
    expect(cohereHits / seeds).toBeLessThan(0.2);
  });

  it("produces more than one distinct pool across seeds (subset variety)", () => {
    const shapes = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1) {
      const keys = [...pool(SIGNATURE, seed, "sigseed").counts.keys()].sort();
      shapes.add(keys.join("|"));
    }
    expect(shapes.size).toBeGreaterThan(1);
  });

  it("is deterministic in the seed", () => {
    const a = [...pool(SIGNATURE, 5, "sigseed").counts.entries()].sort();
    const b = [...pool(SIGNATURE, 5, "sigseed").counts.entries()].sort();
    expect(a).toEqual(b);
  });

  it("reproduces pickcohere bit-for-bit with an empty signature", () => {
    for (let seed = 0; seed < 8; seed += 1) {
      const sig = pool([], seed, "sigseed");
      const cohere = pool([], seed, "pickcohere");
      expect([...sig.counts.entries()].sort()).toEqual([...cohere.counts.entries()].sort());
    }
  });

  it("throws when no draft records are bundled", () => {
    const empty = buildPoolData([{ name: "A" }, { name: "B" }]);
    expect(() =>
      generatePoolFromData(empty, 0, undefined, "sigseed", undefined, undefined, SIGNATURE),
    ).toThrow(/cannot build a pool/);
  });
});
