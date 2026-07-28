// The `seed` variant: a single-card affinity-grown pool. It marries the two
// ideas this prototype already trusts —
//   * fresh20 / replay scoring: cards belong together when they CO-OCCUR in real
//     decks, weighted by IDF so "fits with" means "shares distinctive cards"
//     rather than "shares popular staples" (the same signal the replay/fresh20
//     deck-fit model reads, see `draft/replay/fit-model.ts`);
//   * the decklist pool grower: start from one point and expand outward by
//     affinity until the pool reaches a target size (the `idf` family).
// — but operates at the granularity of a single card instead of a whole deck.
//
// It draws ONE card uniformly at random from the corpus (every card that appears
// in a real deck is equally likely to be the seed), then grows a pool around it
// one copy at a time via the shared {@link growAffinityPool}. The blend that
// grower uses (seed affinity vs. pool coherence vs. play-rate prior) is dialled
// by the `SEED` tuning block below.
//
// This variant's whole contribution is its CORPUS: an IDF-weighted card-to-card
// co-occurrence affinity plus a decklist play-rate prior, built here from the
// bundled decklists. The `pickfit` variant shares the same grower but builds its
// corpus from real draft pick records instead, so the two differ only in their
// data source.
//
// Like the rest of the pool family this reads nothing but the bundled decklists —
// no colors, tides, archetype labels, dreamAvatars, or signatures. The only
// randomness is which card seeds the pool.
//
// Cards are identified by their stable cards_v2 UUID, not by display name, so a
// card rename never shifts the draw, the growth tie-breaks, or the provenance.
// The decklist corpus arrives keyed by UUID (`PoolData.decklistIds`) and the
// variant emits the finished pool keyed by UUID (the `CardId` output contract),
// which the downstream resolver maps to card numbers through the id index. When
// the source cards carry no id (some experiments and tests), the corpus keys are
// opaque ids throughout.

import {
  type AffinityCorpus,
  type AffinityGrowerTuning,
  growAffinityPool,
  toVariantResult,
} from "./affinity-grower.ts";
import type { PoolStrategy } from "./strategy.ts";
import { missingPoolData, type PoolData, type VariantResult } from "./types.ts";
import { idfCorpus } from "./variant-idf.ts";

// Tuning for the `seed` variant. One-stop edit, mirroring the `IDF`/`IDF3`
// constant blocks the sibling variants use. Extends the shared grower tuning
// with this variant's own pool-size target.
interface SeedTuning extends AffinityGrowerTuning {
  // Desired pool size in TOTAL copies (each card contributes 1 or 2). The grower
  // adds one copy at a time and stops the moment it reaches this. This is the
  // "build a pool of 150 cards" target — change it here to retune pool size.
  targetSize: number;
}
export const SEED: SeedTuning = {
  targetSize: 150,
  cap: 2,
  seedAffinityWeight: 0.4,
  priorWeight: 0.1,
  secondCopyFactor: 0.55,
  topPartnerCount: 8,
};

const seedCorpusCache = new WeakMap<PoolData, AffinityCorpus | null>();

