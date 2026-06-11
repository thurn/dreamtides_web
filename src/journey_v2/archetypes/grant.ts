import { fitScores } from "../signals/fit";
import { qualityOf } from "../signals/corpus";
import {
  bandSample,
  merchantRng,
  weightedSample,
  type MerchantRng,
} from "../signals/rng";
import { MERCHANT_TUNING } from "../tuning";
import type { CardData } from "../../types/cards";
import {
  applyTransfigurationToCard,
  buildTransfigurationDisplay,
  eligibleTransfigurations,
  type CardTransfigurationDisplay,
} from "../../transfiguration/transfiguration-logic";
import type { TransfigurationType } from "../../types/quest";
import type {
  MerchantApplyPayload,
  MerchantChoiceCandidate,
  MerchantContext,
  MerchantCatalogCard,
} from "../types";
import {
  assembleOfferTrace,
  catalogTraceCandidates,
} from "../trace/buildTrace";
import type { MerchantOfferTrace } from "../trace/types";
import { buildCategoryUniverse, type MerchantCategory } from "./categories";
import { transfigurationBenefit } from "./improve";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";

/** A scored grant pool plus the per-card components and cold-start branch flag. */
interface ScoredGrantPool {
  scoreByUuid: Map<string, number>;
  componentsByUuid: Map<string, Record<string, number>>;
  coldStartQualityFallback: boolean;
}

/**
 * Assembles the shared `scored_cards` trace for the grant family — keyed by card
 * UUID, with each candidate's quality/fit components and the cold-start fallback
 * flag. Bounds large pools to the selected cards plus top runners-up.
 */
function grantScoredTrace(params: {
  pool: readonly MerchantCatalogCard[];
  scoreByUuid: ReadonlyMap<string, number>;
  componentsByUuid?: ReadonlyMap<string, Readonly<Record<string, number>>>;
  selectedUuids: readonly string[];
  selectedCount: number;
  bandFraction: number;
  bandMinimum?: number;
  coldStartQualityFallback?: boolean;
  blend?: Readonly<Record<string, number>>;
  notes?: readonly string[];
  /** Marks each candidate's draft-pool membership in the trace (`inDraftPool`). */
  draftPoolCardUuids?: ReadonlySet<string>;
}): MerchantOfferTrace {
  return assembleOfferTrace({
    decision: "scored_cards",
    keyKind: "cardUuid",
    candidates: catalogTraceCandidates(
      params.pool,
      params.scoreByUuid,
      params.componentsByUuid,
      params.draftPoolCardUuids,
    ),
    selectedKeys: params.selectedUuids,
    selectedCount: params.selectedCount,
    bandFraction: params.bandFraction,
    ...(params.bandMinimum === undefined
      ? {}
      : { bandMinimum: params.bandMinimum }),
    ...(params.coldStartQualityFallback === undefined
      ? {}
      : { coldStartQualityFallback: params.coldStartQualityFallback }),
    ...(params.blend === undefined ? {} : { blend: params.blend }),
    ...(params.notes === undefined ? {} : { notes: params.notes }),
  });
}

/** Components map carrying a single named component per candidate UUID. */
export function singleComponentByUuid(
  pool: readonly MerchantCatalogCard[],
  name: string,
  valueByUuid: ReadonlyMap<string, number>,
): Map<string, Record<string, number>> {
  const result = new Map<string, Record<string, number>>();
  for (const card of pool) {
    result.set(card.cardUuid, { [name]: valueByUuid.get(card.cardUuid) ?? 0 });
  }
  return result;
}

function catalogGameObject(card: MerchantCatalogCard): MerchantCatalogCard {
  return card;
}

/**
 * The shared grant candidate pool: non-starter pool cards
 * (`candidateGrantCards`) that the player does not already own.
 */
export function grantCandidatePool(
  context: MerchantContext,
): readonly MerchantCatalogCard[] {
  return context.candidateGrantCards.filter(
    (card) => !context.ownedCardUuids.has(card.cardUuid),
  );
}

/** Min-max normalize a list of numbers to [0, 1]; constant input maps to 0. */
function minMaxNormalize(values: readonly number[]): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) {
    return values.map(() => 0);
  }
  return values.map((v) => (v - min) / span);
}

