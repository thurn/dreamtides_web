// Affiliation reweighting. Every non-starter dreamscape carries an
// `affiliationId` naming the thematic faction backing it (see
// `data/tabula/affiliations.toml`). When the player draws random card content
// inside an affiliated dreamscape — a draft offer, a shop's card slots, an
// Augury reward card — the affiliation pulls the draw toward cards that fit its
// theme without ever removing any card from the running: every card keeps a
// strictly positive selection weight, so any card the dreamscape could offer can
// still appear (the doc's "any card can still appear" rule).
//
// The pull is computed with the shared IDF / card-similarity machinery: the affiliation's
// curated `signatureCards` are treated as a synthetic "probe" deck, and each
// candidate card's affinity to the affiliation is how strongly the real corpus
// decks that hold that card cohere with the probe. A signature card sits in the
// decks most like the probe and scores high; an unrelated card sits in decks far
// from the probe and scores ~0. The affinity (0..1) is mapped to a multiplicative
// weight by the affiliation's `weightStrength`: unaffiliated cards keep their base
// selection weight (multiplier 1) while affiliated cards receive a multiplier above 1,
// so every card stays selectable and affiliated cards simply appear more often.
//
// The IDF corpus is keyed by stable card UUID (the `decklistIds` source), and the
// affiliation `signatureCards` are themselves UUIDs, so the probe and the scoring
// stay in one key space — two distinct cards that share a display name stay
// distinct. The draw sites speak card numbers, so the helpers here translate the
// id-keyed affinity into a `cardNumber -> multiplier` map (via the card database)
// that a sampler can multiply straight into its existing per-card weights.

import type {
  AffiliationContent,
  DreamscapeContent,
} from "../types/content.ts";
import type { CardData } from "../types/cards.ts";
import type { DreamscapeNode } from "../types/journey.ts";
import { logEvent } from "../logging.ts";
import type { PoolData } from "../draft/pool/types.ts";
import {
  buildDecklistIdfCorpus,
  computeAffinity,
  type IdfCorpus,
} from "../draft/idf-fit.ts";

/**
 * The smallest multiplier any card receives. Unaffiliated cards keep their base
 * selection weight at this floor (multiplier 1) while affiliated cards receive
 * a multiplier above 1 — the doc guarantees any card can still appear.
 */
export const AFFILIATION_MIN_MULTIPLIER = 1;

/**
 * A reusable affiliation reweighting context built once per dreamscape draw. It
 * caches the run's IDF corpus, the per-card affinity to the affiliation probe,
 * and the card-id <-> card-number maps the draw sites need. Build it with
 * {@link buildAffiliationWeightContext} and hand the same context to every draw
 * inside one dreamscape so the corpus and probe are computed once.
 */
export interface AffiliationWeightContext {
  affiliation: AffiliationContent;
  /** Card UUID (lowercased) -> affinity (0..1) to the affiliation probe. */
  affinityById: Map<string, number>;
  /** Card UUID (lowercased) -> card number, for translating an id affinity to a number. */
  numberById: Map<string, number>;
  /** The signature card UUIDs (lowercased) that carried IDF weight in the corpus. */
  signatureWeightedIds: string[];
}

// Computes each corpus card's affinity (0..1) to the affiliation probe. The probe
// is the signature cards that exist in the corpus with positive IDF weight,
// treated as a synthetic deck so the standard IDF cosine applies (mirroring the
// shared signature probe). A card's RAW affinity is the greatest IDF cosine,
// over the corpus decks that contain it, of that deck to the probe — so a card
// that lives in decks shaped like the probe scores high whether or not it is a
// literal signature card. Affinities are normalized to [0,1] by the max observed
// so the strongest card is 1; cards absent from the corpus are simply omitted
// (callers treat a missing card as affinity 0). Keys are card UUIDs (the corpus's
// key space).
export function computeAffinityById(
  corpus: IdfCorpus,
  signatureIds: readonly string[],
): { affinityById: Map<string, number>; signatureWeightedIds: string[] } {
  // Filter to signature ids with idf > 0; these form the probe and are returned
  // so callers can report which signature cards carried IDF weight.
  const probeCards = new Set<string>();
  for (const id of signatureIds) {
    if ((corpus.idf.get(id) ?? 0) > 0) probeCards.add(id);
  }
  const signatureWeightedIds = [...probeCards];

  // Delegate the cosine/max/normalize core to the shared module.
  // computeAffinity handles the empty-probe case (returns empty map) and is
  // key-agnostic, so it scores in the corpus's UUID key space directly.
  const affinityById = computeAffinity(corpus, probeCards);
  return { affinityById, signatureWeightedIds };
}

/**
 * Builds an {@link AffiliationWeightContext} for one affiliated dreamscape. Reuses
 * the run's cached IDF corpus, but the per-card affinity computation (cosine over
 * all corpus decks) runs on each call — acceptable at the current corpus size.
 * Returns `null` when the affiliation cannot bias the draw — no usable decklist
 * corpus, or none of its signature cards carry IDF weight — so the caller cleanly
 * skips reweighting and draws unbiased.
 */
