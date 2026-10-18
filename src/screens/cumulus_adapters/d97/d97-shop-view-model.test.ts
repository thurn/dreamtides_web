// D97 shop view-model rules: slots show their fixed quotes, bought slots are
// purchased and unaffordable ones disabled; the restock reads as used once
// spent; the sell panel captions each copy with its guarded sale quote and
// disables exactly what the rules refuse: its prices and disabled states are
// the rules' `shopSaleQuote` and `sellRefusal` on a synthetic run.

import { describe, expect, it } from "vitest";
import { D97_COLLECTION } from "../../../content/d97/collection";
import { D97_SHOP } from "../../../content/d97/shop";
import type { D97OwnedCopy } from "../../../d97/collection/types";
import { cardPriceFactsOf } from "../../../d97/shop/pricing";
import { sellRefusal, shopSaleQuote, shopSellGuards } from "../../../rules/d97/d97-shop";
import type { D97DialogueModule } from "../../../content/d97/dialogue/schema";
import type { D97Run, D97Shop } from "../../../rules/d97/d97-state";
import { parseCardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import { parseD97CharacterId, parseD97DialogueId, parseD97OwnedCopyId, parseDreamAnchorId } from "../../../types/identifiers";
import { buildD97ShopSellView, buildD97ShopView, resolveD97ShopKeeper } from "./d97-shop-view-model";

const CARD_A = parseCardId("00000000-0000-4000-8000-0000000000d1");
const CARD_B = parseCardId("00000000-0000-4000-8000-0000000000d2");
const card = (id: typeof CARD_A): CardData =>
  ({ id, energyCost: 2, spark: null, cardType: "Event", isFast: false, rarity: "Uncommon" }) as CardData;
const CARDS = new Map([[CARD_A, card(CARD_A)], [CARD_B, card(CARD_B)]]);
const ANCHOR = parseDreamAnchorId("d9700000-0000-4000-8000-000000000005");
const KEEPER_ID = parseD97CharacterId("d9791000-0000-4000-8000-0000000000a1");
const DIALOGUE_ID = parseD97DialogueId("d9792000-0000-4000-8000-0000000000a1");
const KEEPER_NAME = "Synthetic Keeper";
const DIALOGUES = new Map([[DIALOGUE_ID, { id: DIALOGUE_ID, speaker: { name: KEEPER_NAME } } as unknown as D97DialogueModule]]);
const KEEPER = { characterId: KEEPER_ID, name: KEEPER_NAME };

const SHOP: D97Shop = {
  slots: [
    { cardId: CARD_A, price: 40, purchased: false },
    { cardId: CARD_B, price: 90, purchased: false },
    { cardId: CARD_A, price: 40, purchased: true },
  ],
  restockedThisVisit: false,
  rolls: 1,
};

describe("resolveD97ShopKeeper", () => {
  it("is the occupant at the shop, named by their dialogue's speaker", () => {
    expect(resolveD97ShopKeeper({ character: KEEPER_ID, dialogue: DIALOGUE_ID }, DIALOGUES)).toEqual(KEEPER);
  });

  it("has no name without a dialogue, and is null with nobody at the shop", () => {
    expect(resolveD97ShopKeeper({ character: KEEPER_ID, dialogue: null }, DIALOGUES)).toEqual({ characterId: KEEPER_ID, name: null });
    expect(resolveD97ShopKeeper(undefined, DIALOGUES)).toBeNull();
  });
});

describe("buildD97ShopView", () => {
  it("presents the keeper's character and name and the player's Essence", () => {
    const view = buildD97ShopView({ anchorId: ANCHOR, shop: SHOP, keeper: KEEPER, essence: 50, cards: CARDS, tuning: D97_SHOP });
    expect(view.keeper).toMatchObject({ characterId: KEEPER_ID, name: KEEPER_NAME });
    expect(view.essence).toBe(50);
    expect(view.anchorId).toBe(ANCHOR);
    const unkept = buildD97ShopView({ anchorId: ANCHOR, shop: SHOP, keeper: null, essence: 50, cards: CARDS, tuning: D97_SHOP });
    expect(unkept.keeper).toBeNull();
  });

  it("prices slots at their quotes and marks bought and unaffordable slots", () => {
    const view = buildD97ShopView({ anchorId: ANCHOR, shop: SHOP, essence: 50, cards: CARDS, keeper: KEEPER, tuning: D97_SHOP });
    expect(view.offers.map((offer) => [offer.slotIndex, offer.price, offer.state])).toEqual([
      [0, 40, "available"],
      [1, 90, "unaffordable"],
      [2, 40, "purchased"],
    ]);
    expect(view.restock).toMatchObject({ price: 30, state: "available" });
    const spent = buildD97ShopView({ anchorId: ANCHOR, shop: { ...SHOP, restockedThisVisit: true }, essence: 50, cards: CARDS, keeper: KEEPER, tuning: D97_SHOP });
    expect(spent.restock.state).toBe("used");
  });
});

describe("buildD97ShopSellView", () => {
  const CONTENT = { cardPriceFacts: (cardId: typeof CARD_A) => { const data = CARDS.get(cardId); return data === undefined ? null : cardPriceFactsOf(data); } };
  const copy = (ordinal: number, zone: "deck" | "reserve"): D97OwnedCopy => ({
    copyId: parseD97OwnedCopyId(`00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`),
    cardId: ordinal % 2 === 0 ? CARD_A : CARD_B,
    zone,
    modifications: [],
    // Every third copy was bought, so the resale guard caps its quote.
    provenance: ordinal % 3 === 0 ? { channel: "shop", battleCount: 0, price: 10 } : { channel: "starting", battleCount: 0 },
  });
  /** A synthetic run whose active deck holds `deck` copies and whose reserve holds `reserve`. */
  const run = (deck: number, reserve: number) => {
    const copies = [
      ...Array.from({ length: deck }, (_, index) => copy(index + 1, "deck")),
      ...Array.from({ length: reserve }, (_, index) => copy(deck + index + 1, "reserve")),
    ];
    return { essence: 70, collection: { copies, nextCopyOrdinal: copies.length } } as unknown as D97Run;
  };
  const { minimumDeckSize, collectionFloor } = D97_COLLECTION;

  it.each([
    { name: "above both limits", deck: minimumDeckSize + 1, reserve: 2 },
    { name: "with the deck at its minimum", deck: minimumDeckSize, reserve: collectionFloor - minimumDeckSize + 2 },
    { name: "at the collection floor", deck: minimumDeckSize, reserve: collectionFloor - minimumDeckSize },
  ])("prices and disables every copy as the rules do, $name", ({ deck, reserve }) => {
    const synthetic = run(deck, reserve);
    const view = buildD97ShopSellView({ run: synthetic, keeper: KEEPER, cards: CARDS, content: CONTENT });
    const shown = [...view.reserve, ...view.deck];
    expect(shown).toHaveLength(deck + reserve);
    for (const entry of shown) {
      expect(entry.caption).toEqual({ kind: "essence", amount: shopSaleQuote(synthetic, entry.entryId, CONTENT) });
      expect(entry.disabled).toBe(sellRefusal(synthetic, entry.entryId) !== null);
    }
    expect(view).toMatchObject(shopSellGuards(synthetic));
  });

  it("disables only deck copies while the deck is at its minimum, and everything at the floor", () => {
    const atMinimum = buildD97ShopSellView({ run: run(minimumDeckSize, collectionFloor - minimumDeckSize + 2), keeper: null, cards: CARDS, content: CONTENT });
    expect(atMinimum).toMatchObject({ atFloor: false, deckAtMinimum: true });
    expect(atMinimum.deck.every((entry) => entry.disabled === true)).toBe(true);
    expect(atMinimum.reserve.every((entry) => entry.disabled === false)).toBe(true);
    const atFloor = buildD97ShopSellView({ run: run(minimumDeckSize, collectionFloor - minimumDeckSize), keeper: null, cards: CARDS, content: CONTENT });
    expect(atFloor.atFloor).toBe(true);
    expect([...atFloor.deck, ...atFloor.reserve].every((entry) => entry.disabled === true)).toBe(true);
  });

  it("captions a bought copy with at most what was paid, and presents the keeper and Essence", () => {
    const view = buildD97ShopSellView({ run: run(minimumDeckSize + 1, 2), keeper: KEEPER, cards: CARDS, content: CONTENT });
    const bought = view.deck[2];
    expect(bought?.caption).toEqual({ kind: "essence", amount: 10 });
    expect(view.keeper).toMatchObject({ characterId: KEEPER_ID, name: KEEPER_NAME });
    expect(view.essence).toBe(70);
  });
});
