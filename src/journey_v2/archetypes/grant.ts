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
  eligibleTransfigurations,
} from "../../transfiguration/transfiguration-logic";
import type { TransfigurationType } from "../../types/quest";
import type {
  MerchantApplyPayload,
  MerchantChoiceCandidate,
  MerchantContext,
  MerchantCatalogCard,
} from "../types";
import { buildCategoryUniverse, type MerchantCategory } from "./categories";
import { transfigurationBenefit } from "./improve";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";

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
 * `strong_card` — *Receive one named premium card.*
 *
 * Candidates: non-starter pool cards the player does not own. Signal: corpus
 * quality. Band-sample 1 with the tight `strongBandFraction`. Always eligible
 * (a fresh deck still has a pool to draw from). Face-up.
 */
export const strongCardBuilder: MerchantArchetypeBuilder = {
  archetypeId: "strong_card",
  family: "grant",
  eligible(context: MerchantContext): boolean {
    return grantCandidatePool(context).length > 0;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const corpus = context.merchantCorpus;
    const pool = grantCandidatePool(context);
    const sampled = bandSample(
      pool,
      (card) => (corpus === undefined ? 0 : qualityOf(corpus, card.cardUuid)),
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
      summary: "A premium card for your deck.",
      gameObjects: [catalogGameObject(target)],
      hiddenUntilCommit: false,
      applyPayload: addCatalogCardPayload(target),
      targetKey: target.cardUuid,
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
      summary: "A card that fits your deck.",
      gameObjects: [catalogGameObject(target)],
      hiddenUntilCommit: false,
      applyPayload: addCatalogCardPayload(target),
      targetKey: target.cardUuid,
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
        "A card that fits your deck.",
      ),
    );

    return {
      archetypeId: "fit_card_draft",
      family: "grant",
      title: "Draft a card that fits your deck",
      summary: "Pick 1 of 4 cards that fit your deck.",
      gameObjects: [],
      hiddenUntilCommit: false,
      choiceRequest: {
        choiceType: "catalogCard",
        prompt: "Draft 1 of 4",
        candidates,
      },
      targetKey: sampled.map((card) => card.cardUuid).join(","),
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
): Map<string, number> {
  // Cold start: too few deck cards for fit to be meaningful, so rank on
  // quality alone — still surfaces strong doubling targets early.
  if (context.deckCards.length < MERCHANT_TUNING.minDeckForFit) {
    return qualityValueByUuid(context, pool);
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
  const result = new Map<string, number>();
  pool.forEach((card, i) => {
    result.set(card.cardUuid, fit * fitNorm[i] + quality * qualityNorm[i]);
  });
  return result;
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
    const scoreByUuid = copiesScoreByUuid(context, pool);
    const sampled = bandSample(
      pool,
      (card) => scoreByUuid.get(card.cardUuid) ?? 0,
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
        "Receive 2 copies of this card.",
      ),
    );

    return {
      archetypeId: "copies_draft",
      family: "grant",
      title: "Draft a card and receive 2 copies",
      summary: "Pick 1 of 4 cards; receive 2 copies of your pick.",
      gameObjects: [],
      hiddenUntilCommit: false,
      choiceRequest: {
        choiceType: "catalogCard",
        prompt: "Draft 1 of 4 (gain 2 copies)",
        candidates,
      },
      targetKey: sampled.map((card) => card.cardUuid).join(","),
    };
  },
};

/**
 * `premium_draft` — *Draft 1 of 4 exceptionally strong cards.*
 *
 * Candidates: non-starter, unowned pool cards. Signal:
 * `premiumBlend.quality * qualityNorm + premiumBlend.fit * fitNorm` (the fit
 * term is zero on an empty deck). Band-sample 4 with the tight
 * `premiumBandFraction`. Cards are hidden until commit; the offer sells on
 * strength alone. Eligible whenever the band holds >= 4 cards.
 */
function premiumScoreByUuid(
  context: MerchantContext,
  pool: readonly MerchantCatalogCard[],
): Map<string, number> {
  const corpus = context.merchantCorpus;
  const qualityRaw = pool.map((card) =>
    corpus === undefined ? 0 : qualityOf(corpus, card.cardUuid),
  );
  const fitByUuid = fitValueByUuid(context, pool);
  const fitRaw = pool.map((card) => fitByUuid.get(card.cardUuid) ?? 0);
  const qualityNorm = minMaxNormalize(qualityRaw);
  const fitNorm = minMaxNormalize(fitRaw);
  const { quality, fit } = MERCHANT_TUNING.premiumBlend;
  const result = new Map<string, number>();
  pool.forEach((card, i) => {
    result.set(card.cardUuid, quality * qualityNorm[i] + fit * fitNorm[i]);
  });
  return result;
}

