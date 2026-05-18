import type { CardData } from "./types/cards";
import type { CardTypeChange } from "./types/quest";

type CardTypeFields = Pick<CardData, "cardType" | "subtype">;

/** Returns a card-like value with any deck-entry type override applied. */
export function applyCardTypeChange<T extends CardTypeFields>(
  card: T,
  typeChange: CardTypeChange | null | undefined,
): T {
  if (typeChange == null) {
    return card;
  }
  return {
    ...card,
    cardType: typeChange.cardType,
    subtype: typeChange.subtype,
  };
}
