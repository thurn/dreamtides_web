import type { CardData } from "../types/cards";
import { loadCardsV2Database } from "./cards-v2-database";
import { loadDreamwellCards, type DreamwellCard } from "./dreamwell-database";

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
