// D97 shop view-model rules: slots show their fixed quotes, bought slots are
// purchased and unaffordable ones disabled; the restock reads as used once
// spent; the sell panel captions each copy with its guarded sale quote and
// marks the collection floor.

import { describe, expect, it } from "vitest";
import { D97_SHOP } from "../../../content/d97/shop";
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
  const copy = (ordinal: number, zone: "deck" | "reserve", provenance: object) => ({
    copyId: parseD97OwnedCopyId(`00000000-0000-4000-8000-0000000000${String(ordinal).padStart(2, "0")}`),
    cardId: CARD_A,
    zone,
    modifications: [],
    provenance: { battleCount: 0, ...provenance },
  });
  const run = (copies: readonly ReturnType<typeof copy>[]) => ({ essence: 70, collection: { copies, nextCopyOrdinal: copies.length } }) as unknown as D97Run;

  it("captions each copy with its guarded sale quote, by zone", () => {
    const view = buildD97ShopSellView({
      run: run([copy(1, "deck", { channel: "starting" }), copy(2, "reserve", { channel: "shop", price: 10 })]),
      keeper: KEEPER,
      cards: CARDS,
      collectionFloor: 1,
      minimumDeckSize: 0,
      tuning: D97_SHOP,
    });
    // An Uncommon 2-cost Event: v = max(60 × 2, 100) = 120, sale = 5 × floor(120 × 3 / 50) = 35.
    expect(view.deck.map((entry) => entry.caption)).toEqual([{ kind: "essence", amount: 35 }]);
    expect(view.reserve.map((entry) => entry.caption)).toEqual([{ kind: "essence", amount: 10 }]);
    expect(view.atFloor).toBe(false);
    expect(view.deckAtMinimum).toBe(false);
    expect(view.keeper).toMatchObject({ characterId: KEEPER_ID, name: KEEPER_NAME });
    expect(view.essence).toBe(70);
  });

  it("marks the collection floor", () => {
    const view = buildD97ShopSellView({ keeper: null, run: run([copy(1, "deck", { channel: "starting" })]), cards: CARDS, collectionFloor: 1, minimumDeckSize: 0, tuning: D97_SHOP });
    expect(view.atFloor).toBe(true);
  });

  it("marks a deck at its minimum size, with reserve copies still above the floor", () => {
    const copies = [copy(1, "deck", { channel: "starting" }), copy(2, "reserve", { channel: "shop", price: 10 })];
    const atMinimum = buildD97ShopSellView({ keeper: null, run: run(copies), cards: CARDS, collectionFloor: 1, minimumDeckSize: 1, tuning: D97_SHOP });
    expect(atMinimum).toMatchObject({ atFloor: false, deckAtMinimum: true });
    const above = buildD97ShopSellView({ keeper: null, run: run(copies), cards: CARDS, collectionFloor: 1, minimumDeckSize: 0, tuning: D97_SHOP });
    expect(above.deckAtMinimum).toBe(false);
  });
});
