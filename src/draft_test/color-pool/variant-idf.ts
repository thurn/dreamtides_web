// The `idf` variant. It is the simplest decklist-based pool: pick one real
// decklist at random, rank every other decklist by IDF-weighted cosine
// similarity to it, then union whole decklists best-first (capping copies) until
// the pool size lands closest to the target. It reads nothing but the bundled
// decklists — no tides, archetypes, colors, dreamcallers, or core staples bias
// the cards chosen. IDF (log of inverse document frequency) is what makes
// "similar" mean "shares distinctive cards" rather than "shares popular cards":
// a card in nearly every deck gets ~0 weight. The corpus, cosine, and growth
// helpers here are shared with the `idf2` variant.

import type { PoolData, VariantResult } from "./types.ts";
import { generate } from "./variant-default.ts";

// Knobs for the `idf` variant. These are the in-app equivalents of the
// `scripts/similar-pool.mjs` command-line flags; edit here to retune. Grouped so
// tuning is a one-stop edit.
interface IdfTuning {
  targetSize: number;
  targetTolerance: number;
  cap: number;
  idfPower: number;
  minDf: number;
  maxDfFrac: number;
  minDeckSize: number;
  maxDeckSize: number;
}
export const IDF: IdfTuning = {
  // Desired pool size in copies. The builder lands on the whole-deck boundary
  // whose size is closest to this — it never truncates a deck mid-list.
  targetSize: 100,
  // Half-width of the acceptable size window: the pool may end anywhere in
  // [targetSize - targetTolerance, targetSize + targetTolerance] (e.g. 90-110).
  // The boundary nearest targetSize wins; this only widens what counts as "ok".
  targetTolerance: 10,
  // Max copies of any single card. The draft engine caps every pool at 2 copies
  // downstream, so values above 2 have no extra effect; set 1 for a singleton
  // pool.
  cap: 2,
  // Exponent on the idf weights. 1 = standard. >1 sharpens the rarity emphasis
  // (staples matter even less); 0 = ignore rarity, plain card-presence cosine.
  idfPower: 1,
  // Ignore cards appearing in fewer than this many decks when SCORING similarity
  // (they are still unioned into the pool). 1 keeps all.
  minDf: 1,
  // Ignore cards appearing in more than this FRACTION of decks when SCORING
  // similarity — a hard staple cutoff. 1 keeps all.
  maxDfFrac: 1,
  // Corpus hygiene: ignore decklists smaller than this. The tail of
  // partial/near-empty files carries too little signal to anchor or match on.
  minDeckSize: 16,
  // Corpus hygiene: ignore decklists larger than this. The handful of 50-91 card
  // files are aggregates, not drafted decks, and would distort df and overlap.
  maxDeckSize: 34,
};

// Its own IDF corpus over the filtered decklists, tuned by `IDF` (not the
// `decklists` variant's corpus, so the two can be retuned independently).
// Weights are idf^idfPower with the rare/staple cutoffs applied: a card outside
// [minDf, maxDfFrac * n] gets 0 weight and so cannot drive similarity, while
// still being unionable into the pool. Cached per PoolData.
export interface IdfDeck {
  cards: Set<string>;
  norm: number;
}
export interface IdfCorpus {
  decks: IdfDeck[];
  idf: Map<string, number>;
}
const idfCorpusCache = new WeakMap<PoolData, IdfCorpus | null>();
export function idfCorpus(poolData: PoolData): IdfCorpus | null {
  const cached = idfCorpusCache.get(poolData);
  if (cached !== undefined) return cached;
  let corpus: IdfCorpus | null = null;
  const source = poolData.decklists;
  if (source && source.length > 0) {
    const filtered = source
      .map((d) => new Set(d))
      .filter((s) => s.size >= IDF.minDeckSize && s.size <= IDF.maxDeckSize);
    if (filtered.length > 0) {
      const n = filtered.length;
      const df = new Map<string, number>();
      for (const s of filtered) for (const c of s) df.set(c, (df.get(c) ?? 0) + 1);
      const maxDf = IDF.maxDfFrac * n;
      const idf = new Map<string, number>();
      for (const [c, d] of df) {
        // Cards too rare or too common carry no similarity signal.
        if (d < IDF.minDf || d > maxDf) {
          idf.set(c, 0);
          continue;
        }
        idf.set(c, Math.log((n + 1) / d) ** IDF.idfPower);
      }
      const decks = filtered.map((cards): IdfDeck => {
        let sq = 0;
        for (const c of cards) {
          const w = idf.get(c) ?? 0;
          sq += w * w;
        }
        return { cards, norm: Math.sqrt(sq) || 1 };
      });
      corpus = { decks, idf };
    }
  }
  idfCorpusCache.set(poolData, corpus);
  return corpus;
}

