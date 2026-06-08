// `buildPickfitCorpus` turns real draft pick records into the affinity corpus the
// shared grower consumes. These tests pin the two statistics the `pickfit`
// variant's whole value rests on, with hand-verifiable synthetic records:
//   * the availability-corrected prior, pickRate(c) = taken(c) / offered(c); and
//   * the shrunk conditional pick rate as synergy affinity, which rises above a
//     card's baseline when an earlier pick makes drafters reach for it, and is
//     dropped entirely for pairs below the minimum support.

import { describe, expect, it } from "vitest";

import { generatePoolFromData } from "./generate.ts";
import { buildPoolData } from "./pool-data.ts";
import type { PickRecord } from "./types.ts";
import { PICKFIT, buildPickfitCorpus } from "./variant-pickfit.ts";

// A record where P is taken first, then C is taken with P already in the pool.
const pThenC: PickRecord = {
  packs: [
    ["P", "filler"],
    ["C", "filler2"],
  ],
  picks: [["P"], ["C"]],
};
// A record where C is offered with no P in the pool and passed over for filler,
// dragging C's baseline pick rate down.
const cPassed: PickRecord = {
  packs: [["C", "filler"]],
  picks: [["filler"]],
};

// Records hold card ids directly (here short stand-in tokens); with no
// cardNameById map the corpus keys on those tokens verbatim.
function corpusFrom(records: PickRecord[]) {
  const corpus = buildPickfitCorpus(
    buildPoolData([], undefined, records),
  );
  if (!corpus) throw new Error("expected a corpus");
  return corpus;
}

describe("buildPickfitCorpus", () => {
  it("returns null when no records are supplied", () => {
    expect(buildPickfitCorpus(buildPoolData([]))).toBeNull();
  });

  it("computes the availability-corrected prior as taken / offered", () => {
    // 3× pThenC and 3× cPassed: C is offered 6 times (3 with P, 3 alone) and
    // taken 3 times → prior 0.5. P is offered and taken 3 times → prior 1. X-like
    // filler that is never taken stays out of the drawable universe.
    const corpus = corpusFrom([
      pThenC,
      pThenC,
      pThenC,
      cPassed,
      cPassed,
      cPassed,
    ]);

    expect(corpus.prior.get("C")).toBeCloseTo(0.5, 12);
    expect(corpus.prior.get("P")).toBeCloseTo(1, 12);
    // `filler2` is offered (in pThenC) but never taken, so it is excluded from the
    // drawable card universe; `filler` is taken in cPassed, so it is included.
    expect(corpus.cards).toContain("C");
    expect(corpus.cards).toContain("P");
    expect(corpus.cards).toContain("filler");
    expect(corpus.cards).not.toContain("filler2");
  });

  it("records positive excess pick rate as the synergy affinity", () => {
    const corpus = corpusFrom([
      pThenC,
      pThenC,
      pThenC,
      cPassed,
      cPassed,
      cPassed,
    ]);

    // affinity[P][C] = shrunk excess: support 3 (>= minSupport), condRate 1 (C
    // always taken when P is already in the pool), baseline prior(C) = 0.5,
    // w = 3 / (3 + shrinkage) → w·(1 - 0.5), strictly positive.
    const w = 3 / (3 + PICKFIT.shrinkage);
    const expected = w * (1 - 0.5);
    expect(corpus.affinity.get("P")?.get("C")).toBeCloseTo(expected, 12);
    expect(corpus.affinity.get("P")?.get("C")).toBeGreaterThan(0);
  });

  it("drops pairs below the minimum support", () => {
    // Only 2 co-offers of (P → C), below the default minSupport of 3, so no
    // synergy entry is recorded and the pair contributes through the prior alone.
    expect(PICKFIT.minSupport).toBeGreaterThan(2);
    const corpus = corpusFrom([pThenC, pThenC]);
    expect(corpus.affinity.get("P")?.get("C")).toBeUndefined();
  });
});

describe("pick-data variants without a record corpus", () => {
  // With no draft records the pick-data corpus is empty, so the shared grower
  // has nothing to grow from. Each variant throws rather than silently degrading
  // to the random color pool.
  for (const variant of ["pickfit", "pickearly", "pickpos", "pickchoice"] as const) {
    it(`throws for ${variant} when no draft records are bundled`, () => {
      const poolData = buildPoolData([{ name: "A" }, { name: "B" }]);
      expect(() => generatePoolFromData(poolData, 0, undefined, variant)).toThrow(
        /cannot build a pool/,
      );
    });
  }
});
