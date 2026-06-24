// The `idf2` variant. It is `idf` in every respect — same corpus, same IDF
// weighting, same best-first whole-deck union — EXCEPT that the starter decklist
// is not drawn uniformly at random. The real corpus is lopsided: a popular
// archetype is recorded as dozens of near-duplicate decks while a fringe one has
// only a handful, so a uniform starter draw lands in the big clusters far more
// often and the player keeps getting the same kind of pool ("spirit animals
// again"). `idf2` counters that purely mechanically, reading nothing but the
// decklists: each candidate deck is weighted by the inverse of its near-twin
// count — how many other decks sit within `twinTau` IDF-cosine of it — so a deck
// in a 44-deck cluster competes with its 43 siblings for the same probability
// mass and over-represented archetypes are drawn far less.
// `scripts/idf-starter-diversity-experiment.mjs` validates this: at the
// production setting it lifts the effective number of distinct archetypes drawn
// from ~221 to ~552 and cuts the top archetype's share from ~4.1% to ~1.2%,
// while pool coherence barely moves.

import type { PoolStrategy } from "./strategy.ts";
import { missingPoolData, type PoolData, type VariantResult } from "./types.ts";
import {
  type IdfCorpus,
  idfCorpus,
  idfCosine,
  growIdfPool,
  resolveCountsToNames,
} from "./variant-idf.ts";

interface Idf2Tuning {
  // Two decks count as "the same archetype" (near-twins) at or above this
  // IDF-cosine similarity. The starter weight divides by the inverse twin count.
  twinTau: number;
  // Strength of the diversity bias. 0 reproduces `idf`'s uniform draw; 0.5 is the
  // gentle production setting; higher flattens cluster occupancy harder, but past
  // ~1 it starts seeding pools from decks with no real neighbours, eroding
  // coherence (see the experiment's cohesion guard).
  diversityBeta: number;
}
// Exported so `idf3` can reuse `diversityBeta` to rebuild the diversity weight
// `div(i) = 1 / (1 + nearTwins(i)) ^ diversityBeta` from the cached twin counts
// rather than recomputing the O(n²) near-twin pass.
export const IDF2: Idf2Tuning = {
  twinTau: 0.5,
  diversityBeta: 0.5,
};

// The `idf2` corpus: the `idf` corpus plus, per deck, its near-twin count — how
// many other decks sit within `IDF2.twinTau` IDF-cosine of it. Computed once in a
// single O(n²) pass and cached per PoolData, since `idf2`'s only addition over
// `idf` is to weight the starter draw by the inverse of this count.
export interface Idf2Corpus {
  base: IdfCorpus;
  twinCount: number[];
}
const idf2CorpusCache = new WeakMap<PoolData, Idf2Corpus | null>();
// Exported (with its cache) so `idf3` shares the same per-PoolData near-twin
// computation rather than running the O(n²) pass a second time.
export function idf2Corpus(poolData: PoolData): Idf2Corpus | null {
  const cached = idf2CorpusCache.get(poolData);
  if (cached !== undefined) return cached;
  const base = idfCorpus(poolData);
  let corpus: Idf2Corpus | null = null;
  if (base) {
    const { decks, idf } = base;
    const idfOf = (c: string): number => idf.get(c) ?? 0;
    const twinCount = new Array<number>(decks.length).fill(0);
    for (let i = 0; i < decks.length; i++) {
      for (let j = i + 1; j < decks.length; j++) {
        if (idfCosine(decks[i], decks[j], idfOf) >= IDF2.twinTau) {
          twinCount[i] += 1;
          twinCount[j] += 1;
        }
      }
    }
    corpus = { base, twinCount };
  }
  idf2CorpusCache.set(poolData, corpus);
  return corpus;
}

// Build a pool exactly like `idf`, but draw the starter with a diversity bias
// instead of uniformly: weight each candidate decklist by 1 / (1 + twinCount)^β,
// so decks in big near-duplicate clusters (the over-represented archetypes) are
// drawn far less often and the pool stops repeating the same archetype every run.
// Everything after the starter draw — ranking, best-first union, sizing — is
// identical to `idf`. Falls back to `default` when no usable decklists exist.
export function generateIdf2(
  rng: () => number,
  poolData: PoolData,
  targetSize?: number,
): VariantResult {
  const corpus = idf2Corpus(poolData);
  if (!corpus) missingPoolData("idf2", "no usable decklists are bundled");
  const { base, twinCount } = corpus;
  const { decks, idf } = base;

  // Pick the starter weighted by inverse near-twin count (one rng draw, as in
  // `idf`). A deck with more near-twins — i.e. in a more over-represented
  // cluster — gets proportionally less weight.
  const beta = IDF2.diversityBeta;
  const weights = twinCount.map((t) => 1 / (1 + t) ** beta);
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  let startIdx = weights.length - 1;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      startIdx = i;
      break;
    }
  }

  const { counts } = growIdfPool(decks, (c) => idf.get(c) ?? 0, startIdx, targetSize);
  return {
    C: new Set(),
    selected: ["idf2", `deck#${String(startIdx)}`],
    counts: resolveCountsToNames(counts, poolData.cardNameById),
  };
}

/** Strategy adapter for the `idf2` algorithm. */
export const idf2Strategy: PoolStrategy = {
  id: "idf2",
  description:
    "Like idf, but draws the starter deck weighted by inverse near-twin count " +
    "so over-represented archetypes are drawn far less often.",
  generate: ({ rng, poolData, targetSize }) =>
    generateIdf2(rng, poolData, targetSize),
};
