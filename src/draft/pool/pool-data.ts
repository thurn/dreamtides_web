import type { PoolCard, PoolData } from "./types.ts";

/** Build the stable UUID indexes shared by tides4 and affiliation scoring. */
export function buildPoolData(
  cards: readonly PoolCard[],
  decklistIds?: readonly (readonly string[])[],
): PoolData {
  let cardNameById: Map<string, string> | undefined;
  for (const card of cards) {
    if (card.id === undefined) continue;
    cardNameById ??= new Map<string, string>();
    if (!cardNameById.has(card.id)) cardNameById.set(card.id, card.name);
  }
  return { decklistIds, cardNameById };
}
