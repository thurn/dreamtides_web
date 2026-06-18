// Affiliation reweighting. Every non-starter dreamscape carries an
// `affiliationId` naming the thematic faction backing it (see
// `data/tabula/affiliations.toml`). When the player draws random card content
// inside an affiliated dreamscape — a draft offer, a shop's card slots, a Dream
// Augury reward card — the affiliation pulls the draw toward cards that fit its
// theme without ever removing any card from the running: every card keeps a
// strictly positive selection weight, so any card the dreamscape could offer can
// still appear (the doc's "any card can still appear" rule).
//
// The pull is computed with the SAME IDF / card-similarity machinery the draft
// pool generator uses (`src/draft/pool/variant-idf.ts`): the affiliation's
// curated `signatureCards` are treated as a synthetic "probe" deck, and each
// candidate card's affinity to the affiliation is how strongly the real corpus
// decks that hold that card cohere with the probe. A signature card sits in the
// decks most like the probe and scores high; an unrelated card sits in decks far
// from the probe and scores ~0. The affinity (0..1) is mapped to a multiplicative
// weight by the affiliation's `weightStrength`, and every multiplier is floored
// strictly above 0 so reweighting biases the draw without zeroing the pool.
//
// The IDF corpus is keyed by card NAME (the decklists are name arrays), while
// affiliation `signatureCards` and the draw sites both speak card UUIDs / card
// numbers. The helpers here translate between the two via the card database so
// the draw sites can multiply a `cardNumber -> multiplier` map straight into
// their existing per-card weights.

import type {
  AffiliationContent,
  DreamscapeContent,
} from "../types/content.ts";
import type { CardData } from "../types/cards.ts";
import type { DreamscapeNode } from "../types/quest.ts";
import { logEvent } from "../logging.ts";
import type { PoolData } from "../draft/pool/types.ts";
import {
  type IdfCorpus,
  type IdfDeck,
  idfCorpus,
  idfCosine,
} from "../draft/pool/variant-idf.ts";

/**
 * The smallest multiplier any card receives. Floored strictly above 0 so an
 * unaffiliated card is damped relative to a signature card but is never removed
 * from the draw — the doc guarantees any card can still appear.
 */
export const AFFILIATION_MIN_MULTIPLIER = 1;

/**
 * A reusable affiliation reweighting context built once per dreamscape draw. It
 * caches the run's IDF corpus, the per-card affinity to the affiliation probe,
 * and the card-name <-> card-number maps the draw sites need. Build it with
 * {@link buildAffiliationWeightContext} and hand the same context to every draw
 * inside one dreamscape so the corpus and probe are computed once.
 */
export interface AffiliationWeightContext {
  affiliation: AffiliationContent;
  /** Card name -> affinity (0..1) to the affiliation probe. */
  affinityByName: Map<string, number>;
  /** Card name -> card number, for translating a name affinity to a number. */
  numberByName: Map<string, number>;
  /** The signature card names that carried IDF weight in the corpus. */
  signatureWeightedNames: string[];
}

// Computes each corpus card's affinity (0..1) to the affiliation probe. The probe
// is the signature cards that exist in the corpus with positive IDF weight,
// treated as a synthetic deck so the standard IDF cosine applies (mirroring the
// idf3/idf4 signature probe). A card's RAW affinity is the greatest IDF cosine,
// over the corpus decks that contain it, of that deck to the probe — so a card
// that lives in decks shaped like the probe scores high whether or not it is a
// literal signature card. Affinities are normalized to [0,1] by the max observed
// so the strongest card is 1; cards absent from the corpus are simply omitted
// (callers treat a missing card as affinity 0).
function computeAffinityByName(
  corpus: IdfCorpus,
  signatureNames: readonly string[],
): { affinityByName: Map<string, number>; signatureWeightedNames: string[] } {
  const idfOf = (c: string): number => corpus.idf.get(c) ?? 0;

  const probeCards = new Set<string>();
  for (const name of signatureNames) {
    if (idfOf(name) > 0) probeCards.add(name);
  }
  const signatureWeightedNames = [...probeCards];

  const affinityByName = new Map<string, number>();
  if (probeCards.size === 0) {
    // No usable probe: every card is equally (un)affiliated. Returning an empty
    // map makes every multiplier fall back to the floor, a clean no-op draw.
    return { affinityByName, signatureWeightedNames };
  }

  let psq = 0;
  for (const c of probeCards) psq += idfOf(c) ** 2;
  const probe: IdfDeck = { cards: probeCards, norm: Math.sqrt(psq) || 1 };

  // Per-deck cosine to the probe, computed once.
  const deckSim = corpus.decks.map((d) => idfCosine(probe, d, idfOf));

  // raw(card) = max over decks holding it of that deck's cosine to the probe.
  const raw = new Map<string, number>();
  for (let i = 0; i < corpus.decks.length; i++) {
    const sim = deckSim[i];
    if (sim <= 0) continue;
    for (const c of corpus.decks[i].cards) {
      const prev = raw.get(c) ?? 0;
      if (sim > prev) raw.set(c, sim);
    }
  }

  let max = 0;
  for (const v of raw.values()) if (v > max) max = v;
  if (max > 0) {
    for (const [c, v] of raw) affinityByName.set(c, v / max);
  }
  return { affinityByName, signatureWeightedNames };
}

