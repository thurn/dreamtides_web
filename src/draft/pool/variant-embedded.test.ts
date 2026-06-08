// The `embedded` variant grows `sigseed`'s pool from a prebuilt corpus
// (`poolData.affinityCorpus`) instead of rebuilding it from the draft records.
// These tests pin the two load-bearing facts: it errors when the embedding was
// not loaded, and — fed the SAME corpus `sigseed` builds from records — it
// produces byte-identical pools, so the variant wiring adds no behavioural drift
// of its own (the only approximation in the shipping chain is the SVD, validated
// by `scripts/affinity-corpus-parity.mjs`).

import { describe, expect, it } from "vitest";

import { generatePoolFromData } from "./generate.ts";
import { buildPoolData } from "./pool-data.ts";
import type { PickRecord, PoolData } from "./types.ts";
import { buildPickfitCorpus } from "./variant-pickfit.ts";

// A small synthetic record set with one clear synergy (P pulls C) plus filler so
// the corpus has a non-trivial universe to grow over.
const records: PickRecord[] = Array.from({ length: 6 }, () => ({
  packs: [
    ["P", "f1"],
    ["C", "f2"],
    ["D", "f3"],
  ],
  picks: [["P"], ["C"], ["D"]],
}));

function poolDataWithCorpus(): PoolData {
  const poolData = buildPoolData([], undefined, records);
  const corpus = buildPickfitCorpus(poolData);
  if (!corpus) throw new Error("expected a corpus");
  poolData.affinityCorpus = corpus;
  return poolData;
}

const canonical = (counts: Map<string, number>): string =>
  JSON.stringify([...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));

describe("embedded variant", () => {
  it("throws when no embedding was loaded (no affinityCorpus)", () => {
    const poolData = buildPoolData([], undefined, records); // records present, but no affinityCorpus
    expect(() => generatePoolFromData(poolData, 0, undefined, "embedded")).toThrow(
      /cannot build a pool/,
    );
  });

  it("produces pools byte-identical to sigseed when fed the same corpus", () => {
    const poolData = poolDataWithCorpus();
    for (let seed = 0; seed < 8; seed++) {
      const sig = generatePoolFromData(poolData, seed, undefined, "sigseed", undefined, 40, ["P"]);
      const emb = generatePoolFromData(poolData, seed, undefined, "embedded", undefined, 40, ["P"]);
      expect(canonical(emb.counts)).toEqual(canonical(sig.counts));
    }
  });

  it("falls back to a coherent grow (no signature) without throwing", () => {
    const poolData = poolDataWithCorpus();
    const pool = generatePoolFromData(poolData, 1, undefined, "embedded", undefined, 40, []);
    expect(pool.counts.size).toBeGreaterThan(0);
    expect(pool.variant).toBe("embedded");
  });
});