export function buildAffiliationWeightContext(
  poolData: PoolData,
  cardDatabase: ReadonlyMap<number, CardData>,
  affiliation: AffiliationContent,
): AffiliationWeightContext | null {
  const corpus = buildDecklistIdfCorpus(poolData);
  if (!corpus) return null;

  // Card UUID (lowercased) -> card number, the draw-site translation. Ids are
  // unique, so unlike a name index there is no collision to resolve.
  const numberById = new Map<string, number>();
  for (const card of cardDatabase.values()) {
    numberById.set(card.id.toLowerCase(), card.cardNumber);
  }

  // The affiliation's signature cards ARE UUIDs; score them directly against the
  // id-keyed corpus (lowercased to match the corpus key space).
  const signatureIds = affiliation.signatureCards.map((uuid) =>
    uuid.toLowerCase(),
  );

  const { affinityById, signatureWeightedIds } = computeAffinityById(
    corpus,
    signatureIds,
  );
  if (signatureWeightedIds.length === 0) return null;

  return {
    affiliation,
    affinityById,
    numberById,
    signatureWeightedIds,
  };
}

/**
 * The multiplicative selection weight for one card (by UUID) given an affiliation
 * context. Always a positive finite number `>= AFFILIATION_MIN_MULTIPLIER`: a card
 * with affinity 0 (or absent from the corpus) gets the floor, a signature-like card
 * gets up to `affiliation.weightStrength`. The map is
 * `floor + (weightStrength - floor) * affinity`, so the multiplier rises linearly
 * with affinity and a `weightStrength` of 1 is a clean no-op (every card 1).
 */
export function affiliationWeight(
  cardId: string,
  ctx: AffiliationWeightContext,
): number {
  const affinity = ctx.affinityById.get(cardId.toLowerCase()) ?? 0;
  const strength = Math.max(
    AFFILIATION_MIN_MULTIPLIER,
    ctx.affiliation.weightStrength,
  );
  const weight =
    AFFILIATION_MIN_MULTIPLIER +
    (strength - AFFILIATION_MIN_MULTIPLIER) * affinity;
  // Guard against any non-finite arithmetic so a draw is never zeroed.
  return Number.isFinite(weight) && weight > 0
    ? weight
    : AFFILIATION_MIN_MULTIPLIER;
}

/**
 * Per-card multiplier for a list of candidate card UUIDs. Every candidate is a
 * key in the returned map with a strictly positive weight, so applying these
 * weights to a candidate list keeps every candidate selectable.
 */
export function reweightCandidates(
  cardIds: readonly string[],
  ctx: AffiliationWeightContext,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of cardIds) out.set(id, affiliationWeight(id, ctx));
  return out;
}

/**
 * The draw-site multiplier map: `cardNumber -> multiplier` for every affiliated
 * card, so a sampler that works in card-number space can multiply the affiliation
 * weight straight into its existing per-card weights. Only cards with affinity
 * above the floor are stored; a missing card means "use 1" at the draw site, which
 * keeps the map small (one entry per affiliated card rather than per card in the
 * catalog).
 */
export function buildAffiliationNumberWeights(
  ctx: AffiliationWeightContext,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [id, affinity] of ctx.affinityById) {
    if (affinity <= 0) continue;
    const cardNumber = ctx.numberById.get(id);
    if (cardNumber === undefined) continue;
    out.set(cardNumber, affiliationWeight(id, ctx));
  }
  return out;
}

/**
 * Reconstruction logging for one affiliated draw (spec §8). Records the
 * affiliation, the signature cards that formed the probe, the highest-weighted
 * candidates with their weights, and the card that was ultimately picked, so the
 * draw can be reconstructed from `logs/journey-log.jsonl`.
 *
 * `drawSite` names the sampler ("draft_offer", "shop_stock", "augury", ...);
 * `candidateWeights` is the `cardNumber -> multiplier` map actually applied;
 * `picked` is the card number(s) the draw produced.
 */
export function logAffiliationDraw(args: {
  drawSite: string;
  affiliationId: string | undefined;
  candidateWeights: ReadonlyMap<number, number>;
  picked: readonly number[];
}): void {
  const { drawSite, affiliationId, candidateWeights, picked } = args;
  if (candidateWeights.size === 0) return;
  const topWeighted = [...candidateWeights.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 8)
    .map(([cardNumber, weight]) => ({
      cardNumber,
      weight: Number(weight.toFixed(4)),
    }));
  logEvent("affiliation_draw_reweighted", {
    drawSite,
    affiliationId: affiliationId ?? null,
    topWeightedCandidates: topWeighted,
    pickedCardNumbers: [...picked],
  });
}

