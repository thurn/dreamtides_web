// The production `tides4` draft-pool algorithm. A player can be told it in one
// sentence:
//
//   "There are preconstructed decks called tides — each has a known decklist you
//    can go read. Your DreamAvatar has a small signature tide plus several theme
//    tides; we always include the signature tide, mix in a random few theme
//    tides, shuffle them together, and deal your draft pool, never more than 2
//    copies of a card."
//
// `tides4` bakes the axes of an avatar's identity as separate decks
// (`scripts/bake-tides4.mjs`, committed as
// `data/tides4.jsonc`, rendered as `docs/cards2/tides4_decklists.md`):
//   * a SIGNATURE tide is one signatured DreamAvatar's signature cards themselves
//     — the always-joined identity floor;
//   * a FACET tide is a single-anchor affinity pool — the coherent lean one
//     signature-region card grows into. Drawing a random few of an avatar's
//     facets each run makes different runs lean the same identity different ways;
//   * a NEUTRAL tide is a broad, format-spanning deck — the generic tail a
//     body of a signatureless DreamAvatar's pool.
//
// At runtime the whole algorithm is the tide selection, one shuffle, and the
// two-pass deal below: join the starter, draw a random subset of facets, top up
// with broad tides until a full pool is dealable, shuffle everything into one
// bag, and deal the configured number of copies at the configured per-card cap —
// seeding the starter's (signature) cards first so the signature tide is
// guaranteed into the pool rather than risking being cut by the bag overflow. A
// signatured
// DreamAvatar leans its own identity a different way each run (the facet subset).
// A signatureless DreamAvatar has no identity to anchor on, so it borrows a
// random signatured DreamAvatar's whole pool (that archetype's signature core plus
// its own facets), leaning toward a different coherent archetype each run rather
// than a blend of unrelated leans. The pool is keyed by cards_v2 UUID; the
// catalog index (`poolData.cardNameById`) gates which UUIDs are dealable.

import { asCardId, type CardId } from "../../types/card-identity.ts";
import { shuffle } from "./rng.ts";
import {
  missingPoolData,
  type PoolData,
  type Tides4PoolCardProvenance,
  type Tides4PoolProvenance,
  type Tides4PoolTide,
  type Tides4PoolTideSelection,
  type Tides4GenerationResult,
} from "./types.ts";
import type { Tides4DecksJson } from "./tides4-io.ts";
import type { Tides4Tuning } from "../../types/draft-data";
import { DEFAULT_DRAFT_DATA } from "../../data/draft-data";

/** Developer/test fallback; production injects the compiled draft.toml values. */
export const DEFAULT_TIDES4_TUNING: Tides4Tuning = DEFAULT_DRAFT_DATA.pool.tides4;

/**
 * Build a pool by combining tide decks: join the avatar's starter tide (its
 * signature cards) when present, draw a uniformly-random subset of facets
 * of its facet tides and join them, then top the bag up with broad neutral tides
 * (and any remaining facets) until a full pool can be dealt; finally shuffle the
 * whole bag and deal the configured size with at most the configured copies of
 * any card, seeding the starter's signature cards first so the signature tide is
 * always present in the dealt pool. The random facet subset is the variety engine,
 * so a DreamAvatar leans its identity a different way each run. A signatureless
 * DreamAvatar (null starter) instead borrows
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
  tuning: Tides4Tuning = DEFAULT_TIDES4_TUNING,
): Tides4GenerationResult {
  const data: Tides4DecksJson | undefined = poolData.tides4Decks;
  if (!data) {
    missingPoolData(
      "no tide decks are bundled (data/tides4.jsonc, served as /tides4-data.json)",
    );
  }
  return combineTidesPool(
    rng,
    poolData,
    data,
    dreamAvatarId,
    tuning,
  );
}

/**
 * Combine the committed tide decks into one pool and its provenance record.
 */
export function combineTidesPool(
  rng: () => number,
  poolData: PoolData,
  data: Tides4DecksJson,
  dreamAvatarId: string | undefined,
  tuning: Tides4Tuning = DEFAULT_TIDES4_TUNING,
): Tides4GenerationResult {
  const dealSize = tuning.dealSize;

  // Tide selection. Join the starter (when present), draw a random subset of the
  // facets, and queue the neutral tail plus any undrawn facets as fill. A missing
  // entry falls back to a shuffled draw over every tide so the variant still
  // produces a pool.
  const own = dreamAvatarId
    ? data.tidePoolByDreamAvatar[dreamAvatarId]
    : undefined;
  // A signatureless DreamAvatar (null starter) leans a random coherent archetype
  // each run by borrowing a random
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
    // Draw the random facet subset size first (uniform in
    // [1, min(maxFacets, facets)]), then take that
    // many from a shuffled copy of the facet list.
    const facets = shuffle(rng, [...entry.facets]);
    facetAvailableCount = facets.length;
    const hi = Math.max(1, Math.min(tuning.maxFacets, facets.length));
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
        if (have < tuning.copyCap) dealable += 1;
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
    if (have >= tuning.copyCap) continue;
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
    cap: tuning.copyCap,
    maxFacets: tuning.maxFacets,
    facetDrawnCount,
    facetAvailableCount,
    tides,
    cardProvenanceById,
  };

  return {
    counts,
    tideDeckIds: deckIds,
    selected: ["tides4", ...deckIds],
    tides4Provenance,
  };
}
