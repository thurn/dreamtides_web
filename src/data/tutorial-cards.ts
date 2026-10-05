import type { CardData } from "../types/cards";
import { loadCardsV2Database } from "./cards-v2-database";
import { loadDreamwellCards, type DreamwellCard } from "./dreamwell-database";
import { parseBattleCardId } from "../types/identifiers";

/** Stable internal instance identity used by the scripted player-card play. */
export const TUTORIAL_PLAYER_CARD_INSTANCE_ID = parseBattleCardId(
  "tutorial-player-deck-1",
);

export interface TutorialCards {
  readonly cards: readonly CardData[];
  readonly dreamwell: readonly DreamwellCard[];
}

/** Load the canonical card data used to resolve authored tutorial UUIDs. */
export function loadTutorialCards(): TutorialCards {
  return {
    cards: [...loadCardsV2Database().values()],
    dreamwell: loadDreamwellCards(),
  };
}
