import { fitScores } from "../signals/fit";
import { multiplicityOf, qualityOf } from "../signals/corpus";
import { bandSample, type MerchantRng } from "../signals/rng";
import { MERCHANT_TUNING } from "../tuning";
import type {
  MerchantApplyPayload,
  MerchantChoiceCandidate,
  MerchantContext,
  MerchantCatalogCard,
} from "../types";
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
 * Same as `fit_card_draft`, additionally filtered to cards real decks run as
 * multiples (`multiplicityOf >= copiesMultiplicityMin`). Each chooser
 * candidate's payload is a composite of two `add_catalog_card` children, so the
 * accepted card enters the deck twice. Eligible when the filtered band holds
 * >= 4 cards.
 */
function copiesCandidatePool(
  context: MerchantContext,
): readonly MerchantCatalogCard[] {
  const corpus = context.merchantCorpus;
  if (corpus === undefined) return [];
  return grantCandidatePool(context).filter(
    (card) =>
      multiplicityOf(corpus, card.cardUuid) >= MERCHANT_TUNING.copiesMultiplicityMin,
  );
}

export const copiesDraftBuilder: MerchantArchetypeBuilder = {
  archetypeId: "copies_draft",
  family: "grant",
  eligible(context: MerchantContext): boolean {
    if (context.deckCards.length < MERCHANT_TUNING.minDeckForFit) return false;
    const pool = copiesCandidatePool(context);
    return bandSizeFor(pool.length, MERCHANT_TUNING.bandFraction) >= 4;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const pool = copiesCandidatePool(context);
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
