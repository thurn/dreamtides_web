import { describe, expect, it } from "vitest";
import type { CardData } from "../types/cards";
import type { Tides4DeckJson } from "../draft/pool/tides4-io";
import { asCardId, asCardName } from "../types/card-identity";
import { resolveTideDeck } from "./tide-deck-resolution";

function makeCard(id: string, cardNumber: number, name: string): CardData {
  return {
    name: asCardName(name),
    id: asCardId(id),
    cardNumber,
    cardType: "Character",
    subtype: "Unit",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: `${name} text`,
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeDeck(cards: Tides4DeckJson["cards"]): Tides4DeckJson {
  return {
    id: "tide-fac-01",
    displayName: "Test tide",
    displayDescription: "Test description",
    resonance: "shadow",
    role: "facet",
    cards,
  };
}

function cardsByUuid(...cards: CardData[]): ReadonlyMap<string, CardData> {
  return new Map(cards.map((card) => [card.id.toLowerCase(), card]));
}

describe("resolveTideDeck", () => {
  it("reports an unknown tide (no deck) as not found", () => {
    const resolution = resolveTideDeck(undefined, cardsByUuid());
    expect(resolution).toEqual({
      found: false,
      cards: [],
      unresolved: [],
      totalCopies: 0,
    });
  });

  it("resolves decklist UUIDs to cards in order with copy counts", () => {
    const a = makeCard("11111111-1111-1111-1111-111111111111", 1, "Alpha");
    const b = makeCard("22222222-2222-2222-2222-222222222222", 2, "Beta");
    const deck = makeDeck([
      { id: a.id, copies: 2 },
      { id: b.id, copies: 1 },
    ]);

    const resolution = resolveTideDeck(deck, cardsByUuid(a, b));

    expect(resolution.found).toBe(true);
    expect(resolution.cards.map((entry) => entry.card.id)).toEqual([a.id, b.id]);
    expect(resolution.cards.map((entry) => entry.copies)).toEqual([2, 1]);
    expect(resolution.totalCopies).toBe(3);
    expect(resolution.unresolved).toEqual([]);
  });

  it("matches UUIDs case-insensitively", () => {
    const a = makeCard("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", 7, "Alpha");
    const deck = makeDeck([
      { id: a.id.toUpperCase(), copies: 1 },
    ]);

    const resolution = resolveTideDeck(deck, cardsByUuid(a));

    expect(resolution.cards).toHaveLength(1);
    expect(resolution.cards[0]?.card.id).toBe(a.id);
    expect(resolution.unresolved).toEqual([]);
  });

  it("reports unmatched UUIDs as unresolved while keeping matched cards and counting every copy", () => {
    const a = makeCard("11111111-1111-1111-1111-111111111111", 1, "Alpha");
    const deck = makeDeck([
      { id: a.id, copies: 1 },
      { id: "99999999-9999-9999-9999-999999999999", copies: 2 },
      { id: "00000000-0000-0000-0000-000000000000", copies: 1 },
    ]);

    const resolution = resolveTideDeck(deck, cardsByUuid(a));

    expect(resolution.cards.map((entry) => entry.card.id)).toEqual([a.id]);
    expect(resolution.unresolved).toEqual([
      "99999999-9999-9999-9999-999999999999",
      "00000000-0000-0000-0000-000000000000",
    ]);
    expect(resolution.totalCopies).toBe(4);
  });
});
