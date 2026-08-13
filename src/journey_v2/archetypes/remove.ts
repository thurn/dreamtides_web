import type { MerchantRng } from "../signals/rng";
import type {
  MerchantApplyPayload,
  MerchantContext,
  MerchantDeckCard,
} from "../types";
import type { MerchantArchetypeBuilder, MerchantOfferDraft } from "./types";
import {
  augurySelectionPolicy,
  selectionMetadata,
  selectMerchantReward,
} from "./sharedSelection";

function removeDeckEntryPayload(
  card: MerchantDeckCard,
): Extract<MerchantApplyPayload, { kind: "remove_deck_entry" }> {
  return {
    kind: "remove_deck_entry",
    entryId: card.entryId,
    cardUuid: card.cardUuid,
    cardNumber: card.cardNumber,
  };
}

/** Purges the lowest leave-one-out affinity entry; rarity is not consulted. */
export const purgeBuilder: MerchantArchetypeBuilder = {
  archetypeId: "purge",
  family: "remove",
  eligible(context): boolean {
    return context.deckCards.length >= context.rewardSelection.tuning.minDeckForPurge &&
      context.deckCards.some((card) => !card.deckEntry.isBane);
  },
  build(context: MerchantContext, _rng: MerchantRng): MerchantOfferDraft | null {
    const selection = selectMerchantReward({
      context,
      archetypeId: "purge",
      mechanicId: "purge-deck-entry",
      policyId: augurySelectionPolicy(context, "purge"),
      request: { constraints: { allowStarters: true } },
    });
    const entryId = selection?.bindings.deckEntryIds[0];
    const target = entryId === undefined ? undefined : context.deckEntryById.get(entryId);
    if (selection === null || target === undefined) return null;
    return {
      archetypeId: "purge",
      family: "remove",
      gameObjects: [{ ...target }],
      applyPayload: removeDeckEntryPayload(target),
      targetKey: target.entryId,
      ...selectionMetadata(selection),
    };
  },
};
