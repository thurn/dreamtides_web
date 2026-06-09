import { dreamsignMatchScore } from "../signals/dreamsignMatch";
import { bandSample, type MerchantRng } from "../signals/rng";
import { MERCHANT_TUNING } from "../tuning";
import type { CardData } from "../../types/cards";
import type { DreamsignTemplate } from "../../types/content";
import type { MerchantContext, MerchantGameObject } from "../types";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";

function deckCardData(context: MerchantContext): readonly CardData[] {
  return context.deckCards.map((deckCard) => deckCard.card);
}

function dreamsignGameObject(template: DreamsignTemplate): MerchantGameObject {
  return {
    objectType: "dreamsign",
    dreamsignId: template.id,
    dreamsignTemplate: template,
    displayName: template.name,
  };
}

/**
 * `dreamsign` — *Gain a dreamsign suited to your deck.*
 *
 * Candidates: unheld dreamsigns (`candidateDreamsigns`). Signal: profile match
 * score against the deck. Band-sample 1 with the loose `dreamsignBandFraction`
 * (the population is small). Face-up. Eligible while >= 1 unheld dreamsign
 * exists.
 */
export const dreamsignBuilder: MerchantArchetypeBuilder = {
  archetypeId: "dreamsign",
  family: "dreamsign",
  eligible(context: MerchantContext): boolean {
    return context.candidateDreamsigns.length > 0;
  },
  build(context: MerchantContext, rng: MerchantRng): MerchantOfferDraft | null {
    const deck = deckCardData(context);
    const profiles = context.dreamsignProfiles;
    const sampled = bandSample(
      context.candidateDreamsigns,
      (template) =>
        dreamsignMatchScore(profiles?.get(template.id), deck),
      1,
      rng,
      { bandFraction: MERCHANT_TUNING.dreamsignBandFraction },
    );
    const target = sampled[0];
    if (target === undefined) return null;

    return {
      archetypeId: "dreamsign",
      family: "dreamsign",
      title: `Gain the ${target.name} dreamsign`,
      summary: "A dreamsign suited to your deck.",
      gameObjects: [dreamsignGameObject(target)],
      hiddenUntilCommit: false,
      applyPayload: {
        kind: "add_dreamsign",
        dreamsignId: target.id,
        dreamsignTemplate: target,
      },
      targetKey: target.id,
    };
  },
};
