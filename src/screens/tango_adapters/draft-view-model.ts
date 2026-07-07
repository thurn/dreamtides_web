// The pure view-model builder for the Tango draft screen. Every mapping rule
// between quest domain data and `DraftScreen`'s view types lives here as plain,
// unit-testable functions — no React, no state hooks, no effects.
// `DraftSiteScreenAdapter` acquires live state (and mints the draft offer) and
// calls `buildDraftView`; this module never acquires anything itself.

import type { CardData } from "../../types/cards";
import type { DreamscapeNode, QuestState } from "../../types/quest";
import type { DraftHudView, DraftView } from "../../tango/screens/DraftScreen";
import {
  dreamscapeSceneRef,
  toQsbDreamcaller,
  toQsbDreamsigns,
} from "./dreamscape-view-model";

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

/** The bottom-HUD slice of the view-model, from live run state. */
export function buildDraftHudView(state: QuestState): DraftHudView {
  return {
    essence: state.essence,
    deck: state.deck.length,
    dreamcaller: toQsbDreamcaller(state.dreamcaller),
    dreamsigns: toQsbDreamsigns(state.dreamsigns),
  };
}

/**
 * The full view-model for the draft screen: the dreamscape scene the draft
 * sits in, the resolved + sorted offer pack (keyed by its card numbers so a new
 * pack cross-fades the grid), and the persistent bottom-HUD data.
 */
export function buildDraftView(params: {
  offerCardNumbers: readonly number[];
  cardDatabase: ReadonlyMap<number, CardData>;
  sceneNode: DreamscapeNode | null;
  state: QuestState;
}): DraftView {
  return {
    scene: params.sceneNode !== null ? dreamscapeSceneRef(params.sceneNode) : null,
    offer: resolveOfferCards(params.offerCardNumbers, params.cardDatabase),
    offerKey: params.offerCardNumbers.join(","),
    hud: buildDraftHudView(params.state),
  };
}