/**
 * Builds an {@link AffiliationWeightContext} for one affiliated dreamscape. Reuses
 * the run's cached IDF corpus (`idfCorpus`), so calling this per draw inside a
 * dreamscape is cheap. Returns `null` when the affiliation cannot bias the draw —
 * no usable decklist corpus, or none of its signature cards carry IDF weight — so
 * the caller cleanly skips reweighting and draws unbiased.
 */
export function buildAffiliationWeightContext(
  poolData: PoolData,
  cardDatabase: ReadonlyMap<number, CardData>,
  affiliation: AffiliationContent,
): AffiliationWeightContext | null {
  const corpus = idfCorpus(poolData);
  if (!corpus) return null;

  // Translate signature UUIDs -> current card names via the card database.
  const nameById = new Map<string, string>();
  const numberByName = new Map<string, number>();
  for (const card of cardDatabase.values()) {
    nameById.set(card.id, card.name);
    numberByName.set(card.name, card.cardNumber);
  }
  const signatureNames: string[] = [];
  for (const uuid of affiliation.signatureCards) {
    const name = nameById.get(uuid);
    if (name !== undefined) signatureNames.push(name);
  }

  const { affinityByName, signatureWeightedNames } = computeAffinityByName(
    corpus,
    signatureNames,
  );
  if (signatureWeightedNames.length === 0) return null;

  return {
    affiliation,
    affinityByName,
    numberByName,
    signatureWeightedNames,
  };
}

/**
 * The multiplicative selection weight for one card given an affiliation context.
 * Always a positive finite number `>= AFFILIATION_MIN_MULTIPLIER`: a card with
 * affinity 0 (or absent from the corpus) gets the floor, a signature-like card
 * gets up to `affiliation.weightStrength`. The map is
 * `floor + (weightStrength - floor) * affinity`, so the multiplier rises linearly
 * with affinity and a `weightStrength` of 1 is a clean no-op (every card 1).
 */
export function affiliationWeight(
  cardName: string,
  ctx: AffiliationWeightContext,
): number {
  const affinity = ctx.affinityByName.get(cardName) ?? 0;
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
 * Per-card multiplier for a list of candidate card names. Every candidate is a
 * key in the returned map with a strictly positive weight, so applying these
 * weights to a candidate list keeps every candidate selectable.
 */
export function reweightCandidates(
  cardNames: readonly string[],
  ctx: AffiliationWeightContext,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const name of cardNames) out.set(name, affiliationWeight(name, ctx));
  return out;
}

/**
 * The draw-site multiplier map: `cardNumber -> multiplier` for every card in the
 * database, so a sampler that works in card-number space can multiply the
 * affiliation weight straight into its existing per-card weights. Only cards with
 * affinity above the floor are stored; a missing card means "use 1" at the draw
 * site, which keeps the map small (one entry per affiliated card rather than per
 * card in the catalog).
 */
export function buildAffiliationNumberWeights(
  ctx: AffiliationWeightContext,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [name, affinity] of ctx.affinityByName) {
    if (affinity <= 0) continue;
    const cardNumber = ctx.numberByName.get(name);
    if (cardNumber === undefined) continue;
    out.set(cardNumber, affiliationWeight(name, ctx));
  }
  return out;
}

/**
 * Reconstruction logging for one affiliated draw (spec §8). Records the
 * affiliation, the signature cards that formed the probe, the highest-weighted
 * candidates with their weights, and the card that was ultimately picked, so the
 * draw can be reconstructed from `logs/quest-log.jsonl`.
 *
 * `drawSite` names the sampler ("draft_offer", "shop_stock", "dream_augury", ...);
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
    weight: affiliationWeight(card.name, ctx),
  }));
}
