import type { JourneyContent } from "../../data/journey-content";
import { isTransfigurationExplorationEffect } from "../../data/exploration";
import type { CardTutorialGuidanceContentProvider } from "../../rules/card-tutorial-guidance";
import type { CardData } from "../../types/cards";
import type { JourneyState, SiteState } from "../../types/journey";
import {
  buildMerchantContext,
  generateMerchantEncounter,
  isTransfigurationMerchantArchetype,
} from "../../journey_v2";
import { asExplorationActionId } from "../../types/identifiers";

function explorationOffersTransfiguration(
  content: JourneyContent,
  journey: JourneyState,
  site: SiteState,
): boolean {
  const runtime = journey.siteRuntime[site.id];
  if (runtime?.kind !== "exploration" || runtime.resolution !== null) {
    return false;
  }
  const encounter = content.exploration?.encounters.find(
    (candidate) => candidate.cardId === runtime.encounterCardId,
  );
  if (encounter === undefined) return false;
  const visibleActionIds = new Set(
    runtime.actionOffers.map((offer) => offer.actionId),
  );
  return encounter.actions.some(
    (action) =>
      visibleActionIds.has(asExplorationActionId(action.id)) &&
      isTransfigurationExplorationEffect(action.effectKind),
  );
}

/** Build the UUID-indexed content seam used by the pure card tutorial reducer. */
export function createCardTutorialGuidanceContentProvider(
  content: JourneyContent,
): CardTutorialGuidanceContentProvider {
  const cardsById = new Map<string, CardData>();
  for (const card of content.cardDatabase.values()) {
    cardsById.set(card.id, card);
  }
  return {
    triggers: content.tutorial?.triggers ?? [],
    cardById: (cardId) => cardsById.get(cardId),
    hasVisibleTransfigurationReward: (journey, site) => {
      if (site.type === "Exploration") {
        return explorationOffersTransfiguration(content, journey, site);
      }
      if (site.type !== "Augury") return false;
      try {
        const encounter = generateMerchantEncounter(
          buildMerchantContext({
            journeyState: journey,
            journeyContent: content,
            site,
          }),
        );
        return encounter.offers.some((offer) =>
          isTransfigurationMerchantArchetype(offer.archetypeId),
        );
      } catch {
        return false;
      }
    },
  };
}