/**
 * Returns a UUID-keyed fit value for each candidate against the current deck.
 * When no fit model is present, every candidate scores 0.
 */
function fitValueByUuid(
  context: MerchantContext,
  candidates: readonly MerchantCatalogCard[],
): Map<string, number> {
  const result = new Map<string, number>();
  const fitModel = context.fitModel;
  if (fitModel === undefined) {
    for (const card of candidates) result.set(card.cardUuid, 0);
    return result;
  }
  const deck = context.deckCards.map((deckCard) => deckCard.card);
  const scores = fitScores(
    candidates.map((card) => card.card),
    deck,
    fitModel,
  );
  for (const card of candidates) {
    result.set(card.cardUuid, scores.get(card.cardUuid)?.fit ?? 0);
  }
  return result;
}

function addCatalogCardPayload(card: MerchantCatalogCard): MerchantApplyPayload {
  return {
    kind: "add_catalog_card",
    cardUuid: card.cardUuid,
    cardNumber: card.cardNumber,
  };
}

function catalogChoiceCandidate(
  card: MerchantCatalogCard,
  payload: MerchantApplyPayload,
  summary: string,
): MerchantChoiceCandidate {
  return {
    choiceId: card.cardUuid,
    title: card.displayName,
    summary,
    gameObjects: [catalogGameObject(card)],
    applyPayload: payload,
    cardUuid: card.cardUuid,
    cardNumber: card.cardNumber,
  };
}

/**
 * Returns the band size for a candidate pool under a band fraction (mirrors
 * `bandSample`'s sizing so eligibility can require a full chooser).
 */
function bandSizeFor(poolSize: number, bandFraction: number): number {
  if (poolSize === 0) return 0;
  return Math.min(
    poolSize,
    Math.max(
      Math.ceil(bandFraction * poolSize),
      Math.min(MERCHANT_TUNING.bandMinimum, poolSize),
    ),
  );
}

/**
 * `strong_card` — *Receive one powerful card chosen with your deck in mind.*
 *
 * Candidates: non-starter pool cards the player does not own. Signal:
 * `strongBlend.quality * qualityNorm + strongBlend.fit * fitNorm`, so the card
 * is genuinely strong AND leans toward what the deck is building — a quality-only
 * signal happily handed an events deck a character bomb, which the fit term now
 * pulls down. Below `minDeckForFit` the deck is too small for fit to carry real
 * signal, so the blend falls back to quality alone (as `copies_draft` does)
 * rather than letting a popular off-archetype card ride in on prior-only fit.
 * Band-sample 1 with the tight `strongBandFraction`. Always eligible (a fresh
 * deck still has a pool to draw from). Face-up.
 */
function strongScoreByUuid(
  context: MerchantContext,
  pool: readonly MerchantCatalogCard[],
): ScoredGrantPool {
  // Cold start: below `minDeckForFit` the deck is too small for the fit model to
  // produce real signal (an empty deck collapses fit to global play-rate), so
  // blending it in would just smuggle a popular off-archetype bomb back into the
  // band. Rank on quality alone until the deck is large enough for fit to mean
  // something — matching `copies_draft` and the `card_bundle`/`transfigured_draft`
  // fit-or-quality fallback.
  if (context.deckCards.length < MERCHANT_TUNING.minDeckForFit) {
    const scoreByUuid = qualityValueByUuid(context, pool);
    return {
      scoreByUuid,
      componentsByUuid: singleComponentByUuid(pool, "quality", scoreByUuid),
      coldStartQualityFallback: true,
    };
  }
  const corpus = context.merchantCorpus;
  const qualityRaw = pool.map((card) =>
    corpus === undefined ? 0 : qualityOf(corpus, card.cardUuid),
  );
  const fitByUuid = fitValueByUuid(context, pool);
  const fitRaw = pool.map((card) => fitByUuid.get(card.cardUuid) ?? 0);
  const qualityNorm = minMaxNormalize(qualityRaw);
  const fitNorm = minMaxNormalize(fitRaw);
  const { quality, fit } = MERCHANT_TUNING.strongBlend;
  const scoreByUuid = new Map<string, number>();
  const componentsByUuid = new Map<string, Record<string, number>>();
  pool.forEach((card, i) => {
    scoreByUuid.set(card.cardUuid, quality * qualityNorm[i] + fit * fitNorm[i]);
    componentsByUuid.set(card.cardUuid, {
      quality: qualityNorm[i],
      fit: fitNorm[i],
    });
  });
  return { scoreByUuid, componentsByUuid, coldStartQualityFallback: false };
}

