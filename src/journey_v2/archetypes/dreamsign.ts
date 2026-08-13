import type { MerchantRng } from "../signals/rng";
import type { DreamsignTemplate } from "../../types/content";
import type { MerchantContext, MerchantGameObject } from "../types";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";
import {
  augurySelectionPolicy,
  selectionMetadata,
  selectMerchantReward,
} from "./sharedSelection";

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
 * Candidates: unheld Dreamsigns. Ordinary affinity leads; rarity breaks ties.
 */
export const dreamsignBuilder: MerchantArchetypeBuilder = {
  archetypeId: "dreamsign",
  family: "dreamsign",
  eligible(context: MerchantContext): boolean {
    return context.candidateDreamsigns.length > 0;
  },
  build(context: MerchantContext, _rng: MerchantRng): MerchantOfferDraft | null {
    const selection = selectMerchantReward({
      context,
      archetypeId: "dreamsign",
      mechanicId: "gain-dreamsign",
      policyId: augurySelectionPolicy(context, "dreamsign"),
    });
    const dreamsignId = selection?.bindings.dreamsignIds[0];
    const target = dreamsignId === undefined
      ? undefined
      : context.dreamsignTemplates.find((template) => template.id === dreamsignId);
    if (selection === null || target === undefined) return null;

    return {
      archetypeId: "dreamsign",
      family: "dreamsign",
      gameObjects: [dreamsignGameObject(target)],
      applyPayload: {
        kind: "add_dreamsign",
        dreamsignId: target.id,
        dreamsignTemplate: target,
      },
      targetKey: target.id,
      ...selectionMetadata(selection),
    };
  },
};
