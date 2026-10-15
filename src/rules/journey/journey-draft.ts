import type { DreamsignId } from "../../types/identifiers";
import type { JourneyDraftEffect, JourneyState, TransfigurationType } from "../../types/journey";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";
import { journeyTransfigurationCard } from "./journey-transfiguration";

function applies(effect: Extract<JourneyDraftEffect, { kind: "additionalDraftChoices" }>, essence: number): boolean {
  return effect.minimumEssence === undefined || essence >= effect.minimumEssence;
}

/** Quote a new offer from the catalog base and the currently held source copies. */
export function draftOfferCount(
  journey: Pick<JourneyState, "dreamsigns" | "essence">,
  baseCount: number,
  registry: Pick<JourneyModifierRegistry, "lookup">,
): number {
  if (!Number.isSafeInteger(baseCount) || baseCount < 0) throw new RangeError("Invalid Draft base count.");
  return journey.dreamsigns.reduce((count, sign) => {
    const effect = registry.lookup(sign.id)?.journeyDraft;
    const next = effect?.kind === "additionalDraftChoices" && applies(effect, journey.essence)
      ? count + effect.additionalCards : count;
    if (!Number.isSafeInteger(next)) throw new RangeError("Draft offer count exceeds safe arithmetic.");
    return next;
  }, baseCount);
}

const FORM_TYPES: Readonly<Record<TransfigurationType, true>> = Object.freeze({
  Empowered: true, Amplified: true, Kindled: true, Inspired: true, Enduring: true,
  Hastened: true, Resonant: true, Attuned: true, Perfected: true,
});

/** Register a bounded Draft clause and diagnose its successful applications. */
export function journeyDraft(dreamsignId: DreamsignId, descriptor: JourneyDraftEffect): JourneyModifierDefinition {
  const effect = Object.freeze({ ...descriptor });
  if (effect.kind === "firstDraftEventTransfiguration") {
    if (!Object.prototype.hasOwnProperty.call(FORM_TYPES, effect.type)) throw new RangeError("Invalid journeyDraft fixed form.");
  } else if (effect.kind !== "additionalDraftChoices" || !Number.isSafeInteger(effect.additionalCards) || effect.additionalCards < 1 ||
    effect.minimumEssence !== undefined && (!Number.isFinite(effect.minimumEssence) || effect.minimumEssence < 0)) {
    throw new RangeError("Invalid journeyDraft catalog arithmetic.");
  }
  return {
    dreamsignId,
    journeyDraft: effect,
    afterJourneyEvent({ before, journey, eventType, heldIndex, lookup }): ReturnType<JourneyModifierDefinition["afterJourneyEvent"]> {
      const draft = journey.draftState;
      if (effect.kind === "firstDraftEventTransfiguration") {
        const prior = before.draftState, entryId = draft?.siteFirstEventEntryId;
        if (eventType !== "PICK_DRAFT_CARD" || draft === null || prior === null ||
          draft.activeSiteId === null || draft.activeSiteId !== prior.activeSiteId ||
          draft.sitePicksCompleted !== prior.sitePicksCompleted + 1 ||
          prior.siteFirstEventEntryId != null || entryId == null ||
          before.deck.some((entry) => entry.entryId === entryId)) return null;
        const entry = journey.deck.find((candidate) => candidate.entryId === entryId);
        if (entry === undefined || entry.transfiguration !== null) return null;
        const card = journeyTransfigurationCard(entry);
        if (card === null) throw new Error("First Draft Event transfiguration metadata is unavailable.");
        if (card.cardType !== "Event" || !card.forms.includes(effect.type)) return null;
        return {
          journey: { ...journey, deck: journey.deck.map((candidate) => candidate.entryId === entryId
            ? { ...candidate, transfiguration: effect.type } : candidate) },
          before: { transformed: 0 }, after: { transformed: 1 },
          target: { siteIds: [draft.activeSiteId], transfigurations: [{ entryId, cardId: card.cardId, type: effect.type }] },
        };
      }
      if ((eventType !== "ENTER_DRAFT_SITE" && eventType !== "PICK_DRAFT_CARD") ||
        draft === null || draft.activeSiteId === null || draft.currentOffer.length === 0 ||
        draft.currentOfferCount === undefined || !applies(effect, journey.essence)) return null;
      const baseCount = draft.currentOfferCount - draftOfferCount(journey, 0, { lookup });
      const precedingCount = draftOfferCount({ ...journey, dreamsigns: journey.dreamsigns.slice(0, heldIndex) }, baseCount, { lookup });
      return {
        journey,
        before: { requestedCount: precedingCount, essence: journey.essence },
        after: { requestedCount: precedingCount + effect.additionalCards,
          quotedCount: draft.currentOfferCount, offeredCount: draft.currentOffer.length, essence: journey.essence },
        target: { siteIds: [draft.activeSiteId] },
      };
    },
  };
}
