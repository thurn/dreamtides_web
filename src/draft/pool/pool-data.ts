import type { PoolCard, PoolData } from "./types.ts";
import type { CardId } from "../../types/card-identity.ts";

/** Build the stable UUID indexes shared by tides4 and affiliation scoring. */
export function buildPoolData(
  cards: readonly PoolCard[],
): PoolData {
  let cardNameById: Map<CardId, string> | undefined;
  for (const card of cards) {
    if (card.id === undefined) continue;
    cardNameById ??= new Map<CardId, string>();
    if (!cardNameById.has(card.id)) cardNameById.set(card.id, card.name);
  }
  return { cardNameById };
}
