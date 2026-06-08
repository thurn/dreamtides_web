// `picksig` is `pickcohere` with its candidate seeds drawn from a distribution
// biased toward a Dreamcaller's signature instead of uniformly. These tests pin
// the three things that makes that true and safe:
//   * the signature affinity and seed weights it derives from the corpus (the
//     steering signal), including resolving signature NAMES onto the UUID corpus;
//   * the FALLBACK invariant — an empty (or wholly off-corpus) signature must
//     reproduce `pickcohere` bit-for-bit, because the steered draw with all-equal
//     weights IS the uniform draw; and
//   * the STEERING itself — a signature whose partners a uniform pool would
//     exclude reliably pulls them into the picksig pool, while staying
//     deterministic in the seed.

import { describe, expect, it } from "vitest";

import { weightedSeedDraw } from "./affinity-grower.ts";
import { generatePoolFromData } from "./generate.ts";
import { buildPoolData } from "./pool-data.ts";
import type { PickRecord } from "./types.ts";
import {
  PICKSIG,
  buildPickSigCorpus,
  buildSignatureAffinity,
  buildSignatureSeedWeights,
} from "./variant-picksig.ts";

// A drafter who takes `cards` in order — each later card is taken with every
// earlier one already in pool, so the FIRST card earns synergy to all the rest.
// Fillers are never taken, so they stay out of the drawable universe.
function takeInOrder(cards: readonly string[]): PickRecord {
  return {
    packs: cards.map((c) => [c, "void-filler"]),
    picks: cards.map((c) => [c]),
  };
}
// A drafter offered `passed` with no partner in pool who takes a noise card
// instead, dragging `passed`'s baseline pick rate down.
function passOver(passed: string, taken: string): PickRecord {
  return { packs: [[passed, taken]], picks: [[taken]] };
}
// A drafter who simply takes `card` (sets its prior to 1, no synergy context).
function takeAlone(card: string): PickRecord {
  return { packs: [[card, "void-filler"]], picks: [[card]] };
}

// A corpus of many independent noise cards plus a tight 4-card signature cluster
// (an anchor `sig-card` and three partners). The partners are PASSED at baseline
// (prior 0.5) but TAKEN once the anchor is in pool (excess-lift synergy), and the
// noise cards all have prior 1, so a uniform pool prefers noise and leaves the
// whole cluster out — only steering pulls it in. Card keys are chosen so the
// cluster sorts AFTER the noise the uniform grower keeps (its key tie-break).
const SIG = "sig-card";
const PARTNERS = ["part-a", "part-b", "part-c"];
const NOISE = Array.from({ length: 160 }, (_, i) => `card-${String(i).padStart(3, "0")}`);

function clusterCorpusRecords(): PickRecord[] {
  const records: PickRecord[] = [];
  for (const n of NOISE) records.push(takeAlone(n));
  // Four passes of the whole cluster in one pick sequence — the anchor stays in
  // pool while every partner is taken, so the anchor earns synergy to all three
  // partners (support 4 ≥ minSupport).
  for (let r = 0; r < 4; r += 1) {
    records.push(takeInOrder([SIG, ...PARTNERS]));
    // Drag each partner's baseline down so prior(partner) < prior(noise) = 1.
    for (const p of PARTNERS) records.push(passOver(p, NOISE[0]));
  }
  return records;
}

function clusterPoolData() {
  return buildPoolData([], undefined, clusterCorpusRecords());
}

describe("buildSignatureAffinity", () => {
  const poolData = clusterPoolData();
  const corpus = buildPickSigCorpus(poolData);
  if (!corpus) throw new Error("expected a corpus");

  it("scores signature cards as anchors at affinity 1", () => {
    const aff = buildSignatureAffinity(corpus, [SIG]);
    expect(aff.get(SIG)).toBe(1);
  });

  it("scores a card that partners the signature in (0, 1] and noise at 0", () => {
    const aff = buildSignatureAffinity(corpus, [SIG]);
    for (const p of PARTNERS) {
      expect(aff.get(p)).toBeGreaterThan(0);
      expect(aff.get(p)).toBeLessThanOrEqual(1);
    }
    expect(aff.get(NOISE[5])).toBe(0);
  });

  it("returns an empty map for an empty or wholly off-corpus signature", () => {
    expect(buildSignatureAffinity(corpus, []).size).toBe(0);
    expect(buildSignatureAffinity(corpus, undefined).size).toBe(0);
    expect(buildSignatureAffinity(corpus, ["not-a-real-card"]).size).toBe(0);
  });

  it("resolves signature NAMES onto the UUID corpus via cardIdByName", () => {
    // A signature given as a display name resolves to the same anchor as its id.
    const cardIdByName = new Map([["Sig Card", SIG]]);
    const aff = buildSignatureAffinity(corpus, ["Sig Card"], cardIdByName);
    expect(aff.get(SIG)).toBe(1);
    for (const p of PARTNERS) expect(aff.get(p)).toBeGreaterThan(0);
  });
});

