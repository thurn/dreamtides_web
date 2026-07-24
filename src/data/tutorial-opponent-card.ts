import type { CardData } from "../types/cards";
import {
  loadDreamwellCards,
  type DreamwellCard,
} from "./dreamwell-database";

export const TUTORIAL_OPPONENT_CARD_ID =
  "229ab3a1-3720-41a2-924c-8fe112188f8e";
export const TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID =
  "a28ad36d-fa74-4190-a463-7efd3a6233d0";
export const TUTORIAL_PLAYER_CARD_ID =
  "e83014d3-9d35-4e80-a1b3-9b25360ad2af";
export const TUTORIAL_PLAYER_CARD_INSTANCE_ID = "tutorial-player-deck-1";
export const TUTORIAL_DREAMWELL_CARD_ID =
  "02e8ea92-1218-413c-9f0b-4c865a3921d3";

export interface TutorialCards {
  readonly opponents: readonly CardData[];
  readonly player: CardData;
  readonly dreamwell: readonly DreamwellCard[];
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

/** Resolve tutorial cards by stable UUID from one runtime-catalog load. */
export async function loadTutorialCards(): Promise<TutorialCards> {
  const [response, dreamwell] = await Promise.all([
    fetch("/card-data.json"),
    loadDreamwellCards(),
  ]);
  if (!response.ok) {
    throw new Error(
      `Failed to load tutorial card data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const cards = (await response.json()) as CardData[];
  return {
    opponents: [
      cardById(cards, TUTORIAL_OPPONENT_CARD_ID),
      cardById(cards, TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID),
    ],
    player: cardById(cards, TUTORIAL_PLAYER_CARD_ID),
    dreamwell,
  };
}

/** Resolve the tutorial opponent card by stable UUID from the runtime catalog. */
export async function loadTutorialOpponentCard(): Promise<CardData> {
  const opponent = (await loadTutorialCards()).opponents[0];
  if (opponent === undefined) {
    throw new Error("The tutorial opponent card catalog is empty.");
  }
  return opponent;
}
