// The `tides4` variant: the human-legible counterpart of `sigseed`, built to
// reproduce the run-to-run VARIETY `sigseed` gets from a fresh random subset of a
// Dreamcaller's signature cards. A player can be told it in one sentence:
//
//   "There are preconstructed decks called tides — each has a known decklist you
//    can go read. Your Dreamcaller has a small signature tide plus several theme
//    tides; we always include the signature tide, mix in a random few theme
//    tides, shuffle them together, and deal your draft pool, never more than 2
//    copies of a card."
//
// `sigseed` grows each pool live from a random SUBSET (1..4) of a Dreamcaller's
// signature cards, and that subset is where its variety comes from: a single
// anchor leans the pool one way, a pair or triple blends them. `tides4` bakes the
// AXES of that variety as separate decks (`scripts/bake-tides4.mjs`, committed as
// `data/tides4.jsonc`, rendered as `docs/cards2/tides4_decklists.md`):
//   * a SIGNATURE tide is one signatured Dreamcaller's signature cards themselves
//     — the always-joined identity floor, standing in for the signature anchors
//     `sigseed` always seeds with;
//   * a FACET tide is a single-anchor `sigseed` pool — the coherent lean one
//     signature-region card grows into. Drawing a random few of a Dreamcaller's
//     facets each run is the direct analogue of `sigseed`'s random signature
//     subset, so different runs lean the same identity different ways;
//   * a NEUTRAL tide is a broad, format-spanning deck — the generic tail a
//     `sigseed` pool's play-rate prior pulls in, and the body of a signatureless
//     Dreamcaller's pool.
//
// At runtime the whole algorithm is the tide selection, one shuffle, and one
// deal below: join the starter, draw a random subset of facets, top up with broad
// tides until a full pool is dealable, shuffle everything into one bag, and deal
// `TIDES4.dealSize` copies at most `TIDES4.cap` of any card. A signatured
// Dreamcaller leans its own identity a different way each run (the facet subset); a
// signatureless Dreamcaller draws its subset from the broad facet set, so it leans
// toward a different coherent archetype each run — exactly how `sigseed` reduces to
// a coherent, randomly-themed `pickcohere` pool for a signatureless Dreamcaller.
// Cards are keyed by cards_v2 UUID and mapped to current names through
// `poolData.cardNameById`.

import { shuffle } from "./rng.ts";
import type { PoolStrategy } from "./strategy.ts";
import {
  missingPoolData,
  type PoolData,
  type VariantResult,
} from "./types.ts";
import type { Tides4DecksJson } from "./tides4-io.ts";

interface Tides4Tuning {
  // Copies dealt into the pool. Pinned to `sigseed`'s pool size (150) rather than
  // the quest's 200 so `tides4` reproduces the same pools `sigseed` ships; the
  // passed `targetSize` is ignored, exactly as `sigseed`/`pickfit` ignore it.
  dealSize: number;
  // Max copies of any single card dealt (the pool-wide 2-copy rule).
  cap: number;
  // The most facet tides drawn into one pool. The subset size is drawn uniformly
  // in [1, min(maxFacetDraw, available facets)], mirroring `sigseed`'s random
  // signature-subset size (`SIGSEED.maxSeedCards`), so a pool leans on a single
  // facet up to this many of them on top of the always-joined starter core.
  maxFacetDraw: number;
}
export const TIDES4: Tides4Tuning = {
  dealSize: 150,
  cap: 2,
  maxFacetDraw: 3,
};

/**
 * Build a pool by combining tide decks: join the Dreamcaller's starter tide (its
 * signature cards) when present, draw a uniformly-random subset of 1..`maxFacetDraw`
 * of its facet tides and join them, then top the bag up with broad neutral tides
 * (and any remaining facets) until a full pool can be dealt; finally shuffle the
 * whole bag and deal `TIDES4.dealSize` copies with at most `TIDES4.cap` copies of
 * any card. The random facet subset is the variety engine — it is the analogue of
 * `sigseed`'s random signature subset, so a Dreamcaller leans its identity a
 * different way each run. Tide-deck cards are keyed by cards_v2 UUID and mapped to
 * current display names through `poolData.cardNameById`; UUIDs absent from that map
 * (cards no longer in the catalog) are skipped. Without a `dreamcallerId` or a baked
 * tide pool, every tide is shuffled together (a robustness fallback; load-time
 * validation requires an entry per Dreamcaller).
 */
