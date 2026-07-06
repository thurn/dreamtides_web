// Pure view-model builder for the desktop deck viewer. Resolves the deck to the
// cards the player actually holds (reusing the shared mobile resolution so both
// viewers show a card identically), and pairs them with the run profile the
// desktop sidebar shows: the Dreamcaller and the collected dreamsigns. No React,
// no state hooks — the adapter acquires live state and calls this; this module
// maps domain data to the screen's view types and nothing else.

import type { CardData } from "../../types/cards";
import type { DeckEntry, Dreamcaller, Dreamsign } from "../../types/quest";
import type {
  DeckDreamcallerView,
  DesktopDeckView,
} from "../../tango/screens/DesktopDeckViewer";
import { buildMobileDeckView } from "./mobile-deck-view-model";

/** Map the run's Dreamcaller to the sidebar view (portrait visual + rules text). */
function toDreamcallerView(
  dreamcaller: Dreamcaller | null,
): DeckDreamcallerView | null {
  if (dreamcaller === null) return null;
  return {
    imageNumber: dreamcaller.imageNumber,
    name: dreamcaller.name,
    title: dreamcaller.title,
    renderedText: dreamcaller.renderedText,
  };
}

/**
 * The full desktop deck view: every resolvable deck entry in acquisition order,
 * plus the run's Dreamcaller and collected dreamsigns for the sidebar.
 * Deterministic in its arguments.
 */
export function buildDesktopDeckView(
  deck: readonly DeckEntry[],
  cardDatabase: Map<number, CardData>,
  dreamcaller: Dreamcaller | null,
  dreamsigns: readonly Dreamsign[],
  maxDreamsigns: number,
): DesktopDeckView {
  return {
    cards: buildMobileDeckView(deck, cardDatabase).cards,
    dreamcaller: toDreamcallerView(dreamcaller),
    dreamsigns: [...dreamsigns],
    maxDreamsigns,
  };
}
