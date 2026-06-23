import type { CardData } from "../types/cards";
import type { Tides4DeckJson } from "../draft/pool/tides4-io";

/** A tide deck card resolved to renderable card data plus its copy count. */
export interface ResolvedTideCard {
  card: CardData;
  copies: number;
}

export interface TideDeckResolution {
  /** Whether the clicked tide id has a decklist in the tides4 artifact. */
  found: boolean;
  /** Distinct cards in the tide, in decklist order. */
  cards: ResolvedTideCard[];
  /** Decklist entries (their stale name, or UUID) that match no card. */
  unresolved: string[];
  /** Total copies across the whole decklist. */
  totalCopies: number;
}

/**
 * Resolve a tide's decklist to renderable cards. The tides4 artifact keys cards
 * by their stable cards_v2 UUID, so `cardsByUuid` must be indexed by lowercased
 * UUID. Entries whose UUID matches no card are reported in `unresolved` rather
 * than dropped silently, so a stale bake surfaces instead of hiding cards. A
 * missing deck (unknown tide id) yields `found: false`.
 */
export function resolveTideDeck(
  deck: Tides4DeckJson | undefined,
  cardsByUuid: ReadonlyMap<string, CardData>,
): TideDeckResolution {
  if (deck === undefined) {
    return { found: false, cards: [], unresolved: [], totalCopies: 0 };
  }
  const cards: ResolvedTideCard[] = [];
  const unresolved: string[] = [];
  let totalCopies = 0;
  for (const entry of deck.cards) {
    totalCopies += entry.copies;
    const card = cardsByUuid.get(entry.id.toLowerCase());
    if (card === undefined) {
      unresolved.push(entry.name !== "" ? entry.name : entry.id);
    } else {
      cards.push({ card, copies: entry.copies });
    }
  }
  return { found: true, cards, unresolved, totalCopies };
}