export const strongCardBuilder: MerchantArchetypeBuilder = {
  archetypeId: "strong_card",
  family: "grant",
  eligible(context: MerchantContext): boolean {
    return grantCandidatePool(context).length > 0;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const pool = grantCandidatePool(context);
    const scored = strongScoreByUuid(context, pool);
    const sampled = bandSample(
      pool,
      (card) => scored.scoreByUuid.get(card.cardUuid) ?? 0,
      1,
      rng,
      { bandFraction: MERCHANT_TUNING.strongBandFraction },
    );
    const target = sampled[0];
    if (target === undefined) return null;

    return {
      archetypeId: "strong_card",
      family: "grant",
      title: `Receive ${target.displayName}`,
      summary: "A powerful card, chosen with your deck in mind.",
      gameObjects: [catalogGameObject(target)],
      applyPayload: addCatalogCardPayload(target),
      targetKey: target.cardUuid,
      trace: grantScoredTrace({
        pool,
        draftPoolCardUuids: context.draftPoolCardUuids,
        scoreByUuid: scored.scoreByUuid,
        componentsByUuid: scored.componentsByUuid,
        selectedUuids: [target.cardUuid],
        selectedCount: 1,
        bandFraction: MERCHANT_TUNING.strongBandFraction,
        coldStartQualityFallback: scored.coldStartQualityFallback,
        blend: scored.coldStartQualityFallback
          ? undefined
          : MERCHANT_TUNING.strongBlend,
      }),
    };
  },
};

/**
 * `fit_card_grant` — *Receive one named card that fits your deck.*
 *
 * Candidates: non-starter, unowned pool cards. Signal: fit-model score against
 * the current deck. Band-sample 1. Face-up. Eligible when the deck has reached
 * `minDeckForFit` (below that, fit is mostly prior and `strong_card` covers the
 * same ground).
 */
export const fitCardGrantBuilder: MerchantArchetypeBuilder = {
  archetypeId: "fit_card_grant",
  family: "grant",
  eligible(context: MerchantContext): boolean {
    return (
      context.deckCards.length >= MERCHANT_TUNING.minDeckForFit &&
      grantCandidatePool(context).length > 0
    );
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const pool = grantCandidatePool(context);
    const fitByUuid = fitValueByUuid(context, pool);
    const sampled = bandSample(
      pool,
      (card) => fitByUuid.get(card.cardUuid) ?? 0,
      1,
      rng,
    );
    const target = sampled[0];
    if (target === undefined) return null;

    return {
      archetypeId: "fit_card_grant",
      family: "grant",
      title: `Receive ${target.displayName}`,
      summary: "A card chosen to fit your deck.",
      gameObjects: [catalogGameObject(target)],
      applyPayload: addCatalogCardPayload(target),
      targetKey: target.cardUuid,
      trace: grantScoredTrace({
        pool,
        draftPoolCardUuids: context.draftPoolCardUuids,
        scoreByUuid: fitByUuid,
        componentsByUuid: singleComponentByUuid(pool, "fit", fitByUuid),
        selectedUuids: [target.cardUuid],
        selectedCount: 1,
        bandFraction: MERCHANT_TUNING.bandFraction,
      }),
    };
  },
};

/**
 * `fit_card_draft` — *Draft 1 of 4 cards that fit your deck.*
 *
 * Same candidate pool and signal as `fit_card_grant`; band-sample 4 without
 * replacement as a face-up chooser. Eligible when the deck has reached
 * `minDeckForFit` and the band holds >= 4 cards.
 */