describe("buildSignatureSeedWeights", () => {
  const poolData = clusterPoolData();
  const corpus = buildPickSigCorpus(poolData);
  if (!corpus) throw new Error("expected a corpus");

  it("applies the capped-affinity formula and shares one weight across on-theme cards", () => {
    const weights = buildSignatureSeedWeights(corpus, [SIG], PICKSIG);
    const { sigEps, sigCap, sigAlpha } = PICKSIG;
    const onTheme = (sigEps + sigCap) ** sigAlpha;
    const offTheme = sigEps ** sigAlpha;
    // The anchor and every partner whose affinity meets the cap share the same
    // top weight — the variety lever that keeps the on-theme region wide.
    expect(weights.get(SIG)).toBeCloseTo(onTheme, 12);
    for (const p of PARTNERS) expect(weights.get(p)).toBeCloseTo(onTheme, 12);
    // Off-theme noise collapses to the floor weight, far below the on-theme one.
    expect(weights.get(NOISE[0])).toBeCloseTo(offTheme, 12);
    expect(weights.get(SIG)).toBeGreaterThan((weights.get(NOISE[0]) ?? 0) * 10);
  });

  it("returns an empty map (→ uniform fallback) when the signature is empty", () => {
    expect(buildSignatureSeedWeights(corpus, [], PICKSIG).size).toBe(0);
  });
});

describe("weightedSeedDraw", () => {
  const poolData = clusterPoolData();
  const corpus = buildPickSigCorpus(poolData);
  if (!corpus) throw new Error("expected a corpus");

  it("reproduces the uniform draw when every weight is equal", () => {
    const equal = new Map(corpus.cards.map((c) => [c, 1]));
    const draw = weightedSeedDraw(equal);
    for (const r of [0, 0.1, 0.37, 0.5, 0.99]) {
      const expected = corpus.cards[Math.floor(r * corpus.cards.length)];
      expect(draw(() => r, corpus)).toBe(expected);
    }
  });

  it("falls back to the uniform draw when no weight has mass", () => {
    const draw = weightedSeedDraw(new Map());
    for (const r of [0, 0.5, 0.99]) {
      expect(draw(() => r, corpus)).toBe(corpus.cards[Math.floor(r * corpus.cards.length)]);
    }
  });
});

describe("picksig pool generation", () => {
  const poolData = clusterPoolData();

  function poolCardKeys(signature: readonly string[], seed: number, variant: "picksig" | "pickcohere") {
    const pool = generatePoolFromData(
      poolData,
      seed,
      undefined,
      variant,
      undefined,
      undefined,
      signature,
    );
    // No cardNameById on this synthetic corpus, so counts are keyed by UUID.
    return new Set(pool.counts.keys());
  }

  it("reproduces pickcohere bit-for-bit with an empty signature", () => {
    for (let seed = 0; seed < 8; seed += 1) {
      const sig = generatePoolFromData(poolData, seed, undefined, "picksig", undefined, undefined, []);
      const cohere = generatePoolFromData(poolData, seed, undefined, "pickcohere", undefined, undefined, []);
      expect([...sig.counts.entries()].sort()).toEqual([...cohere.counts.entries()].sort());
    }
  });

  it("is deterministic in the seed", () => {
    const a = poolCardKeys([SIG], 3, "picksig");
    const b = poolCardKeys([SIG], 3, "picksig");
    expect([...a].sort()).toEqual([...b].sort());
  });

  it("steers the pool onto the signature cluster a uniform pool excludes", () => {
    const inCluster = (keys: Set<string>) =>
      [SIG, ...PARTNERS].filter((c) => keys.has(c)).length >= 2;

    let sigHits = 0;
    let cohereHits = 0;
    const seeds = 40;
    for (let seed = 0; seed < seeds; seed += 1) {
      if (inCluster(poolCardKeys([SIG], seed, "picksig"))) sigHits += 1;
      if (inCluster(poolCardKeys([SIG], seed, "pickcohere"))) cohereHits += 1;
    }
    // Steering pulls the cluster into the large majority of picksig pools; the
    // uniform pickcohere pool, preferring the prior-1 noise, almost never does.
    expect(sigHits / seeds).toBeGreaterThan(0.8);
    expect(cohereHits / seeds).toBeLessThan(0.2);
    expect(sigHits).toBeGreaterThan(cohereHits);
  });

  it("throws when no draft records are bundled", () => {
    const empty = buildPoolData([{ name: "A" }, { name: "B" }]);
    expect(() => generatePoolFromData(empty, 0, undefined, "picksig", undefined, undefined, [SIG])).toThrow(
      /cannot build a pool/,
    );
  });
});
