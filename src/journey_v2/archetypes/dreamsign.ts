import type { AuguryRng } from "../signals/rng";
import type { DreamsignTemplate } from "../../types/content";
import type { AuguryContext, AuguryGameObject } from "../types";
import type { AuguryArchetypeBuilder, AuguryOfferDraft } from "./types";
import {
  augurySelectionPolicy,
  selectionMetadata,
  selectAuguryReward,
} from "./sharedSelection";
import { parseAuguryTargetKey } from "../../types/identifiers";

function dreamsignGameObject(template: DreamsignTemplate): AuguryGameObject {
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
export const dreamsignBuilder: AuguryArchetypeBuilder = {
  archetypeId: "dreamsign",
  family: "dreamsign",
  eligible(context: AuguryContext): boolean {
    return context.candidateDreamsigns.length > 0;
  },
  build(
    context: AuguryContext,
    _rng: AuguryRng,
  ): AuguryOfferDraft | null {
    const selection = selectAuguryReward({
      context,
      archetypeId: "dreamsign",
      mechanicId: "gain-dreamsign",
      policyId: augurySelectionPolicy(context, "dreamsign"),
    });
    const dreamsignId = selection?.bindings.dreamsignIds[0];
    const target =
      dreamsignId === undefined
        ? undefined
        : context.dreamsignTemplates.find(
            (template) => template.id === dreamsignId,
          );
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
      targetKey: parseAuguryTargetKey(target.id),
      ...selectionMetadata(selection),
    };
  },
};