export const fitCardDraftBuilder: MerchantArchetypeBuilder = {
  archetypeId: "fit_card_draft",
  family: "grant",
  eligible(context: MerchantContext): boolean {
    if (context.deckCards.length < MERCHANT_TUNING.minDeckForFit) return false;
    const pool = grantCandidatePool(context);
    return bandSizeFor(pool.length, MERCHANT_TUNING.bandFraction) >= 4;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const pool = grantCandidatePool(context);
    const fitByUuid = fitValueByUuid(context, pool);
    const sampled = bandSample(
      pool,
      (card) => fitByUuid.get(card.cardUuid) ?? 0,
      4,
      rng,
    );
    if (sampled.length < 4) return null;

    const candidates = sampled.map((card) =>
      catalogChoiceCandidate(
        card,
        addCatalogCardPayload(card),
        "Chosen to fit your deck.",
      ),
    );

    return {
      archetypeId: "fit_card_draft",
      family: "grant",
      title: "Draft a card chosen for your deck",
      summary: "Four cards picked to fit your deck — choose one to keep.",
      gameObjects: [],
      choiceRequest: {
        choiceType: "catalogCard",
        prompt: "Pick 1 of these cards chosen to fit your deck",
        candidates,
      },
      targetKey: sampled.map((card) => card.cardUuid).join(","),
      trace: grantScoredTrace({
        pool,
        draftPoolCardUuids: context.draftPoolCardUuids,
        scoreByUuid: fitByUuid,
        componentsByUuid: singleComponentByUuid(pool, "fit", fitByUuid),
        selectedUuids: sampled.map((card) => card.cardUuid),
        selectedCount: sampled.length,
        bandFraction: MERCHANT_TUNING.bandFraction,
      }),
    };
  },
};

/**
 * `copies_draft` — *Draft 1 of 4 cards; receive 2 copies of your pick.*
 *
 * Candidates: non-starter, unowned pool cards (the shared grant pool). Signal:
 * `copiesBlend.fit * fitNorm + copiesBlend.quality * qualityNorm`, so the
 * doubled card is both a deck fit and genuinely strong. Below `minDeckForFit`
 * the deck is too small for fit to be meaningful, so the signal falls back to
 * corpus quality alone (as `card_bundle` does for its seed). Each chooser
 * candidate's payload is a composite of two `add_catalog_card` children, so the
 * accepted card enters the deck twice. Eligible when the band holds >= 4 cards.
 */
function copiesScoreByUuid(
  context: MerchantContext,
  pool: readonly MerchantCatalogCard[],
): ScoredGrantPool {
  // Cold start: too few deck cards for fit to be meaningful, so rank on
  // quality alone — still surfaces strong doubling targets early.
  if (context.deckCards.length < MERCHANT_TUNING.minDeckForFit) {
    const scoreByUuid = qualityValueByUuid(context, pool);
    return {
      scoreByUuid,
      componentsByUuid: singleComponentByUuid(pool, "quality", scoreByUuid),
      coldStartQualityFallback: true,
    };
  }
  const fitByUuid = fitValueByUuid(context, pool);
  const fitRaw = pool.map((card) => fitByUuid.get(card.cardUuid) ?? 0);
  const corpus = context.merchantCorpus;
  const qualityRaw = pool.map((card) =>
    corpus === undefined ? 0 : qualityOf(corpus, card.cardUuid),
  );
  const fitNorm = minMaxNormalize(fitRaw);
  const qualityNorm = minMaxNormalize(qualityRaw);
  const { fit, quality } = MERCHANT_TUNING.copiesBlend;
  const scoreByUuid = new Map<string, number>();
  const componentsByUuid = new Map<string, Record<string, number>>();
  pool.forEach((card, i) => {
    scoreByUuid.set(card.cardUuid, fit * fitNorm[i] + quality * qualityNorm[i]);
    componentsByUuid.set(card.cardUuid, { fit: fitNorm[i], quality: qualityNorm[i] });
  });
  return { scoreByUuid, componentsByUuid, coldStartQualityFallback: false };
}

