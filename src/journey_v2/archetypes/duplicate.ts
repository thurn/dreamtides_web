import { auguryArchetype } from "../../data/augury-data";
import type { AuguryRng } from "../signals/rng";
import type {
  AuguryApplyPayload,
  AuguryContext,
  AuguryDeckCard,
} from "../types";
import type {
  AuguryArchetypeBuilder,
  AuguryChoiceCandidateDraft,
  AuguryOfferDraft,
} from "./types";
import {
  augurySelectionPolicy,
  selectionMetadata,
  selectAuguryReward,
} from "./sharedSelection";
import { parseChoiceId } from "../../types/identifiers";
import { parseAuguryTargetKey } from "../../types/identifiers";

/** Duplicates strong entries, using rarity first and leave-one-out affinity second. */
export const duplicateBuilder: AuguryArchetypeBuilder = {
  archetypeId: "duplicate",
  family: "duplicate",
  eligible: (context) => context.deckCards.some((card) => !card.card.isStarter),
  build(
    context: AuguryContext,
    _rng: AuguryRng,
  ): AuguryOfferDraft | null {
    const archetype = auguryArchetype(
      context.rewardSelection.content.auguryData,
      "duplicate",
    );
    const selection = selectAuguryReward({
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
        : [{ entryId: entryId, deckCard }];
    });
    if (sampled.length === 0) return null;

    const payload = (card: AuguryDeckCard): AuguryApplyPayload => {
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
    const object = (card: AuguryDeckCard): AuguryDeckCard => ({ ...card });
    if (sampled.length === 1) {
      const target = sampled[0];
      return {
        archetypeId: "duplicate",
        family: "duplicate",
        gameObjects: [object(target.deckCard)],
        applyPayload: payload(target.deckCard),
        targetKey: parseAuguryTargetKey(target.entryId),
        ...selectionMetadata(selection),
      };
    }
    const candidates: AuguryChoiceCandidateDraft[] = sampled.map(
      (target) => ({
        choiceId: parseChoiceId(target.entryId),
        gameObjects: [object(target.deckCard)],
        applyPayload: payload(target.deckCard),
      }),
    );
    return {
      archetypeId: "duplicate",
      family: "duplicate",
      gameObjects: [],
      choiceRequest: { choiceType: "catalogCard", candidates },
      targetKey: parseAuguryTargetKey(
        sampled.map((entry) => entry.entryId).join(","),
      ),
      ...selectionMetadata(selection),
    };
  },
};
