import type { AuguryRng } from "../signals/rng";
import type {
  AuguryApplyPayload,
  AuguryContext,
  AuguryDeckCard,
} from "../types";
import type { AuguryArchetypeBuilder, AuguryOfferDraft } from "./types";
import {
  augurySelectionPolicy,
  selectionMetadata,
  selectAuguryReward,
} from "./sharedSelection";
import { parseAuguryTargetKey } from "../../types/identifiers";

function removeDeckEntryPayload(
  card: AuguryDeckCard,
): Extract<AuguryApplyPayload, { kind: "remove_deck_entry" }> {
  return {
    kind: "remove_deck_entry",
    entryId: card.entryId,
    cardUuid: card.cardUuid,
    cardNumber: card.cardNumber,
  };
}

/** Purges the lowest leave-one-out affinity entry; rarity is not consulted. */
export const purgeBuilder: AuguryArchetypeBuilder = {
  archetypeId: "purge",
  family: "remove",
  eligible(context): boolean {
    return (
      context.deckCards.length >=
        context.rewardSelection.tuning.minDeckForPurge &&
      context.deckCards.some((card) => !card.deckEntry.isBane)
    );
  },
  build(
    context: AuguryContext,
    _rng: AuguryRng,
  ): AuguryOfferDraft | null {
    const selection = selectAuguryReward({
      context,
      archetypeId: "purge",
      mechanicId: "purge-deck-entry",
      policyId: augurySelectionPolicy(context, "purge"),
      request: { constraints: { allowStarters: true } },
    });
    const entryId = selection?.bindings.deckEntryIds[0];
    const target =
      entryId === undefined ? undefined : context.deckEntryById.get(entryId);
    if (selection === null || target === undefined) return null;
    return {
      archetypeId: "purge",
      family: "remove",
      gameObjects: [{ ...target }],
      applyPayload: removeDeckEntryPayload(target),
      targetKey: parseAuguryTargetKey(target.entryId),
      ...selectionMetadata(selection),
    };
  },
};
