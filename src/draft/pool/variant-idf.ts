// The `idf` variant. It is the simplest decklist-based pool: pick one real
// decklist at random, rank every other decklist by IDF-weighted cosine
// similarity to it, then union whole decklists best-first (capping copies) until
// the pool size lands closest to the target. It reads nothing but the bundled
// decklists — no tides, archetypes, colors, dreamcallers, or core staples bias
// the cards chosen. IDF (log of inverse document frequency) is what makes
// "similar" mean "shares distinctive cards" rather than "shares popular cards":
// a card in nearly every deck gets ~0 weight. The corpus, cosine, and growth
// helpers here are shared with the `idf2` variant.
//
// The corpus is keyed on each card's stable cards_v2 UUID (the `decklistIds`
// source), never its display name, so two distinct cards that share a name stay
// distinct in document-frequency and similarity scoring. The grown pool's copy
// counts therefore come out keyed by UUID and are branded onto the `CardId`
// output contract at the variant boundary ({@link brandPoolCounts}); the
// downstream resolver maps them to card numbers through the collision-free id
// index. A synthetic corpus with no UUID source (tests) passes opaque ids.

import type { PoolStrategy } from "./strategy.ts";
import {
  brandPoolCounts,
  missingPoolData,
  type PoolData,
  type VariantResult,
} from "./types.ts";

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
  /** Document frequency by card key: how many corpus decks contain each card.
   * Populated by {@link buildIdfStats}; optional so other IdfCorpus constructors
   * need not provide it. */
  df?: ReadonlyMap<string, number>;
}
const idfCorpusCache = new WeakMap<PoolData, IdfCorpus | null>();
export function idfCorpus(poolData: PoolData): IdfCorpus | null {
  const cached = idfCorpusCache.get(poolData);
  if (cached !== undefined) return cached;
  let corpus: IdfCorpus | null = null;
  // Prefer the id-keyed corpus so same-name cards stay distinct; fall back to the
  // name corpus for synthetic / test PoolData that carries no UUID source.
  const source = poolData.decklistIds ?? poolData.decklists;
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

/** One decklist folded into a grown pool, in growth order. */
export interface IncludedDeck {
  /** Index of the deck in the corpus `decks` array. */
  deckIndex: number;
  /**
   * IDF-cosine similarity of this deck to the starter. The starter itself is
   * reported as `1` (it is identical to itself); every neighbour is `< 1`.
   */
  similarityToStarter: number;
}

/** What {@link growIdfPool} produced: the capped pool and how it was grown. */
export interface IdfGrowthResult {
  /** Card name -> copy count (1 or 2) of the kept pool. */
  counts: Map<string, number>;
  /**
   * The decks actually folded into the kept pool, in growth order: the starter
   * first (similarity 1), then the similarity-ranked neighbours up to the
   * boundary the builder settled on. Decks folded past that boundary are
   * excluded. `idf3` reads this to attribute each pooled card to the nearest
   * source deck it came from.
   */
  includedDecks: IncludedDeck[];
}

// Grow a pool from a chosen starter decklist, shared by `idf` and `idf2` (they
// differ only in how the starter is picked). Rank every other decklist by
// IDF-cosine similarity to the starter, then union whole decklists best-first —
// capping copies at `IDF.cap` — keeping the whole-deck boundary whose size lands
// closest to `IDF.targetSize` (tie-break toward the larger pool), stopping once a
// candidate reaches the top of the window since going further only moves away.
// Decks are never truncated. Returns the kept pool together with the ordered
// list of decks folded into it (see {@link IdfGrowthResult}).
export function growIdfPool(
  decks: IdfDeck[],
  idfOf: (c: string) => number,
  startIdx: number,
  targetSize: number = IDF.targetSize,
): IdfGrowthResult {
  const starter = decks[startIdx];
  const ranked = decks
    .map((d, i) => ({ d, i }))
    .filter((x) => x.i !== startIdx)
    .map((x) => ({ d: x.d, i: x.i, sim: idfCosine(starter, x.d, idfOf) }))
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
  // `foldedNeighbours` records how many ranked neighbours were folded in at the
  // kept boundary, so the included-deck list can be sliced to exactly that pool.
  let best = { counts: new Map(pool), size, foldedNeighbours: 0 };
  for (let k = 0; k < ranked.length; k += 1) {
    size += unionInto(pool, ranked[k].d.cards);
    if (
      Math.abs(size - targetSize) < Math.abs(best.size - targetSize) ||
      (Math.abs(size - targetSize) === Math.abs(best.size - targetSize) &&
        size > best.size)
    ) {
      best = { counts: new Map(pool), size, foldedNeighbours: k + 1 };
    }
    if (size >= high) break;
  }
  const includedDecks: IncludedDeck[] = [
    { deckIndex: startIdx, similarityToStarter: 1 },
    ...ranked
      .slice(0, best.foldedNeighbours)
      .map((r) => ({ deckIndex: r.i, similarityToStarter: r.sim })),
  ];
  return { counts: best.counts, includedDecks };
}

// Grow a pool from a chosen starter by COHERENT full-pool growth, an alternative
// to {@link growIdfPool} used by the `idf4` variant. Where `growIdfPool` ranks
// neighbours once by similarity to the FIXED starter, this grows greedily against
// the ACCUMULATING pool: at each step it folds in the unfolded deck whose
// IDF-cosine to the current pool vector (the pool's capped copy counts weighted by
// IDF) is highest, caps copies at 2, and stops once the pool reaches
// `targetSize`. Folding against the moving pool centroid keeps a far deck that
// merely shares the starter's signature card — but little else — out unless it
// also coheres with what the pool already holds, so the grown pool drifts less.
// Whole decks are folded; cards are never truncated. The starter is folded first.
// Ported from `coherentGrow` in `scripts/idf3-coherent-growth.mjs`.
export function growCoherentPool(
  decks: IdfDeck[],
  idfOf: (c: string) => number,
  startIdx: number,
  targetSize: number = IDF.targetSize,
): Map<string, number> {
  const counts = new Map<string, number>();
  const foldDeck = (d: IdfDeck): void => {
    for (const c of d.cards) {
      const have = counts.get(c) ?? 0;
      if (have >= IDF.cap) continue;
      counts.set(c, have + 1);
    }
  };
  const folded = new Set<number>([startIdx]);
  foldDeck(decks[startIdx]);
  const sizeOf = (): number => {
    let s = 0;
    for (const v of counts.values()) s += v;
    return s;
  };

  while (sizeOf() < targetSize) {
    // The pool as an IDF vector (card -> capped copies) and its norm.
    let pnorm = 0;
    for (const [c, v] of counts) pnorm += (idfOf(c) * v) ** 2;
    pnorm = Math.sqrt(pnorm) || 1;

    // Fold the unfolded deck whose IDF-cosine to the pool vector is highest.
    let best = -1;
    let bestSim = -1;
    for (let i = 0; i < decks.length; i++) {
      if (folded.has(i)) continue;
      let dot = 0;
      for (const c of decks[i].cards) {
        const v = counts.get(c);
        if (v) dot += idfOf(c) ** 2 * v;
      }
      const sim = dot / (pnorm * (decks[i].norm || 1));
      if (sim > bestSim) {
        bestSim = sim;
        best = i;
      }
    }
    if (best < 0) break;
    folded.add(best);
    foldDeck(decks[best]);
  }
  return counts;
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
  if (!corpus) missingPoolData("idf", "no usable decklists are bundled");
  const { decks, idf } = corpus;

  // Pick the starter decklist uniformly at random, then grow the pool from it.
  const startIdx = Math.floor(rng() * decks.length);
  const { counts } = growIdfPool(decks, (c) => idf.get(c) ?? 0, startIdx, targetSize);

  // No color identity: deriving one would read the color metadata, and this
  // variant consumes nothing but the decklists. The identity string is left
  // empty; the labels record only that this is `idf` and which corpus decklist
  // started the pool. The grown pool is keyed by the corpus's UUIDs, branded
  // onto the `CardId` output contract for the downstream id-index resolver.
  return {
    C: new Set(),
    selected: ["idf", `deck#${String(startIdx)}`],
    counts: brandPoolCounts(counts),
  };
}

/** Strategy adapter for the `idf` algorithm. */
export const idfStrategy: PoolStrategy = {
  id: "idf",
  description:
    "Simplest decklist pool: pick one real deck at random and grow it by " +
    "IDF-cosine similarity to the rest of the corpus.",
  generate: ({ rng, poolData, targetSize }) =>
    generateIdf(rng, poolData, targetSize),
};
