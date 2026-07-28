import type { JourneyContent } from "../../data/journey-content";
import type { CardTutorialGuidanceContentProvider } from "../../rules/card-tutorial-guidance";
import type { CardData } from "../../types/cards";

/** Build the UUID-indexed content seam used by the pure card tutorial reducer. */
export function createCardTutorialGuidanceContentProvider(
  content: JourneyContent,
): CardTutorialGuidanceContentProvider {
  const cardsById = new Map<string, CardData>();
  for (const card of content.cardDatabase.values()) {
    cardsById.set(card.id, card);
  }
  return {
    triggers: content.tutorialTriggers ?? [],
    cardById: (cardId) => cardsById.get(cardId),
  };
}
