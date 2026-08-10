import type { LoadingView } from "../../cumulus/screens/LoadingScreen";
import type { CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { TutorialCardConstants } from "../../types/tutorial";

function resolveCardById(
  cardDatabase: ReadonlyMap<number, CardData>,
  cardId: CardId | string,
): CardData {
  const card = [...cardDatabase.values()].find(
    (candidate) => candidate.id === cardId,
  );
  if (card === undefined) {
    throw new Error(
      `Loading screen card is missing from the catalog: ${cardId}`,
    );
  }
  return card;
}

/** Build the two UUID-resolved card models for the loading-screen anatomy scene. */
export function buildLoadingView(
  cardDatabase: ReadonlyMap<number, CardData>,
  tutorialCardConstants: TutorialCardConstants,
): LoadingView {
  const loadingCharacter = resolveCardById(
    cardDatabase,
    tutorialCardConstants.loadingScreenCharacterCardId,
  );
  const loadingEvent = resolveCardById(
    cardDatabase,
    tutorialCardConstants.loadingScreenEventCardId,
  );
  return {
    loadingCharacter: {
      cardId: loadingCharacter.id,
      displaySnapshot: loadingCharacter,
    },
    loadingEvent: {
      cardId: loadingEvent.id,
      displaySnapshot: loadingEvent,
    },
  };
}
