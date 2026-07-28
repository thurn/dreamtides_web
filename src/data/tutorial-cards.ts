import type { CardData } from "../types/cards";
import { loadDreamwellCards, type DreamwellCard } from "./dreamwell-database";

export const TUTORIAL_OPPONENT_CARD_ID = "229ab3a1-3720-41a2-924c-8fe112188f8e";
export const TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID =
  "a28ad36d-fa74-4190-a463-7efd3a6233d0";
export const TUTORIAL_PLAYER_CARD_ID = "e83014d3-9d35-4e80-a1b3-9b25360ad2af";
export const TUTORIAL_PLAYER_CARD_INSTANCE_ID = "tutorial-player-deck-1";
export const TUTORIAL_DREAMWELL_CARD_ID =
  "02e8ea92-1218-413c-9f0b-4c865a3921d3";
/** UUID of the DreamAvatar offered when the tutorial hands off to a new quest. */
export const TUTORIAL_DREAM_AVATAR_ID =
  "BFC40414-5264-41BF-86E1-A0F41EE4F5B5";

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