export function generateTides4(
  rng: () => number,
  poolData: PoolData,
  dreamcallerId?: string,
): VariantResult {
  const data: Tides4DecksJson | undefined = poolData.tides4Decks;
  if (!data) {
    missingPoolData(
      "tides4",
      "no tide decks are bundled (data/tides4.jsonc, served as /tides4-data.json)",
    );
  }
  const dealSize = TIDES4.dealSize;

  // Tide selection. Join the starter (when present), draw a random subset of the
  // facets, and queue the neutral tail plus any undrawn facets as fill. A missing
  // entry falls back to a shuffled draw over every tide so the variant still
  // produces a pool.
  const entry = dreamcallerId
    ? data.tidePoolByDreamcaller[dreamcallerId]
    : undefined;
  const joinOrder: string[] = [];
  if (entry) {
    if (entry.starter !== null) joinOrder.push(entry.starter);
    // The random facet subset — `sigseed`'s subset draw, over baked facets. Draw
    // its size first (uniform in [1, min(maxFacetDraw, facets)]), then take that
    // many from a shuffled copy of the facet list.
    const facets = shuffle(rng, [...entry.facets]);
    const hi = Math.max(1, Math.min(TIDES4.maxFacetDraw, facets.length));
    const drawCount = 1 + Math.floor(rng() * hi);
    const drawn = facets.slice(0, Math.min(drawCount, facets.length));
    joinOrder.push(...drawn);
    // Fill, joined only if the starter plus the drawn facets cannot fill the pool:
    // any undrawn (on-identity) facets first, then the broad neutral tail. Keeping
    // the on-theme facets ahead of the neutral tail means a pool only reaches for
    // generic cards once its own theme is exhausted.
    joinOrder.push(...facets.slice(Math.min(drawCount, facets.length)));
    joinOrder.push(...shuffle(rng, [...entry.neutral]));
  } else {
    joinOrder.push(...shuffle(rng, data.tides.map((t) => t.id)));
  }

  // The bag: every copy of every card in the joined tides, as current display
  // names — in `joinOrder`, joining only as far as needed for a full pool.
  // `dealable` counts the copies the deal below can actually use (the bag total
  // minus copies beyond the per-card cap), so the pool keeps joining tides until
  // it reaches full size. When no card index is available (the synthetic pools
  // some tests build), the artifact's informational names are used directly.
  const tideById = new Map(data.tides.map((t) => [t.id, t]));
  const bag: string[] = [];
  const bagCounts = new Map<string, number>();
  let dealable = 0;
  const deckIds: string[] = [];
  const joinTide = (id: string): void => {
    const tide = tideById.get(id);
    if (!tide) return;
    deckIds.push(id);
    for (const card of tide.cards) {
      const name = poolData.cardNameById
        ? poolData.cardNameById.get(card.id)
        : card.name;
      if (name === undefined) continue;
      for (let i = 0; i < card.copies; i += 1) {
        const have = bagCounts.get(name) ?? 0;
        bagCounts.set(name, have + 1);
        bag.push(name);
        if (have < TIDES4.cap) dealable += 1;
      }
    }
  };
  for (const id of joinOrder) {
    if (dealable >= dealSize) break;
    joinTide(id);
  }

  // One shuffle, one deal: take cards in bag order, skipping any already at the
  // copy cap, until the pool reaches the target size or the bag is empty.
  shuffle(rng, bag);
  const counts = new Map<string, number>();
  let size = 0;
  for (const name of bag) {
    if (size >= dealSize) break;
    const have = counts.get(name) ?? 0;
    if (have >= TIDES4.cap) continue;
    counts.set(name, have + 1);
    size += 1;
  }

  // No color identity (this variant reads nothing but the tide decks); the labels
  // record the algorithm and the tide ids the pool was dealt from.
  return { C: new Set(), selected: ["tides4", ...deckIds], counts };
}

/** Strategy adapter for the `tides4` algorithm. */
export const tides4Strategy: PoolStrategy = {
  id: "tides4",
  description:
    "Combine preconstructed tides into a pool: the Dreamcaller's signature tide " +
    "plus a random subset of its theme (facet) tides, shuffled together and topped " +
    "up with broad tides. Reproduces sigseed's random-subset variety from readable " +
    "decks.",
  generate: ({ rng, poolData, dreamcallerId }) =>
    generateTides4(rng, poolData, dreamcallerId),
};
