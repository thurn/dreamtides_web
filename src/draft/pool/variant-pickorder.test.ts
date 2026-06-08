// Corpus tests for the pick-ORDER pool variants, which read only the draft pick
// records (ids, packs, picks) and never the final decklists. Each test pins the
// one property that distinguishes the variant, with hand-built synthetic records.
// Records hold card ids directly (short stand-in tokens); with no cardNameById
// map the corpus keys on those tokens verbatim.

import { describe, expect, it } from "vitest";

import { buildPoolData } from "./pool-data.ts";
import type { PickRecord } from "./types.ts";
import { buildPickChoiceCorpus } from "./variant-pickchoice.ts";
import { buildPickEarlyCorpus } from "./variant-pickearly.ts";
import { buildPickPosCorpus } from "./variant-pickpos.ts";

// A pick at every position 0..9 of one pack; `takes[i]` is the chosen id(s) for
// position i (default none), `packs[i]` the offered ids.
function oneePack(
  packsAt: Record<number, string[]>,
  takesAt: Record<number, string[]>,
): PickRecord {
  const packs: string[][] = [];
  const picks: string[][] = [];
  for (let i = 0; i < 10; i += 1) {
    packs.push(packsAt[i] ?? ["filler"]);
    picks.push(takesAt[i] ?? []);
  }
  return { packs, picks };
}

function poolFrom(records: PickRecord[]) {
  return buildPoolData([], undefined, undefined, undefined, records);
}

describe("pickearly corpus", () => {
  it("counts only early picks: a late-only card stays out of the universe", () => {
    // "E" taken at position 0 (early); "L" taken only at position 7 (late, beyond
    // the earlyPicks=5 cutoff). 3 identical records for support.
    const rec = oneePack(
      { 0: ["E", "x"], 7: ["L", "y"] },
      { 0: ["E"], 7: ["L"] },
    );
    const corpus = buildPickEarlyCorpus(poolFrom([rec, rec, rec]));
    if (!corpus) throw new Error("expected a corpus");
    expect(corpus.cards).toContain("E");
    expect(corpus.cards).not.toContain("L");
  });
});

describe("pickpos corpus", () => {
  it("scores an early-taken card's priority above a late-taken card's", () => {
    // "Early" always taken at position 0, "Late" always at position 8.
    const rec = oneePack(
      { 0: ["Early", "a"], 8: ["Late", "b"] },
      { 0: ["Early"], 8: ["Late"] },
    );
    const corpus = buildPickPosCorpus(poolFrom([rec, rec, rec]));
    if (!corpus) throw new Error("expected a corpus");
    // priority = 1 - avgPosition / 9.
    expect(corpus.prior.get("Early")).toBeCloseTo(1, 12);
    expect(corpus.prior.get("Late")).toBeCloseTo(1 - 8 / 9, 12);
    expect(corpus.prior.get("Early")).toBeGreaterThan(
      corpus.prior.get("Late") ?? 1,
    );
  });
});

describe("pickchoice corpus", () => {
  it("learns positive synergy for a pair only taken together in context", () => {
    // With D in the pool, C is taken over A; with no D, A is taken over C. The
    // choice model must explain this with positive synergy[D→C]. 4 of each record
    // clears the minSupport=3 gate on the (D→C) pair.
    const withD: PickRecord = {
      packs: [
        ["D", "A"],
        ["C", "A"],
      ],
      picks: [["D"], ["C"]],
    };
    const withoutD: PickRecord = {
      packs: [["C", "A"]],
      picks: [["A"]],
    };
    const records = [
      withD,
      withD,
      withD,
      withD,
      withoutD,
      withoutD,
      withoutD,
      withoutD,
    ];
    const corpus = buildPickChoiceCorpus(poolFrom(records));
    if (!corpus) throw new Error("expected a corpus");
    expect(corpus.cards).toEqual(expect.arrayContaining(["C", "D", "A"]));
    expect(corpus.affinity.get("D")?.get("C") ?? 0).toBeGreaterThan(0);
  });
});
