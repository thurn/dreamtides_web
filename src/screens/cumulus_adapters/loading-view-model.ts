import type { LoadingView } from "../../cumulus/screens/LoadingScreen";
import type { CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { TutorialFeaturedCards } from "../../types/tutorial";

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
  featuredCards: TutorialFeaturedCards,
): LoadingView {
  const runeboundChampion = resolveCardById(
    cardDatabase,
    featuredCards.enemyStarterCardId,
  );
  const worldsAwait = resolveCardById(
    cardDatabase,
    featuredCards.loadingEventCardId,
  );
  return {
    runeboundChampion: {
      cardId: runeboundChampion.id,
      displaySnapshot: runeboundChampion,
    },
    worldsAwait: {
      cardId: worldsAwait.id,
      displaySnapshot: worldsAwait,
    },
  };
}
