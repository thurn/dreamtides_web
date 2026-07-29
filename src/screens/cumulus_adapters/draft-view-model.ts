// The pure view-model builder for the Cumulus draft screen. Every mapping rule
// between journey domain data and `DraftScreen`'s view types lives here as plain,
// unit-testable functions — no React, no state hooks, no effects.
// `DraftSiteScreenAdapter` acquires live state (and mints the draft offer) and
// calls `buildDraftView`; this module never acquires anything itself.

import { draftSitePickCount } from "../../draft/draft-site-config";
import type { CardData } from "../../types/cards";
import type { DreamscapeNode, SiteState } from "../../types/journey";
import type { DraftView } from "../../cumulus/screens/DraftScreen";
import type { JourneyState } from "../../types/journey";
import type { TutorialSiteConfiguration } from "../../types/tutorial";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { buildFirstVisitSiteTutorialView } from "./site-tutorial-view-model";

/**
 * Sort an offered pack for display: cheapest first, then alphabetically as a
 * stable tiebreak. Card names are resolved only here at the display edge; the
 * pack's identity everywhere else is its card number, never its name.
 */
export function sortOfferCards(cards: readonly CardData[]): CardData[] {
  return [...cards].sort((a, b) => {
    const energyCostDelta = (a.energyCost ?? 0) - (b.energyCost ?? 0);
    if (energyCostDelta !== 0) {
      return energyCostDelta;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Resolve the offered card numbers to their cards (by number, from the
 * database) and sort them for display. Numbers absent from the database are
 * dropped rather than rendered as a broken cell.
 */
export function resolveOfferCards(
  offerCardNumbers: readonly number[],
  cardDatabase: ReadonlyMap<number, CardData>,
): CardData[] {
  const cards = offerCardNumbers
    .map((cardNumber) => cardDatabase.get(cardNumber))
    .filter((card): card is CardData => card !== undefined);
  return sortOfferCards(cards);
}

/**
 * The full view-model for the draft screen: the dreamscape scene the draft
 * sits in, the resolved + sorted offer pack (keyed by its card numbers so a new
 * pack cross-fades the grid), and the floating pick counter.
 */
export function buildDraftView(params: {
  offerCardNumbers: readonly number[];
  cardDatabase: ReadonlyMap<number, CardData>;
  sceneNode: DreamscapeNode | null;
  site: Pick<SiteState, "data"> | null;
  sitePicksCompleted: number;
  journeyState?: JourneyState;
  tutorialConfiguration?: TutorialSiteConfiguration;
}): DraftView {
  const pickTotal = params.site !== null ? draftSitePickCount(params.site) : 0;
  return {
    scene:
      params.sceneNode !== null ? dreamscapeSceneRef(params.sceneNode) : null,
    offer: resolveOfferCards(params.offerCardNumbers, params.cardDatabase).map(
      (card) => ({
        cardId: card.id,
        displaySnapshot: card,
      }),
    ),
    offerKey: params.offerCardNumbers.join(","),
    // Clamp so the last pack never reads past the total (e.g. "(6/5)").
    pickNumber: Math.min(params.sitePicksCompleted + 1, Math.max(pickTotal, 1)),
    pickTotal,
    tutorial:
      params.journeyState === undefined
        ? undefined
        : buildFirstVisitSiteTutorialView(
            params.journeyState,
            "Draft",
            params.tutorialConfiguration,
          ),
  };
}