export const copiesDraftBuilder: MerchantArchetypeBuilder = {
  archetypeId: "copies_draft",
  family: "grant",
  eligible(context: MerchantContext): boolean {
    const pool = grantCandidatePool(context);
    return bandSizeFor(pool.length, MERCHANT_TUNING.bandFraction) >= 4;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const pool = grantCandidatePool(context);
    const scored = copiesScoreByUuid(context, pool);
    const sampled = bandSample(
      pool,
      (card) => scored.scoreByUuid.get(card.cardUuid) ?? 0,
      4,
      rng,
    );
    if (sampled.length < 4) return null;

    const candidates = sampled.map((card) =>
      catalogChoiceCandidate(
        card,
        {
          kind: "composite",
          children: [addCatalogCardPayload(card), addCatalogCardPayload(card)],
        },
        "Chosen for your deck — you receive 2 copies.",
      ),
    );

    return {
      archetypeId: "copies_draft",
      family: "grant",
      title: "Draft a card, doubled",
      summary:
        "Four strong fits for your deck — keep two copies of your pick.",
      gameObjects: [],
      choiceRequest: {
        choiceType: "catalogCard",
        prompt: "Pick 1 — you keep two copies",
        candidates,
      },
      targetKey: sampled.map((card) => card.cardUuid).join(","),
      trace: grantScoredTrace({
        pool,
        draftPoolCardUuids: context.draftPoolCardUuids,
        scoreByUuid: scored.scoreByUuid,
        componentsByUuid: scored.componentsByUuid,
        selectedUuids: sampled.map((card) => card.cardUuid),
        selectedCount: sampled.length,
        bandFraction: MERCHANT_TUNING.bandFraction,
        coldStartQualityFallback: scored.coldStartQualityFallback,
        blend: scored.coldStartQualityFallback
          ? undefined
          : MERCHANT_TUNING.copiesBlend,
      }),
    };
  },
};

/**
 * Quality value [0,1] for each candidate, used as the cold-start signal before
 * the deck is large enough for fit to be meaningful.
 */
function qualityValueByUuid(
  context: MerchantContext,
  candidates: readonly MerchantCatalogCard[],
): Map<string, number> {
  const corpus = context.merchantCorpus;
  const result = new Map<string, number>();
  for (const card of candidates) {
    result.set(card.cardUuid, corpus === undefined ? 0 : qualityOf(corpus, card.cardUuid));
  }
  return result;
}

/**
 * The grant family's standard "fit, or quality when the deck is too small for
 * fit to be meaningful" signal (deck < `minDeckForFit`). Used by `card_bundle`
 * and `transfigured_draft`.
 */
function fitOrQualityByUuid(
  context: MerchantContext,
  candidates: readonly MerchantCatalogCard[],
): Map<string, number> {
  if (context.deckCards.length < MERCHANT_TUNING.minDeckForFit) {
    return qualityValueByUuid(context, candidates);
  }
  return fitValueByUuid(context, candidates);
}

/**
 * `category_draft_known` — *"Draft a Warrior" / "Draft a cheap card" / "Draft
 * from the Skull Weaver package" — pick 1 of 4.*
 *
 * Sampling: build the category universe, weighted-sample one category with 75%
 * weight on deck-affine categories and 25% on the full universe
 * (`categoryAffineWeight`), then fit-band-sample `categoryDraftSize` cards within
 * the category's unowned pool members. A face-up chooser: both the category and
 * the four cards are shown, so the player drafts the best fit for their deck.
 * Eligible when at least one category can fill the chooser entirely from the
 * player's own draft pool.
 */
function categoryCandidatePool(
  context: MerchantContext,
  category: MerchantCategory,
): readonly MerchantCatalogCard[] {
  const memberSet = new Set(category.memberUuids);
  const draftPool = context.draftPoolCardUuids;
  // Only offer cards the player could actually draft this game: every candidate
  // must be both a category member and present in the resolved draft pool. (When
  // no draft pool has been resolved the set is empty and no category qualifies,
  // so the merchant simply does not roll a category draft.)
  return grantCandidatePool(context).filter(
    (card) => memberSet.has(card.cardUuid) && draftPool.has(card.cardUuid),
  );
}

function offerableCategories(
  context: MerchantContext,
): readonly MerchantCategory[] {
  return buildCategoryUniverse(context).filter(
    (category) =>
      categoryCandidatePool(context, category).length >=
      MERCHANT_TUNING.categoryDraftSize,
  );
}

