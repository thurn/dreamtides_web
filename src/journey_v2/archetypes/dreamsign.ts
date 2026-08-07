import type { MerchantRng } from "../signals/rng";
import { auguryArchetype } from "../../data/augury-data";
import type { DreamsignTemplate } from "../../types/content";
import type { MerchantContext, MerchantGameObject } from "../types";
import type { MerchantArchetypeBuilder, MerchantChoiceCandidateDraft, MerchantOfferDraft } from "./types";
import {
  augurySelectionPolicy,
  selectionMetadata,
  selectMerchantCount,
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

/**
 * `dreamsign_draft` — *Pick 1 of 2–4 dreamsigns.*
 *
 * Same candidates and signal as `dreamsign`; band-sample 2–4 dreamsigns
 * (count seeded, capped by band size) as a face-up chooser. Eligible while
 * >= 2 unheld dreamsigns exist.
 */
export const dreamsignDraftBuilder: MerchantArchetypeBuilder = {
  archetypeId: "dreamsign_draft",
  family: "dreamsign",
  eligible(context: MerchantContext): boolean {
    const minimum = auguryArchetype(
      context.rewardSelection.content.auguryData,
      "dreamsign_draft",
    ).quantities.minimumChooserSize;
    return context.candidateDreamsigns.length >= minimum;
  },
  build(context: MerchantContext, _rng: MerchantRng): MerchantOfferDraft | null {
    const quantities = auguryArchetype(
      context.rewardSelection.content.auguryData,
      "dreamsign_draft",
    ).quantities;
    const maximum = Math.min(
      quantities.maximumChooserSize,
      context.candidateDreamsigns.length,
    );
    if (maximum < quantities.minimumChooserSize) return null;
    const policyId = augurySelectionPolicy(context, "dreamsign_draft");
    const count = selectMerchantCount({
      context,
      archetypeId: "dreamsign_draft",
      mechanicId: "gain-dreamsign",
      policyId,
      minimum: quantities.minimumChooserSize,
      maximum,
    });
    if (count < quantities.minimumChooserSize) return null;
    const selection = selectMerchantReward({
      context,
      archetypeId: "dreamsign_draft",
      mechanicId: "gain-dreamsign",
      policyId,
      request: { count },
    });
    if (selection === null) return null;
    const selectedIds = new Set(selection.bindings.dreamsignIds);
    const sampled = context.dreamsignTemplates.filter((template) =>
      selectedIds.has(template.id),
    );
    if (sampled.length < quantities.minimumChooserSize) return null;

    // Step 4: build the chooser candidates
    const choiceCandidates: MerchantChoiceCandidateDraft[] = sampled.map(
      (template): MerchantChoiceCandidateDraft => ({
        choiceId: template.id,
        gameObjects: [dreamsignGameObject(template)],
        applyPayload: {
          kind: "add_dreamsign",
          dreamsignId: template.id,
          dreamsignTemplate: template,
        },
        dreamsignId: template.id,
      }),
    );

    // targetKey = ids joined (stable identity for metrics; first id when 1 sampled)
    const targetKey = sampled.map((t) => t.id).join(",");

    return {
      archetypeId: "dreamsign_draft",
      family: "dreamsign",
      gameObjects: sampled.map(dreamsignGameObject),
      choiceRequest: {
        choiceType: "dreamsign",
        candidates: choiceCandidates,
      },
      targetKey,
      ...selectionMetadata(selection),
    };
  },
};
