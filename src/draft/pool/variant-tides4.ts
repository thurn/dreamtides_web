// The `tides4` variant: the human-legible counterpart of `sigseed`, built to
// reproduce the run-to-run VARIETY `sigseed` gets from a fresh random subset of a
// DreamAvatar's signature cards. A player can be told it in one sentence:
//
//   "There are preconstructed decks called tides — each has a known decklist you
//    can go read. Your DreamAvatar has a small signature tide plus several theme
//    tides; we always include the signature tide, mix in a random few theme
//    tides, shuffle them together, and deal your draft pool, never more than 2
//    copies of a card."
//
// `sigseed` grows each pool live from a random SUBSET (1..4) of an avatar's
// signature cards, and that subset is where its variety comes from: a single
// anchor leans the pool one way, a pair or triple blends them. `tides4` bakes the
// AXES of that variety as separate decks (`scripts/bake-tides4.mjs`, committed as
// `data/tides4.jsonc`, rendered as `docs/cards2/tides4_decklists.md`):
//   * a SIGNATURE tide is one signatured DreamAvatar's signature cards themselves
//     — the always-joined identity floor, standing in for the signature anchors
//     `sigseed` always seeds with;
//   * a FACET tide is a single-anchor `sigseed` pool — the coherent lean one
//     signature-region card grows into. Drawing a random few of an avatar's
//     facets each run is the direct analogue of `sigseed`'s random signature
//     subset, so different runs lean the same identity different ways;
//   * a NEUTRAL tide is a broad, format-spanning deck — the generic tail a
//     `sigseed` pool's play-rate prior pulls in, and the body of a signatureless
//     DreamAvatar's pool.
//
// At runtime the whole algorithm is the tide selection, one shuffle, and the
// two-pass deal below: join the starter, draw a random subset of facets, top up
// with broad tides until a full pool is dealable, shuffle everything into one
// bag, and deal `TIDES4.dealSize` copies at most `TIDES4.cap` of any card —
// seeding the starter's (signature) cards first so the signature tide is
// guaranteed into the pool rather than risking being cut by the bag overflow. A
// signatured
// DreamAvatar leans its own identity a different way each run (the facet subset).
// A signatureless DreamAvatar has no identity to anchor on, so — exactly as
// `sigseed` reduces to a coherent, randomly-themed `pickcohere` pool — it borrows a
// random signatured DreamAvatar's whole pool (that archetype's signature core plus
// its own facets), leaning toward a different coherent archetype each run rather
// than a blend of unrelated leans. The pool is keyed by cards_v2 UUID; the
// catalog index (`poolData.cardNameById`) gates which UUIDs are dealable.

import { asCardId, type CardId } from "../../types/card-identity.ts";
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
 * Build a pool by combining tide decks: join the avatar's starter tide (its
 * signature cards) when present, draw a uniformly-random subset of 1..`maxFacetDraw`
 * of its facet tides and join them, then top the bag up with broad neutral tides
 * (and any remaining facets) until a full pool can be dealt; finally shuffle the
 * whole bag and deal `TIDES4.dealSize` copies with at most `TIDES4.cap` copies of
 * any card, seeding the starter's signature cards first so the signature tide is
 * always present in the dealt pool. The random facet subset is the variety engine — it is the analogue of
 * `sigseed`'s random signature subset, so a DreamAvatar leans its identity a
 * different way each run. A signatureless DreamAvatar (null starter) instead borrows
 * a random signatured DreamAvatar's pool, so it leans a different coherent archetype
 * each run. Tide-deck cards are keyed by cards_v2 UUID; the catalog index
 * (`poolData.cardNameById`) gates membership, so a UUID absent from it (a card
 * dropped from the catalog) is skipped. Without a `dreamAvatarId` or a baked tide
 * pool, every
 * tide is shuffled together (a robustness fallback; load-time validation requires an
 * entry per DreamAvatar).
 */
export function generateTides4(
  rng: () => number,
  poolData: PoolData,
  dreamAvatarId?: string,
): VariantResult {
  const data: Tides4DecksJson | undefined = poolData.tides4Decks;
  if (!data) {
    missingPoolData(
      "tides4",
      "no tide decks are bundled (data/tides4.jsonc, served as /tides4-data.json)",
    );
  }
  return combineTidesPool(rng, poolData, data, dreamAvatarId, "tides4");
}