/** "a" / "an" for a category label, so titles read "Draft an Event". */
function indefiniteArticle(label: string): "a" | "an" {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

export const categoryDraftKnownBuilder: MerchantArchetypeBuilder = {
  archetypeId: "category_draft_known",
  family: "grant",
  eligible(context: MerchantContext): boolean {
    return offerableCategories(context).length > 0;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const categories = offerableCategories(context);
    if (categories.length === 0) return null;
    const category = weightedSample(
      categories,
      (candidate) =>
        candidate.deckAffine
          ? MERCHANT_TUNING.categoryAffineWeight
          : 1 - MERCHANT_TUNING.categoryAffineWeight,
      rng,
    );
    if (category === null) return null;

    const pool = categoryCandidatePool(context, category);
    const fitByUuid = fitValueByUuid(context, pool);
    const sampled = bandSample(
      pool,
      (card) => fitByUuid.get(card.cardUuid) ?? 0,
      MERCHANT_TUNING.categoryDraftSize,
      rng,
    );
    if (sampled.length < MERCHANT_TUNING.categoryDraftSize) return null;

    const candidates = sampled.map((card) =>
      catalogChoiceCandidate(
        card,
        addCatalogCardPayload(card),
        `A ${category.label}, chosen for your deck.`,
      ),
    );

    return {
      archetypeId: "category_draft_known",
      family: "grant",
      title: `Draft ${indefiniteArticle(category.label)} ${category.label}`,
      summary: `Four ${category.label} cards picked for your deck — choose one.`,
      gameObjects: [],
      choiceRequest: {
        choiceType: "catalogCard",
        prompt: `Pick 1 of these ${category.label} cards`,
        candidates,
      },
      targetKey: `${category.id}:${sampled.map((card) => card.cardUuid).join(",")}`,
      trace: grantScoredTrace({
        pool,
        draftPoolCardUuids: context.draftPoolCardUuids,
        scoreByUuid: fitByUuid,
        componentsByUuid: singleComponentByUuid(pool, "fit", fitByUuid),
        selectedUuids: sampled.map((card) => card.cardUuid),
        selectedCount: sampled.length,
        bandFraction: MERCHANT_TUNING.bandFraction,
        notes: [
          // Every candidate is drawn from the player's resolved draft pool; each
          // trace candidate also carries `inDraftPool` (always true here).
          "candidateSource=draftPool",
          `draftPoolSize=${String(context.draftPoolCardUuids.size)}`,
          `category=${category.id}`,
          `categoryDeckAffine=${String(category.deckAffine)}`,
          `categoryWeight=${String(
            category.deckAffine
              ? MERCHANT_TUNING.categoryAffineWeight
              : 1 - MERCHANT_TUNING.categoryAffineWeight,
          )}`,
          `offerableCategories=${String(categories.length)}`,
          // Why this category and not another: every offerable category with its
          // draft-pool depth (`*` marks deck-affine categories, weighted higher).
          `offerableCategoryPool=${categories
            .map(
              (candidate) =>
                `${candidate.id}:${String(
                  categoryCandidatePool(context, candidate).length,
                )}${candidate.deckAffine ? "*" : ""}`,
            )
            .join("|")}`,
        ],
      }),
    };
  },
};

/**
 * `card_bundle` — *Gain 2–3 cards that work together and with your deck.*
 *
 * Seeds from the fit band (quality band when deck < `minDeckForFit`), then grows
 * 1–2 more cards, each sampled from the top 5 by `bundleBlend` over
 * (cooccur-with-seed, mean-cooccur-with-bundle, fit). The co-occurrence terms
 * reuse `fitScores`'s raw `cooccur` component (coocNorm-based) by scoring the
 * remaining pool against a synthetic deck of the seed / the growing bundle. All
 * bundle cards are granted on accept via a composite payload. Face-up. Always
 * eligible (a non-empty grant pool yields at least the seed).
 */
function cooccurByUuid(
  context: MerchantContext,
  candidates: readonly MerchantCatalogCard[],
  partnerCards: readonly CardData[],
): Map<string, number> {
  const result = new Map<string, number>();
  const fitModel = context.fitModel;
  if (fitModel === undefined || partnerCards.length === 0) {
    for (const card of candidates) result.set(card.cardUuid, 0);
    return result;
  }
  const scores = fitScores(
    candidates.map((card) => card.card),
    partnerCards,
    fitModel,
  );
  for (const card of candidates) {
    result.set(card.cardUuid, scores.get(card.cardUuid)?.cooccur ?? 0);
  }
  return result;
}

export const cardBundleBuilder: MerchantArchetypeBuilder = {
  archetypeId: "card_bundle",
  family: "grant",
  eligible(context: MerchantContext): boolean {
    return grantCandidatePool(context).length > 0;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const pool = grantCandidatePool(context);
    if (pool.length === 0) return null;

    const coldStart = context.deckCards.length < MERCHANT_TUNING.minDeckForFit;
    const seedSignal = fitOrQualityByUuid(context, pool);
    const seedSampled = bandSample(
      pool,
      (card) => seedSignal.get(card.cardUuid) ?? 0,
      1,
      rng,
    );
    const seed = seedSampled[0];
    if (seed === undefined) return null;

    // Seeded 2 or 3 total cards.
    const bundleSize = 1 + (rng() < 0.5 ? 1 : 2);
    const bundle: MerchantCatalogCard[] = [seed];
    const chosen = new Set<string>([seed.cardUuid]);
    const fitByUuid = fitValueByUuid(context, pool);

    let step = 0;
    while (bundle.length < bundleSize) {
      const remaining = pool.filter((card) => !chosen.has(card.cardUuid));
      if (remaining.length === 0) break;
      const cooccurSeed = cooccurByUuid(context, remaining, [seed.card]);
      const cooccurBundle = cooccurByUuid(
        context,
        remaining,
        bundle.map((card) => card.card),
      );
      const blend = MERCHANT_TUNING.bundleBlend;
      const stepRng = merchantRng(seed.cardUuid, "bundle-grow", String(step));
      // Top-5 by the blended grow score, sampled within (bandMinimum = 5).
      const grown = bandSample(
        remaining,
        (card) =>
          blend.seed * (cooccurSeed.get(card.cardUuid) ?? 0) +
          blend.bundle * (cooccurBundle.get(card.cardUuid) ?? 0) +
          blend.fit * (fitByUuid.get(card.cardUuid) ?? 0),
        1,
        stepRng,
        { bandFraction: 0, bandMinimum: 5 },
      );
      const next = grown[0];
      if (next === undefined) break;
      bundle.push(next);
      chosen.add(next.cardUuid);
      step += 1;
    }

    const payload: MerchantApplyPayload = {
      kind: "composite",
      children: bundle.map((card) => addCatalogCardPayload(card)),
    };

    return {
      archetypeId: "card_bundle",
      family: "grant",
      title: `Gain ${String(bundle.length)} cards that work together`,
      summary: `A ${String(bundle.length)}-card bundle chosen to work together and with your deck.`,
      gameObjects: bundle.map((card) => catalogGameObject(card)),
      applyPayload: payload,
      targetKey: bundle.map((card) => card.cardUuid).join(","),
      // The trace explains the SEED pick (scored over the grant pool by
      // fit/quality). The grown cards are sampled by a separate co-occurrence
      // blend against the seed/bundle, recorded here as notes since they came
      // from a different band per grow step.
      trace: grantScoredTrace({
        pool,
        draftPoolCardUuids: context.draftPoolCardUuids,
        scoreByUuid: seedSignal,
        componentsByUuid: singleComponentByUuid(
          pool,
          coldStart ? "quality" : "fit",
          seedSignal,
        ),
        selectedUuids: [seed.cardUuid],
        selectedCount: 1,
        bandFraction: MERCHANT_TUNING.bandFraction,
        coldStartQualityFallback: coldStart,
        blend: MERCHANT_TUNING.bundleBlend,
        notes: [
          `bundleSize=${String(bundle.length)}`,
          `seed=${seed.cardUuid}`,
          `grown=${bundle
            .slice(1)
            .map((card) => card.cardUuid)
            .join(",")}`,
          "growScore=bundleBlend over (cooccurSeed, cooccurBundle, fit)",
        ],
      }),
    };
  },
};

/**
 * `transfigured_draft` — *Draft 1 of 4 cards that arrive already transfigured.*
 *
 * Candidates: non-starter, unowned pool cards with at least one eligible
 * transfiguration; signal: fit (quality when deck < `minDeckForFit`).
 * Band-sample 4. Each candidate is paired with its highest-benefit eligible
 * transfiguration and a preview via `applyTransfigurationToCard`; the granted
 * card enters the deck pre-transfigured through the `add_catalog_card` payload's
 * optional `transfiguration` field. Face-up chooser. Eligible when the band
 * holds >= 4 such cards.
 */
interface TransfiguredChoice {
  card: MerchantCatalogCard;
  transfiguration: TransfigurationType;
  preview: CardData;
  display: CardTransfigurationDisplay;
}

function bestTransfiguration(card: CardData): TransfigurationType | null {
  const eligible = eligibleTransfigurations(card);
  let best: TransfigurationType | null = null;
  let bestBenefit = -Infinity;
  for (const transfiguration of eligible) {
    const preview = applyTransfigurationToCard(card, transfiguration);
    const benefit = transfigurationBenefit(card, transfiguration, preview);
    if (benefit > bestBenefit) {
      bestBenefit = benefit;
      best = transfiguration;
    }
  }
  return best;
}

function transfigurableCandidates(
  context: MerchantContext,
): readonly MerchantCatalogCard[] {
  return grantCandidatePool(context).filter(
    (card) => eligibleTransfigurations(card.card).length > 0,
  );
}

export const transfiguredDraftBuilder: MerchantArchetypeBuilder = {
  archetypeId: "transfigured_draft",
  family: "grant",
  eligible(context: MerchantContext): boolean {
    const pool = transfigurableCandidates(context);
    return bandSizeFor(pool.length, MERCHANT_TUNING.bandFraction) >= 4;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const pool = transfigurableCandidates(context);
    const coldStart = context.deckCards.length < MERCHANT_TUNING.minDeckForFit;
    const signal = fitOrQualityByUuid(context, pool);
    const sampled = bandSample(
      pool,
      (card) => signal.get(card.cardUuid) ?? 0,
      4,
      rng,
    );
    if (sampled.length < 4) return null;

    const choices: TransfiguredChoice[] = [];
    for (const card of sampled) {
      const transfiguration = bestTransfiguration(card.card);
      if (transfiguration === null) continue;
      const built = buildTransfigurationDisplay(card.card, transfiguration);
      choices.push({
        card,
        transfiguration,
        preview: built.card,
        display: built.display,
      });
    }
    if (choices.length < 4) return null;

    const candidates: MerchantChoiceCandidate[] = choices.map((choice) => ({
      choiceId: choice.card.cardUuid,
      title: `${choice.card.displayName} (${choice.transfiguration})`,
      summary: `Arrives already ${choice.transfiguration} — chosen for your deck.`,
      gameObjects: [
        {
          ...catalogGameObject(choice.card),
          card: choice.preview,
          badge: { label: choice.transfiguration },
          transfiguration: choice.display,
        },
      ],
      applyPayload: {
        kind: "add_catalog_card",
        cardUuid: choice.card.cardUuid,
        cardNumber: choice.card.cardNumber,
        transfiguration: choice.transfiguration,
      },
      cardUuid: choice.card.cardUuid,
      cardNumber: choice.card.cardNumber,
    }));

    return {
      archetypeId: "transfigured_draft",
      family: "grant",
      title: "Draft a transfigured card",
      summary:
        "Four cards picked for your deck, each arriving already transfigured — choose one.",
      gameObjects: [],
      choiceRequest: {
        choiceType: "catalogCard",
        prompt: "Pick 1 of these transfigured cards",
        candidates,
      },
      targetKey: choices
        .map((choice) => `${choice.card.cardUuid}:${choice.transfiguration}`)
        .join(","),
      trace: grantScoredTrace({
        pool,
        draftPoolCardUuids: context.draftPoolCardUuids,
        scoreByUuid: signal,
        componentsByUuid: singleComponentByUuid(
          pool,
          coldStart ? "quality" : "fit",
          signal,
        ),
        selectedUuids: choices.map((choice) => choice.card.cardUuid),
        selectedCount: choices.length,
        bandFraction: MERCHANT_TUNING.bandFraction,
        coldStartQualityFallback: coldStart,
        notes: choices.map(
          (choice) => `${choice.card.cardUuid}:${choice.transfiguration}`,
        ),
      }),
    };
  },
};
