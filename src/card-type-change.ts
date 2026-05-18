import type { CardData } from "./types/cards";
import type {
  CardKeywordModification,
  CardTypeChange,
  DeckEntryCardModification,
} from "./types/quest";

type CardTypeFields = Pick<CardData, "cardType" | "subtype">;
type CardKeywordFields = Pick<CardData, "isFast">;

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

/** Returns a card-like value with any deck-entry keyword overrides applied. */
export function applyCardKeywordModification<T extends CardKeywordFields>(
  card: T,
  keywordModification: CardKeywordModification | null | undefined,
): T {
  if (keywordModification?.fast !== true) {
    return card;
  }
  return {
    ...card,
    isFast: true,
  };
}

/** Returns a card-like value with all deck-entry card modifications applied. */
export function applyDeckEntryCardModification<
  T extends CardTypeFields & CardKeywordFields,
>(
  card: T,
  modification: DeckEntryCardModification,
): T {
  return applyCardKeywordModification(
    applyCardTypeChange(card, modification.typeChange),
    modification.keywords,
  );
}