/**
 * The shared runtime core both `tides4` and `tides5` use to combine the tide decks
 * in `data` into one pool. The two variants differ only in WHICH committed
 * artifact feeds this — their corpora are baked from different draft data
 * (`tides4` from every usable seat, `tides5` from only the known-good decklists) —
 * while the tide selection, the one shuffle, the deal, and the provenance below
 * are identical. `label` tags the generated pool's `selected` list with the
 * variant id that produced it.
 */
export function combineTidesPool(
  rng: () => number,
  poolData: PoolData,
  data: Tides4DecksJson,
  dreamAvatarId: string | undefined,
  label: string,
): VariantResult {
  const dealSize = TIDES4.dealSize;

  // Tide selection. Join the starter (when present), draw a random subset of the
  // facets, and queue the neutral tail plus any undrawn facets as fill. A missing
  // entry falls back to a shuffled draw over every tide so the variant still
  // produces a pool.
  const own = dreamAvatarId
    ? data.tidePoolByDreamAvatar[dreamAvatarId]
    : undefined;
  // A signatureless DreamAvatar (null starter) leans a random coherent archetype
  // each run, the way `sigseed` reduces to `pickcohere`: it borrows a random
  // signatured DreamAvatar's whole pool — that archetype's signature core plus its
  // own on-identity facets — so the pool is a single coherent archetype rather than
  // a blend of unrelated facet leans. The archetype draw consumes one `rng()` and
  // happens only for signatureless DreamAvatars, so a signatured DreamAvatar's draw
  // is unchanged.
  const signatureless = own !== undefined && own.starter === null;
  let entry = own;
  if (signatureless) {
    const archetypes = Object.values(data.tidePoolByDreamAvatar)
      .filter((e) => e.starter !== null)
      .sort((a, b) => ((a.starter ?? "") < (b.starter ?? "") ? -1 : 1));
    if (archetypes.length > 0) {
      entry = archetypes[Math.floor(rng() * archetypes.length)];
    }
  }
  const tideById = new Map(data.tides.map((t) => [t.id, t]));
  // The borrowed archetype's name (for a signatureless DreamAvatar): the name of
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
    // DreamAvatar): shuffle every tide together, tagging each by its own role.
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

  // The bag: every copy of every card in the joined tides, keyed by stable card
  // UUID ({@link CardId}) — in selection order, folding only as far as needed for
  // a full pool. `dealable` counts the copies the deal below can actually use
  // (the bag total minus copies beyond the per-card cap), so the pool keeps
  // joining tides until it reaches full size. A card whose UUID is absent from
  // the catalog index (a card removed from the catalog) is skipped; when no card
  // index is available (the synthetic pools some tests build) every card's UUID
  // is used directly.
  //
  // Every tide in the selection is also recorded for provenance — its full
  // decklist (as UUIDs) and why it was joined — even past the point the bag is
  // full, so the Pool Viewer can show each individual tide deck and the "Why
  // Cards" surface can attribute every pooled card to the tide it rode in on.
  // Folding stops at the same point as before, so the dealt pool is unchanged.
  const bag: CardId[] = [];
  const bagCounts = new Map<CardId, number>();
  let dealable = 0;
  const deckIds: string[] = [];
  const tides: Tides4PoolTide[] = [];
  // CardId -> joined tide ids that contain it, in join order. The first id is the
  // card's "home" (primary) tide.
  const containingTides = new Map<CardId, string[]>();
  // The card UUIDs of the always-joined signature tide(s) (selection `"starter"`).
  // These are guaranteed a slot in the dealt pool: the deal below seeds them
  // before filling the remainder, so the signature tide is never cut by the bag
  // overflow the way a facet or neutral card can be.
  const signatureCardIds = new Set<CardId>();
  const recordTide = (
    id: string,
    selection: Tides4PoolTideSelection,
    fold: boolean,
  ): void => {
    const tide = tideById.get(id);
    if (!tide) return;
    const cardIds: CardId[] = [];
    const seenInTide = new Set<CardId>();
    for (const card of tide.cards) {
      // Skip cards whose UUID is no longer in the catalog (the index, when
      // present, is the source of truth for catalog membership).
      if (poolData.cardNameById && !poolData.cardNameById.has(card.id)) continue;
      const cardId = asCardId(card.id);
      if (!seenInTide.has(cardId)) {
        seenInTide.add(cardId);
        cardIds.push(cardId);
      }
      if (!fold) continue;
      let homes = containingTides.get(cardId);
      if (homes === undefined) {
        homes = [];
        containingTides.set(cardId, homes);
      }
      if (!homes.includes(id)) homes.push(id);
      if (selection === "starter") signatureCardIds.add(cardId);
      for (let i = 0; i < card.copies; i += 1) {
        const have = bagCounts.get(cardId) ?? 0;
        bagCounts.set(cardId, have + 1);
        bag.push(cardId);
        if (have < TIDES4.cap) dealable += 1;
      }
    }
    if (fold) deckIds.push(id);
    tides.push({
      id,
      name: tide.name,
      displayName: tide.displayName,
      displayDescription: tide.displayDescription,
      role: tide.role,
      selection,
      joined: fold,
      cardIds,
      contributedCardCount: 0,
    });
  };
  for (const { id, selection } of joinSelections) {
    recordTide(id, selection, dealable < dealSize);
  }

  // One shuffle, two passes: every signature card is guaranteed at least one copy
  // in the dealt pool, then the remainder (including second copies of those
  // signature cards) is filled from the broader bag. Both passes walk the same
  // shuffled bag, so the copy cap and the ordering among same-priority cards are
  // unchanged from the single-deal version.
  //
  // Pass 1 seeds ONE copy of each distinct signature card. Because the deal stops
  // at `dealSize` and the bag carries more dealable copies than the pool holds, a
  // single shuffled deal would drop a slice of the signature tide along with
  // everything else. Guaranteeing one copy each — rather than dealing signature
  // cards straight to the copy cap — keeps the floor to the pool size: a signature
  // tide has well under `dealSize` distinct cards, so all of them fit with room to
  // spare, whereas seeding two copies each could exhaust the pool before every
  // distinct signature card was covered (many signature cards also ride in a facet
  // or neutral tide, so they reach two copies in the bag). Walking the shuffled bag
  // keeps the choice unbiased in the degenerate case where a signature tide has
  // more distinct cards than `dealSize`; in normal data every signature card is
  // dealt.
  //
  // Pass 2 fills the rest of the pool from the shuffled bag exactly as the single
  // deal did, dealing up to the copy cap; signature cards seeded in pass 1 can pick
  // up their second copy here, and cards already at the cap are skipped.
  shuffle(rng, bag);
  const counts = new Map<CardId, number>();
  let size = 0;
  for (const cardId of bag) {
    if (size >= dealSize) break;
    if (!signatureCardIds.has(cardId)) continue;
    if ((counts.get(cardId) ?? 0) >= 1) continue;
    counts.set(cardId, 1);
    size += 1;
  }
  for (const cardId of bag) {
    if (size >= dealSize) break;
    const have = counts.get(cardId) ?? 0;
    if (have >= TIDES4.cap) continue;
    counts.set(cardId, have + 1);
    size += 1;
  }

  // Per-card provenance over the dealt pool, plus each tide's contribution (the
  // pooled cards whose home tide is that one).
  const cardProvenanceById: Record<CardId, Tides4PoolCardProvenance> = {};
  const contributionByTide = new Map<string, number>();
  for (const [cardId, copies] of counts) {
    const homes = containingTides.get(cardId) ?? [];
    const primaryTideId = homes[0] ?? "";
    cardProvenanceById[cardId] = {
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
    dreamAvatarId: dreamAvatarId ?? "",
    signatureless,
    borrowedArchetypeName,
    dealSize,
    cap: TIDES4.cap,
    facetDrawnCount,
    facetAvailableCount,
    tides,
    cardProvenanceById,
  };

  // No color identity (this variant reads nothing but the tide decks); the labels
  // record the algorithm and the tide ids the pool was dealt from.
  return {
    C: new Set(),
    selected: [label, ...deckIds],
    counts,
    tides4Provenance,
  };
}

/** Strategy adapter for the `tides4` algorithm. */
export const tides4Strategy: PoolStrategy = {
  id: "tides4",
  description:
    "Combine preconstructed tides into a pool: the avatar's signature tide " +
    "plus a random subset of its theme (facet) tides, shuffled together and topped " +
    "up with broad tides. Reproduces sigseed's random-subset variety from readable " +
    "decks.",
  generate: ({ rng, poolData, dreamAvatarId }) =>
    generateTides4(rng, poolData, dreamAvatarId),
};
