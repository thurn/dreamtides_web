import type { CardData } from "../types/cards";

export const TUTORIAL_OPPONENT_CARD_ID =
  "229ab3a1-3720-41a2-924c-8fe112188f8e";
export const TUTORIAL_PLAYER_CARD_ID =
  "e83014d3-9d35-4e80-a1b3-9b25360ad2af";

export interface TutorialCards {
  readonly opponent: CardData;
  readonly player: CardData;
}

function cardById(cards: readonly CardData[], cardId: string): CardData {
  const card = cards.find((candidate) => candidate.id === cardId);
  if (card === undefined) {
    throw new Error(
      `Tutorial card ${cardId} is missing from the card database.`,
    );
  }
  return card;
}

/** Resolve both tutorial cards by stable UUID from one runtime-catalog load. */
export async function loadTutorialCards(): Promise<TutorialCards> {
  const response = await fetch("/card-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load tutorial card data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const cards = (await response.json()) as CardData[];
  return {
    opponent: cardById(cards, TUTORIAL_OPPONENT_CARD_ID),
    player: cardById(cards, TUTORIAL_PLAYER_CARD_ID),
  };
}

/** Resolve the tutorial opponent card by stable UUID from the runtime catalog. */
export async function loadTutorialOpponentCard(): Promise<CardData> {
  return (await loadTutorialCards()).opponent;
}