// Build the `seed` corpus: IDF-weighted card-to-card co-occurrence affinity and a
// decklist play-rate prior, the same construction the replay deck-fit model uses
// for its co-occurrence term. For every pair of cards sharing a real deck,
// accumulate idf(a)·idf(b), then normalise each row by the source card's document
// frequency so `affinity.get(a).get(b)` reads as "how strongly b partners a,
// averaged over the decks that run a".
function buildSeedCorpus(poolData: PoolData): AffinityCorpus | null {
  const cached = seedCorpusCache.get(poolData);
  if (cached !== undefined) return cached;

  // Reuse the shared IDF corpus (size-filtered decks + per-card IDF weights), so
  // corpus hygiene and the IDF definition stay identical to the other variants.
  const corpus = idfCorpus(poolData);
  let result: AffinityCorpus | null = null;
  if (corpus && corpus.decks.length > 0) {
    const { decks, idf } = corpus;
    // The corpus and its IDF weights are keyed by each card's rename-proof UUID,
    // so identity (df, affinity, prior, every map key below) keys on the corpus
    // token directly.
    const idfOf = (key: string): number => idf.get(key) ?? 0;
    const n = decks.length;

    // Document frequency per card key, and the play-rate prior derived from it.
    // Counted once per deck per key, so a card contributes to its key once per
    // deck.
    const df = new Map<string, number>();
    for (const deck of decks) {
      const keys = new Set<string>();
      for (const c of deck.cards) keys.add(c);
      for (const k of keys) df.set(k, (df.get(k) ?? 0) + 1);
    }
    const prior = new Map<string, number>();
    for (const [c, d] of df) prior.set(c, d / n);

    // Raw IDF-weighted co-occurrence over every within-deck card pair, accumulated
    // by card key.
    const cooc = new Map<string, Map<string, number>>();
    const bump = (a: string, b: string, w: number): void => {
      let row = cooc.get(a);
      if (row === undefined) {
        row = new Map<string, number>();
        cooc.set(a, row);
      }
      row.set(b, (row.get(b) ?? 0) + w);
    };
    for (const deck of decks) {
      const names = [...deck.cards];
      for (let i = 0; i < names.length; i += 1) {
        const aKey = names[i];
        const wa = idfOf(names[i]);
        if (wa === 0) continue;
        for (let j = i + 1; j < names.length; j += 1) {
          const bKey = names[j];
          if (bKey === aKey) continue;
          const w = wa * idfOf(names[j]);
          if (w === 0) continue;
          bump(aKey, bKey, w);
          bump(bKey, aKey, w);
        }
      }
    }

    // Normalise each row by the source card's document frequency.
    const affinity = new Map<string, Map<string, number>>();
    for (const [a, row] of cooc) {
      const dfa = df.get(a) ?? 0;
      if (dfa === 0) continue;
      const normRow = new Map<string, number>();
      for (const [b, w] of row) normRow.set(b, w / dfa);
      affinity.set(a, normRow);
    }

    result = { cards: [...df.keys()], affinity, prior };
  }

  seedCorpusCache.set(poolData, result);
  return result;
}

// Build a `seed` pool: draw one card uniformly at random from the corpus, then
// grow the pool around it by blended IDF-affinity to `SEED.targetSize` copies.
// Cards are drawn and grown in UUID-key space (rename-proof); the finished pool
// is emitted keyed by UUID. Ignores `signatureCards`, `seedArchetypes`,
// `themeArchetypes`, and the passed `targetSize` (the variant owns its size via
// `SEED.targetSize`). Falls back to the `default` algorithm when no usable
// decklists are bundled.
export function generateSeed(rng: () => number, poolData: PoolData): VariantResult {
  const corpus = buildSeedCorpus(poolData);
  if (!corpus || corpus.cards.length === 0) {
    missingPoolData("seed", "no usable decklists are bundled");
  }

  // Step 1 — draw the seed uniformly at random from every corpus card key.
  const seedKey = corpus.cards[Math.floor(rng() * corpus.cards.length)];

  // Step 2 — grow the pool from it by blended affinity, entirely in key space.
  const { counts, provenance } = growAffinityPool(
    corpus,
    seedKey,
    SEED.targetSize,
    SEED,
  );

  // Step 3 — assemble the UUID-keyed pool and provenance into the variant result.
  // Counts are branded onto the `CardId` output contract; display names are
  // resolved only at the render boundary.
  return toVariantResult(counts, provenance, "seed");
}

/** Strategy adapter for the `seed` algorithm. */
export const seedStrategy: PoolStrategy = {
  id: "seed",
  description:
    "Draw one card at random and grow a 150-card pool around it by IDF-weighted " +
    "co-occurrence affinity — to the seed and to the cards already chosen.",
  // Deliberately ignores `request.targetSize`: the variant pins its own size via
  // `SEED.targetSize`, so the journey's global pool target does not override it.
  generate: ({ rng, poolData }) => generateSeed(rng, poolData),
};
