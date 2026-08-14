import type { CardData } from "../types/cards";
import { loadDreamwellCards, type DreamwellCard } from "./dreamwell-database";
import { asBattleCardId } from "../types/identifiers";

/** Stable internal instance identity used by the scripted player-card play. */
export const TUTORIAL_PLAYER_CARD_INSTANCE_ID = asBattleCardId(
  "tutorial-player-deck-1",
);

export interface TutorialCards {
  readonly cards: readonly CardData[];
  readonly dreamwell: readonly DreamwellCard[];
}

/** Load the canonical card data used to resolve authored tutorial UUIDs. */
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
    cards,
    dreamwell,
  };
}
