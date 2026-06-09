import { qualityOf } from "../signals/corpus";
import { bandSample, type MerchantRng } from "../signals/rng";
import { MERCHANT_TUNING } from "../tuning";
import type { MerchantContext, MerchantCatalogCard } from "../types";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";

function catalogGameObject(card: MerchantCatalogCard): MerchantCatalogCard {
  return card;
}

/**
 * `strong_card` — *Receive one named premium card.*
 *
 * Candidates: all non-starter pool cards (`candidateGrantCards`). Signal:
 * corpus quality. Band-sample 1 with the tight `strongBandFraction`. Always
 * eligible (a fresh deck still has a pool to draw from). Face-up.
 */
export const strongCardBuilder: MerchantArchetypeBuilder = {
  archetypeId: "strong_card",
  family: "grant",
  eligible(context: MerchantContext): boolean {
    return context.candidateGrantCards.length > 0;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const corpus = context.merchantCorpus;
    const sampled = bandSample(
      context.candidateGrantCards,
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
      applyPayload: {
        kind: "add_catalog_card",
        cardUuid: target.cardUuid,
        cardNumber: target.cardNumber,
      },
      targetKey: target.cardUuid,
    };
  },
};
