import { type CardId } from "../types/card-identity";
import { CARD_ROLE_DATA } from "./card-roles";

/** Stable identity of Nightmare, the sole Bane card. */
export const NIGHTMARE_CARD_ID: CardId = CARD_ROLE_DATA.nightmare.cardId;
export const NIGHTMARE_CARD_NUMBER =
  CARD_ROLE_DATA.nightmare.historicalCardNumber;
export const NIGHTMARE_CARD_NAME = CARD_ROLE_DATA.nightmare.displayName;

export function isNightmareCardId(cardId: CardId): boolean {
  return cardId.toLowerCase() === NIGHTMARE_CARD_ID;
}