// IDF-weighted cosine similarity between two decklist vectors, shared by `idf`
// and `idf2`. Cards present in both decks contribute idf², divided by the
// product of the precomputed norms.
export function idfCosine(
  a: IdfDeck,
  b: IdfDeck,
  idfOf: (c: string) => number,
): number {
  const [small, large] = a.cards.size <= b.cards.size ? [a, b] : [b, a];
  let dot = 0;
  for (const c of small.cards) if (large.cards.has(c)) dot += idfOf(c) ** 2;
  return dot / (a.norm * b.norm);
}

// Grow a pool from a chosen starter decklist, shared by `idf` and `idf2` (they
// differ only in how the starter is picked). Rank every other decklist by
// IDF-cosine similarity to the starter, then union whole decklists best-first —
// capping copies at `IDF.cap` — keeping the whole-deck boundary whose size lands
// closest to `IDF.targetSize` (tie-break toward the larger pool), stopping once a
// candidate reaches the top of the window since going further only moves away.
// Decks are never truncated.
export function growIdfPool(
  decks: IdfDeck[],
  idfOf: (c: string) => number,
  startIdx: number,
  targetSize: number = IDF.targetSize,
): Map<string, number> {
  const starter = decks[startIdx];
  const ranked = decks
    .map((d, i) => ({ d, i }))
    .filter((x) => x.i !== startIdx)
    .map((x) => ({ d: x.d, sim: idfCosine(starter, x.d, idfOf) }))
    .sort((a, b) => b.sim - a.sim);

  const high = targetSize + IDF.targetTolerance;
  const unionInto = (pool: Map<string, number>, cards: Set<string>): number => {
    let added = 0;
    for (const c of cards) {
      const have = pool.get(c) ?? 0;
      if (have >= IDF.cap) continue;
      pool.set(c, have + 1);
      added += 1;
    }
    return added;
  };
  const pool = new Map<string, number>();
  let size = unionInto(pool, starter.cards);
  let best = { counts: new Map(pool), size };
  for (const { d } of ranked) {
    size += unionInto(pool, d.cards);
    if (
      Math.abs(size - targetSize) < Math.abs(best.size - targetSize) ||
      (Math.abs(size - targetSize) === Math.abs(best.size - targetSize) &&
        size > best.size)
    ) {
      best = { counts: new Map(pool), size };
    }
    if (size >= high) break;
  }
  return best.counts;
}

// Build a pool purely from real decklists: pick one at random, rank the rest by
// IDF-weighted cosine similarity to it, then union whole decklists best-first —
// capping copies at `IDF.cap` — keeping the whole-deck boundary whose size lands
// closest to `IDF.targetSize`. Decks are never truncated. This variant ignores
// `seedArchetypes`/`themeArchetypes` and every other input entirely; the only
// randomness is which decklist starts the pool. Falls back to the `default`
// algorithm when no usable decklists are bundled.
export function generateIdf(
  rng: () => number,
  poolData: PoolData,
  targetSize?: number,
): VariantResult {
  const corpus = idfCorpus(poolData);
  if (!corpus) return generate(rng, poolData, undefined, targetSize);
  const { decks, idf } = corpus;

  // Pick the starter decklist uniformly at random, then grow the pool from it.
  const startIdx = Math.floor(rng() * decks.length);
  const counts = growIdfPool(decks, (c) => idf.get(c) ?? 0, startIdx, targetSize);

  // No color identity: deriving one would read the color metadata, and this
  // variant consumes nothing but the decklists. The identity string is left
  // empty; the labels record only that this is `idf` and which corpus decklist
  // started the pool.
  return { C: new Set(), selected: ["idf", `deck#${String(startIdx)}`], counts };
}
