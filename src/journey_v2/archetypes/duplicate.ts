import { auguryArchetype } from "../../data/augury-data";
import type { MerchantRng } from "../signals/rng";
import type {
  MerchantApplyPayload,
  MerchantContext,
  MerchantDeckCard,
} from "../types";
import type {
  MerchantArchetypeBuilder,
  MerchantChoiceCandidateDraft,
  MerchantOfferDraft,
} from "./types";
import {
  augurySelectionPolicy,
  selectionMetadata,
  selectMerchantReward,
} from "./sharedSelection";
import { asChoiceId } from "../../types/identifiers";
import { asDeckEntryId } from "../../types/identifiers";
import { asMerchantTargetKey } from "../../types/identifiers";

/** Duplicates strong entries, using rarity first and leave-one-out affinity second. */
export const duplicateBuilder: MerchantArchetypeBuilder = {
  archetypeId: "duplicate",
  family: "duplicate",
  eligible: (context) => context.deckCards.some((card) => !card.card.isStarter),
  build(
    context: MerchantContext,
    _rng: MerchantRng,
  ): MerchantOfferDraft | null {
    const archetype = auguryArchetype(
      context.rewardSelection.content.auguryData,
      "duplicate",
    );
    const selection = selectMerchantReward({
      context,
      archetypeId: "duplicate",
      mechanicId: "duplicate-deck-entry",
      policyId: augurySelectionPolicy(context, "duplicate"),
      request: { count: archetype.quantities.chooserSize, upTo: true },
    });
    if (selection === null) return null;
    const sampled = selection.bindings.deckEntryIds.flatMap((entryId) => {
      const deckCard = context.deckEntryById.get(entryId);
      return deckCard === undefined
        ? []
        : [{ entryId: asDeckEntryId(entryId), deckCard }];
    });
    if (sampled.length === 0) return null;

    const payload = (card: MerchantDeckCard): MerchantApplyPayload => {
      const child = {
        kind: "duplicate_deck_entry" as const,
        entryId: card.entryId,
        cardUuid: card.cardUuid,
        cardNumber: card.cardNumber,
      };
      return archetype.quantities.grantedCopies === 1
        ? child
        : {
            kind: "composite",
            children: Array.from(
              { length: archetype.quantities.grantedCopies },
              () => child,
            ),
          };
    };
    const object = (card: MerchantDeckCard): MerchantDeckCard => ({ ...card });
    if (sampled.length === 1) {
      const target = sampled[0];
      return {
        archetypeId: "duplicate",
        family: "duplicate",
        gameObjects: [object(target.deckCard)],
        applyPayload: payload(target.deckCard),
        targetKey: asMerchantTargetKey(target.entryId),
        ...selectionMetadata(selection),
      };
    }
    const candidates: MerchantChoiceCandidateDraft[] = sampled.map(
      (target) => ({
        choiceId: asChoiceId(target.entryId),
        gameObjects: [object(target.deckCard)],
        applyPayload: payload(target.deckCard),
      }),
    );
    return {
      archetypeId: "duplicate",
      family: "duplicate",
      gameObjects: [],
      choiceRequest: { choiceType: "catalogCard", candidates },
      targetKey: asMerchantTargetKey(
        sampled.map((entry) => entry.entryId).join(","),
      ),
      ...selectionMetadata(selection),
    };
  },
};
