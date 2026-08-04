import { asCardId, type CardId } from "../types/card-identity";
import {
  NIGHTMARE_CARD_ID as NIGHTMARE_CARD_ID_VALUE,
  NIGHTMARE_CARD_NUMBER,
} from "./nightmare-identity";

/** Stable identity of Nightmare, the sole Bane card. */
export const NIGHTMARE_CARD_ID: CardId = asCardId(NIGHTMARE_CARD_ID_VALUE);
export { NIGHTMARE_CARD_NUMBER };

export const NIGHTMARE_CARD_NAME = "Nightmare";

export function isNightmareCardId(cardId: string): boolean {
  return cardId.toLowerCase() === NIGHTMARE_CARD_ID;
}
