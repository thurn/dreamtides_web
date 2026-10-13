import type { DreamsignId } from "../../types/identifiers";
import type { JourneyDraftEffect, JourneyState } from "../../types/journey";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";

function applies(effect: JourneyDraftEffect, essence: number): boolean {
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
    const next = effect !== undefined && applies(effect, journey.essence)
      ? count + effect.additionalCards : count;
    if (!Number.isSafeInteger(next)) throw new RangeError("Draft offer count exceeds safe arithmetic.");
    return next;
  }, baseCount);
}

/** Register one count clause and diagnose each successful fresh preparation. */
export function journeyDraft(dreamsignId: DreamsignId, descriptor: JourneyDraftEffect): JourneyModifierDefinition {
  const effect = Object.freeze({ ...descriptor });
  if (!Number.isSafeInteger(effect.additionalCards) || effect.additionalCards < 1 ||
    effect.minimumEssence !== undefined && (!Number.isFinite(effect.minimumEssence) || effect.minimumEssence < 0)) {
    throw new RangeError("Invalid journeyDraft catalog arithmetic.");
  }
  return {
    dreamsignId,
    journeyDraft: effect,
    afterJourneyEvent({ journey, eventType, heldIndex, lookup }) {
      const draft = journey.draftState;
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
