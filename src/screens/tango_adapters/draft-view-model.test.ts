import { describe, expect, it } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import type { QuestState } from "../../types/quest";
import {
  buildDraftHudView,
  buildDraftView,
  resolveOfferCards,
  sortOfferCards,
} from "./draft-view-model";

function card(overrides: Partial<CardData> & { cardNumber: number }): CardData {
  return {
    name: asCardName(`Card ${String(overrides.cardNumber)}`),
    id: asCardId(`card-${String(overrides.cardNumber)}`),
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "Text.",
    imageNumber: overrides.cardNumber,
    artOwned: false,
    ...overrides,
  };
}

function cardDatabase(cards: CardData[]): Map<number, CardData> {
  return new Map(cards.map((c) => [c.cardNumber, c]));
}

/** A minimal quest state carrying only the fields the HUD builder reads. */
function questState(overrides: Partial<QuestState> = {}): QuestState {
  return {
    essence: 120,
    deck: [],
    dreamcaller: null,
    dreamsigns: [],
    ...overrides,
  } as unknown as QuestState;
}

describe("sortOfferCards", () => {
  it("orders by energy cost ascending, then by name", () => {
    const cards = [
      card({ cardNumber: 3, energyCost: 2, name: asCardName("Zephyr") }),
      card({ cardNumber: 1, energyCost: 1, name: asCardName("Beacon") }),
      card({ cardNumber: 2, energyCost: 2, name: asCardName("Anchor") }),
    ];
    expect(sortOfferCards(cards).map((c) => c.cardNumber)).toEqual([1, 2, 3]);
  });

  it("treats a null energy cost as zero", () => {
    const cards = [
      card({ cardNumber: 1, energyCost: 1 }),
      card({ cardNumber: 2, energyCost: null }),
    ];
    expect(sortOfferCards(cards).map((c) => c.cardNumber)).toEqual([2, 1]);
  });

  it("does not mutate its input", () => {
    const cards = [
      card({ cardNumber: 2, energyCost: 2 }),
      card({ cardNumber: 1, energyCost: 1 }),
    ];
    const before = cards.map((c) => c.cardNumber);
    sortOfferCards(cards);
    expect(cards.map((c) => c.cardNumber)).toEqual(before);
  });
});

describe("resolveOfferCards", () => {
  it("resolves numbers to cards and sorts them", () => {
    const db = cardDatabase([
      card({ cardNumber: 10, energyCost: 3 }),
      card({ cardNumber: 11, energyCost: 1 }),
    ]);
    expect(resolveOfferCards([10, 11], db).map((c) => c.cardNumber)).toEqual([
      11, 10,
    ]);
  });

  it("drops numbers absent from the database rather than rendering a gap", () => {
    const db = cardDatabase([card({ cardNumber: 10 })]);
    expect(resolveOfferCards([10, 999], db).map((c) => c.cardNumber)).toEqual([
      10,
    ]);
  });
});

describe("buildDraftHudView", () => {
  it("reads essence and deck size, with no dreamcaller when absent", () => {
    const hud = buildDraftHudView(
      questState({
        essence: 88,
        deck: [
          { entryId: "a", cardNumber: 1, transfiguration: null, isBane: false },
          { entryId: "b", cardNumber: 2, transfiguration: null, isBane: false },
        ],
      }),
    );
    expect(hud.essence).toBe(88);
    expect(hud.deck).toBe(2);
    expect(hud.dreamcaller).toBeUndefined();
    expect(hud.dreamsigns).toEqual([]);
  });
});

describe("buildDraftView", () => {
  it("assembles the offer, a card-number key, and the HUD; null scene without a node", () => {
    const db = cardDatabase([
      card({ cardNumber: 5, energyCost: 2 }),
      card({ cardNumber: 6, energyCost: 1 }),
    ]);
    const view = buildDraftView({
      offerCardNumbers: [5, 6],
      cardDatabase: db,
      sceneNode: null,
      site: { data: { draftPickCount: 5 } },
      sitePicksCompleted: 0,
      state: questState({ essence: 40 }),
    });
    expect(view.offer.map((c) => c.cardNumber)).toEqual([6, 5]);
    // The key is the offered card numbers (identity), not names.
    expect(view.offerKey).toBe("5,6");
    expect(view.scene).toBeNull();
    expect(view.hud.essence).toBe(40);
  });

  it("derives the 1-indexed pick counter from picks completed and the site's total", () => {
    const view = buildDraftView({
      offerCardNumbers: [1],
      cardDatabase: cardDatabase([card({ cardNumber: 1 })]),
      sceneNode: null,
      site: { data: { draftPickCount: 5 } },
      sitePicksCompleted: 2,
      state: questState(),
    });
    expect(view.pickNumber).toBe(3);
    expect(view.pickTotal).toBe(5);
  });

  it("clamps the pick number so a final pack never reads past the total", () => {
    const view = buildDraftView({
      offerCardNumbers: [1],
      cardDatabase: cardDatabase([card({ cardNumber: 1 })]),
      sceneNode: null,
      site: { data: { draftPickCount: 5 } },
      sitePicksCompleted: 5,
      state: questState(),
    });
    expect(view.pickNumber).toBe(5);
  });

  it("produces an empty offer and key for an exhausted pack", () => {
    const view = buildDraftView({
      offerCardNumbers: [],
      cardDatabase: cardDatabase([]),
      sceneNode: null,
      site: { data: { draftPickCount: 5 } },
      sitePicksCompleted: 0,
      state: questState(),
    });
    expect(view.offer).toEqual([]);
    expect(view.offerKey).toBe("");
  });
});
