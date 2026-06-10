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
// Dreamcaller leans its own identity a different way each run (the facet subset).
// A signatureless Dreamcaller has no identity to anchor on, so — exactly as
// `sigseed` reduces to a coherent, randomly-themed `pickcohere` pool — it borrows a
// random signatured Dreamcaller's whole pool (that archetype's signature core plus
// its own facets), leaning toward a different coherent archetype each run rather
// than a blend of unrelated leans. Cards are keyed by cards_v2 UUID and mapped to
// current names through `poolData.cardNameById`.

import { shuffle } from "./rng.ts";
import type { PoolStrategy } from "./strategy.ts";
import {
  missingPoolData,
  type PoolData,
  type Tides4PoolCardProvenance,
  type Tides4PoolProvenance,
  type Tides4PoolTide,
  type Tides4PoolTideSelection,
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
 * different way each run. A signatureless Dreamcaller (null starter) instead borrows
 * a random signatured Dreamcaller's pool, so it leans a different coherent archetype
 * each run. Tide-deck cards are keyed by cards_v2 UUID and mapped to current display
 * names through `poolData.cardNameById`; UUIDs absent from that map (cards no longer
 * in the catalog) are skipped. Without a `dreamcallerId` or a baked tide pool, every
 * tide is shuffled together (a robustness fallback; load-time validation requires an
 * entry per Dreamcaller).
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
  const own = dreamcallerId
    ? data.tidePoolByDreamcaller[dreamcallerId]
    : undefined;
  // A signatureless Dreamcaller (null starter) leans a random coherent archetype
  // each run, the way `sigseed` reduces to `pickcohere`: it borrows a random
  // signatured Dreamcaller's whole pool — that archetype's signature core plus its
  // own on-identity facets — so the pool is a single coherent archetype rather than
  // a blend of unrelated facet leans. The archetype draw consumes one `rng()` and
  // happens only for signatureless Dreamcallers, so a signatured Dreamcaller's draw
  // is unchanged.
  const signatureless = own !== undefined && own.starter === null;
  let entry = own;
  if (signatureless) {
    const archetypes = Object.values(data.tidePoolByDreamcaller)
      .filter((e) => e.starter !== null)
      .sort((a, b) => ((a.starter ?? "") < (b.starter ?? "") ? -1 : 1));
    if (archetypes.length > 0) {
      entry = archetypes[Math.floor(rng() * archetypes.length)];
    }
  }
  const tideById = new Map(data.tides.map((t) => [t.id, t]));
  // The borrowed archetype's name (for a signatureless Dreamcaller): the name of
  // the signature tide the pool leaned on this run, surfaced by the debug
  // surfaces so the player can read which coherent archetype they got.
  const borrowedArchetypeName =
    signatureless && entry && entry.starter !== null
      ? (tideById.get(entry.starter)?.name ?? null)
      : null;

  // The full selection order for this run's pool, each tide tagged with WHY it
  // was joined: the always-joined starter, the random facet subset (the variety
  // engine), then the fill (undrawn facets, kept ahead of the broad tail so a
  // pool only reaches for generic cards once its own theme is exhausted).
  const joinSelections: { id: string; selection: Tides4PoolTideSelection }[] = [];
  let facetAvailableCount = 0;
  let facetDrawnCount = 0;
  if (entry) {
    if (entry.starter !== null) {
      joinSelections.push({ id: entry.starter, selection: "starter" });
    }
    // The random facet subset — `sigseed`'s subset draw, over baked facets. Draw
    // its size first (uniform in [1, min(maxFacetDraw, facets)]), then take that
    // many from a shuffled copy of the facet list.
    const facets = shuffle(rng, [...entry.facets]);
    facetAvailableCount = facets.length;
    const hi = Math.max(1, Math.min(TIDES4.maxFacetDraw, facets.length));
    const drawCount = 1 + Math.floor(rng() * hi);
    const split = Math.min(drawCount, facets.length);
    facetDrawnCount = split;
    for (const id of facets.slice(0, split)) {
      joinSelections.push({ id, selection: "facet-drawn" });
    }
    for (const id of facets.slice(split)) {
      joinSelections.push({ id, selection: "facet-fill" });
    }
    for (const id of shuffle(rng, [...entry.neutral])) {
      joinSelections.push({ id, selection: "neutral-fill" });
    }
  } else {
    // Robustness fallback (load-time validation requires an entry per
    // Dreamcaller): shuffle every tide together, tagging each by its own role.
    for (const id of shuffle(rng, data.tides.map((t) => t.id))) {
      const role = tideById.get(id)?.role;
      joinSelections.push({
        id,
        selection:
          role === "signature"
            ? "starter"
            : role === "facet"
              ? "facet-drawn"
              : "neutral-fill",
      });
    }
  }

  // The bag: every copy of every card in the joined tides, as current display
  // names — in selection order, folding only as far as needed for a full pool.
  // `dealable` counts the copies the deal below can actually use (the bag total
  // minus copies beyond the per-card cap), so the pool keeps joining tides until
  // it reaches full size. When no card index is available (the synthetic pools
  // some tests build), the artifact's informational names are used directly.
  //
  // Every tide in the selection is also recorded for provenance — its full
  // resolvable decklist and why it was joined — even past the point the bag is
  // full, so the Pool Viewer can show each individual tide deck and the "Why
  // Cards" surface can attribute every pooled card to the tide it rode in on.
  // Folding stops at the same point as before, so the dealt pool is unchanged.
  const bag: string[] = [];
  const bagCounts = new Map<string, number>();
  let dealable = 0;
  const deckIds: string[] = [];
  const tides: Tides4PoolTide[] = [];
  // Card name -> joined tide ids that contain it, in join order. The first id is
  // the card's "home" (primary) tide.
  const containingTides = new Map<string, string[]>();
  const recordTide = (
    id: string,
    selection: Tides4PoolTideSelection,
    fold: boolean,
  ): void => {
    const tide = tideById.get(id);
    if (!tide) return;
    const cardNames: string[] = [];
    const seenInTide = new Set<string>();
    for (const card of tide.cards) {
      const name = poolData.cardNameById
        ? poolData.cardNameById.get(card.id)
        : card.name;
      if (name === undefined) continue;
      if (!seenInTide.has(name)) {
        seenInTide.add(name);
        cardNames.push(name);
      }
      if (!fold) continue;
      let homes = containingTides.get(name);
      if (homes === undefined) {
        homes = [];
        containingTides.set(name, homes);
      }
      if (!homes.includes(id)) homes.push(id);
      for (let i = 0; i < card.copies; i += 1) {
        const have = bagCounts.get(name) ?? 0;
        bagCounts.set(name, have + 1);
        bag.push(name);
        if (have < TIDES4.cap) dealable += 1;
      }
    }
    if (fold) deckIds.push(id);
    tides.push({
      id,
      name: tide.name,
      role: tide.role,
      selection,
      joined: fold,
      cardNames,
      contributedCardCount: 0,
    });
  };
  for (const { id, selection } of joinSelections) {
    recordTide(id, selection, dealable < dealSize);
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

  // Per-card provenance over the dealt pool, plus each tide's contribution (the
  // pooled cards whose home tide is that one).
  const cardProvenanceByName: Record<string, Tides4PoolCardProvenance> = {};
  const contributionByTide = new Map<string, number>();
  for (const [name, copies] of counts) {
    const homes = containingTides.get(name) ?? [];
    const primaryTideId = homes[0] ?? "";
    cardProvenanceByName[name] = {
      copies,
      tideIds: [...homes],
      primaryTideId,
    };
    if (primaryTideId !== "") {
      contributionByTide.set(
        primaryTideId,
        (contributionByTide.get(primaryTideId) ?? 0) + 1,
      );
    }
  }
  for (const tide of tides) {
    tide.contributedCardCount = contributionByTide.get(tide.id) ?? 0;
  }

  const tides4Provenance: Tides4PoolProvenance = {
    dreamcallerId: dreamcallerId ?? "",
    signatureless,
    borrowedArchetypeName,
    dealSize,
    cap: TIDES4.cap,
    facetDrawnCount,
    facetAvailableCount,
    tides,
    cardProvenanceByName,
  };

  // No color identity (this variant reads nothing but the tide decks); the labels
  // record the algorithm and the tide ids the pool was dealt from.
  return {
    C: new Set(),
    selected: ["tides4", ...deckIds],
    counts,
    tides4Provenance,
  };
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