/**
 * Resolves the affiliation that backs the dreamscape a node sits in, mapping the
 * node's `dreamscapeId` through the dreamscape definitions to an
 * {@link AffiliationContent}. Returns `null` when the node is unrevealed, its
 * dreamscape carries no `affiliationId` (a neutral / starter dreamscape), or the
 * affiliation id is unknown.
 */
export function resolveNodeAffiliation(
  node: DreamscapeNode | null | undefined,
  dreamscapes: readonly DreamscapeContent[],
  affiliations: readonly AffiliationContent[],
): AffiliationContent | null {
  const dreamscapeId = node?.dreamscapeId;
  if (dreamscapeId === null || dreamscapeId === undefined) return null;
  const dreamscape = dreamscapes.find((d) => d.id === dreamscapeId);
  const affiliationId = dreamscape?.affiliationId;
  if (affiliationId === null || affiliationId === undefined) return null;
  return affiliations.find((a) => a.id === affiliationId) ?? null;
}

/**
 * The draw-site `cardNumber -> multiplier` map for the dreamscape `node` sits in,
 * or `null` when the node is in a neutral dreamscape or the affiliation cannot be
 * scored (no usable corpus / probe). The one entry point a draw site needs: pass
 * the current node and the run content, multiply the returned map into the draw's
 * per-card weights, and a neutral dreamscape (or unscorable affiliation) draws
 * exactly as before.
 */
export function resolveNodeAffiliationWeights(
  node: DreamscapeNode | null | undefined,
  dreamscapes: readonly DreamscapeContent[],
  affiliations: readonly AffiliationContent[],
  poolData: PoolData | null | undefined,
  cardDatabase: ReadonlyMap<number, CardData>,
): { affiliation: AffiliationContent; weights: Map<number, number> } | null {
  if (!poolData) return null;
  const affiliation = resolveNodeAffiliation(node, dreamscapes, affiliations);
  if (affiliation === null) return null;
  const ctx = buildAffiliationWeightContext(poolData, cardDatabase, affiliation);
  if (ctx === null) return null;
  const weights = buildAffiliationNumberWeights(ctx);
  if (weights.size === 0) return null;
  return { affiliation, weights };
}

/**
 * A deck's affiliation fit: the mean affinity of its distinct cards to the
 * affiliation probe, in [0,1]. Cards absent from the corpus (or off-faction)
 * carry affinity 0 and pull the mean down, so a deck that genuinely belongs to
 * the affiliation scores high while a tight archetype from the wrong faction
 * scores low. Pure: the same deck and context always yield the same number.
 * Used by opponent construction's best-of-N selection and by the coherence
 * validation harness so both report the same affiliation-fit measure.
 *
 * @param deckCardNumbers The deck's card numbers (duplicates are collapsed).
 * @param ctx The affiliation weight context from
 *   {@link buildAffiliationWeightContext}.
 */
export function scoreDeckAffiliationFit(
  deckCardNumbers: readonly number[],
  ctx: AffiliationWeightContext,
): number {
  // Card number -> UUID, the inverse of the context's id->number map, so a deck
  // expressed in card numbers can be scored against the id-keyed affinity.
  const idByNumber = new Map<number, string>();
  for (const [id, num] of ctx.numberById) {
    if (!idByNumber.has(num)) idByNumber.set(num, id);
  }
  const distinct = new Set<number>();
  let sum = 0;
  let count = 0;
  for (const num of deckCardNumbers) {
    if (distinct.has(num)) continue;
    distinct.add(num);
    const id = idByNumber.get(num);
    sum += id === undefined ? 0 : ctx.affinityById.get(id) ?? 0;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

/**
 * Opponent-deck bias hook for Task 9. Given candidate cards for a generated
 * opponent deck and the dreamscape's affiliation, returns the same candidate list
 * paired with a positive multiplicative weight per candidate, biased toward the
 * affiliation by `opponentBiasStrength`. The bias never removes a candidate (every
 * weight is `>= AFFILIATION_MIN_MULTIPLIER`); Task 9 multiplies these into its own
 * deck-builder weighting. Returns the candidates with weight 1 when the
 * affiliation cannot be scored (no usable corpus / probe), so the caller can apply
 * the result unconditionally.
 */
export function opponentAffiliationBias(
  deckCandidates: readonly CardData[],
  affiliation: AffiliationContent,
  poolData: PoolData,
  cardDatabase: ReadonlyMap<number, CardData>,
): Array<{ card: CardData; weight: number }> {
  // Reuse the card-weight context, but swap `weightStrength` for the opponent
  // bias strength so the same affinity drives a deck-builder pull of its own
  // tuned magnitude.
  const ctx = buildAffiliationWeightContext(poolData, cardDatabase, {
    ...affiliation,
    weightStrength: affiliation.opponentBiasStrength,
  });
  if (ctx === null) {
    return deckCandidates.map((card) => ({ card, weight: 1 }));
  }
  return deckCandidates.map((card) => ({
    card,
    weight: affiliationWeight(card.id, ctx),
  }));
}