export const premiumDraftBuilder: MerchantArchetypeBuilder = {
  archetypeId: "premium_draft",
  family: "grant",
  eligible(context: MerchantContext): boolean {
    const pool = grantCandidatePool(context);
    return bandSizeFor(pool.length, MERCHANT_TUNING.premiumBandFraction) >= 4;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const pool = grantCandidatePool(context);
    const scoreByUuid = premiumScoreByUuid(context, pool);
    const sampled = bandSample(
      pool,
      (card) => scoreByUuid.get(card.cardUuid) ?? 0,
      4,
      rng,
      { bandFraction: MERCHANT_TUNING.premiumBandFraction },
    );
    if (sampled.length < 4) return null;

    const candidates = sampled.map((card) =>
      catalogChoiceCandidate(
        card,
        addCatalogCardPayload(card),
        "An exceptionally strong card.",
      ),
    );

    return {
      archetypeId: "premium_draft",
      family: "grant",
      title: "Draft 1 of 4 exceptionally strong cards",
      summary: "Four of the strongest cards available.",
      gameObjects: [],
      hiddenUntilCommit: true,
      choiceRequest: {
        choiceType: "catalogCard",
        prompt: "Draft 1 of 4",
        candidates,
      },
      targetKey: sampled.map((card) => card.cardUuid).join(","),
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
 * (`categoryAffineWeight`), then fit-band-sample 4 cards within the category's
 * unowned pool members. The category is visible; the cards are hidden until
 * commit. Eligible when at least one category has >= `categoryMinPoolCards`
 * unowned candidate members.
 */
function categoryCandidatePool(
  context: MerchantContext,
  category: MerchantCategory,
): readonly MerchantCatalogCard[] {
  const memberSet = new Set(category.memberUuids);
  return grantCandidatePool(context).filter((card) =>
    memberSet.has(card.cardUuid),
  );
}

function offerableCategories(
  context: MerchantContext,
): readonly MerchantCategory[] {
  return buildCategoryUniverse(context).filter(
    (category) =>
      categoryCandidatePool(context, category).length >=
      MERCHANT_TUNING.categoryMinPoolCards,
  );
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
      4,
      rng,
    );
    if (sampled.length < 4) return null;

    const candidates = sampled.map((card) =>
      catalogChoiceCandidate(
        card,
        addCatalogCardPayload(card),
        `From the ${category.label} category.`,
      ),
    );

    return {
      archetypeId: "category_draft_known",
      family: "grant",
      title: `Draft a ${category.label}`,
      summary: `Pick 1 of 4 ${category.label} cards.`,
      gameObjects: [],
      hiddenUntilCommit: true,
      choiceRequest: {
        choiceType: "catalogCard",
        prompt: `Draft a ${category.label}`,
        candidates,
      },
      targetKey: `${category.id}:${sampled.map((card) => card.cardUuid).join(",")}`,
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
      summary: `A ${String(bundle.length)}-card bundle for your deck.`,
      gameObjects: bundle.map((card) => catalogGameObject(card)),
      hiddenUntilCommit: false,
      applyPayload: payload,
      targetKey: bundle.map((card) => card.cardUuid).join(","),
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
      const preview = applyTransfigurationToCard(card.card, transfiguration);
      choices.push({ card, transfiguration, preview });
    }
    if (choices.length < 4) return null;

    const candidates: MerchantChoiceCandidate[] = choices.map((choice) => ({
      choiceId: choice.card.cardUuid,
      title: `${choice.card.displayName} (${choice.transfiguration})`,
      summary: "Arrives already transfigured.",
      gameObjects: [
        {
          ...catalogGameObject(choice.card),
          card: choice.preview,
          badge: { label: choice.transfiguration },
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
      title: "Draft a pre-transfigured card",
      summary: "Pick 1 of 4 cards that arrive already transfigured.",
      gameObjects: [],
      hiddenUntilCommit: false,
      choiceRequest: {
        choiceType: "catalogCard",
        prompt: "Draft 1 of 4 (transfigured)",
        candidates,
      },
      targetKey: choices
        .map((choice) => `${choice.card.cardUuid}:${choice.transfiguration}`)
        .join(","),
    };
  },
};
