import type { JourneyContent } from "../../data/journey-content";
import { resolveDeckEntryCard } from "../../card-type-change";
import { eligibleTransfigurations, offeredTransfigurationForms } from "../../transfiguration/transfiguration-logic";
import type { JourneyTransfigurationProvider } from "../../rules/journey/journey-transfiguration";

/** Captured immutable content resolves actual deck-entry values at fold time. */
export function createJourneyTransfigurationProvider(content: JourneyContent): JourneyTransfigurationProvider {
  return { resolve(entry) {
    const base = content.cardDatabase.get(entry.cardNumber);
    if (base === undefined) return null;
    const card = resolveDeckEntryCard(content.transfigurationData, base, entry);
    return { cardId: base.id, cardType: card.cardType, subtype: card.subtype,
      starter: base.isStarter === true || base.roles?.includes("starter-deck") === true,
      perfectedEligible: entry.transfiguration === null && eligibleTransfigurations(content.transfigurationData, card).includes("Perfected"),
      forms: entry.transfiguration === null ? offeredTransfigurationForms(content.transfigurationData, card, null).map((offer) => offer.type) : [] };
  } };
}
