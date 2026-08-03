import type { LoadingView } from "../../cumulus/screens/LoadingScreen";
import {
  TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
  TUTORIAL_WORLDS_AWAIT_CARD_ID,
} from "../../data/tutorial-cards";
import type { CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";

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
): LoadingView {
  const runeboundChampion = resolveCardById(
    cardDatabase,
    TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
  );
  const worldsAwait = resolveCardById(
    cardDatabase,
    TUTORIAL_WORLDS_AWAIT_CARD_ID,
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
