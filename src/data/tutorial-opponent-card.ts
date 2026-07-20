import type { CardData } from "../types/cards";

export const TUTORIAL_OPPONENT_CARD_ID =
  "229ab3a1-3720-41a2-924c-8fe112188f8e";

/** Resolve the tutorial opponent card by stable UUID from the runtime catalog. */
export async function loadTutorialOpponentCard(): Promise<CardData> {
  const response = await fetch("/card-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load tutorial card data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const cards = (await response.json()) as CardData[];
  const card = cards.find(
    (candidate) => candidate.id === TUTORIAL_OPPONENT_CARD_ID,
  );
  if (card === undefined) {
    throw new Error(
      `Tutorial card ${TUTORIAL_OPPONENT_CARD_ID} is missing from the card database.`,
    );
  }
  return card;
}
