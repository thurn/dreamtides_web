// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { CardData } from "../../types/cards";
import type { DeckEntry } from "../../types/journey";
import { asCardId, asCardName } from "../../types/card-identity";
import { buildStartingDeckView as buildStartingDeckViewImpl } from "./starting-deck-view-model";
import { JOURNEY_DATA_FIXTURE } from "../../testing/journey-data-fixture";

const buildStartingDeckView = (
  deck: readonly DeckEntry[],
  cardDatabase: Map<number, CardData>,
) =>
  buildStartingDeckViewImpl(
    deck,
    cardDatabase,
    JOURNEY_DATA_FIXTURE.presentation.startingDeck,
  );

function makeCardDatabase(): Map<number, CardData> {
  return new Map<number, CardData>([
    [
      1,
      {
        name: asCardName("Archive Sentry"),
        id: asCardId("archive-sentry"),
        cardNumber: 1,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 3,
        spark: 1,
        isFast: false,
        renderedText: "Hold the line.",
        imageNumber: 1,
        artOwned: true,
      },
    ],
    [
      2,
      {
        name: asCardName("Glimpse of What Was"),
        id: asCardId("glimpse"),
        cardNumber: 2,
        cardType: "Event",
        subtype: "",
        isStarter: false,
        energyCost: 1,
        spark: null,
        isFast: false,
        renderedText: "Draw a card.",
        imageNumber: 2,
        artOwned: true,
      },
    ],
  ]);
}

function makeDeck(): DeckEntry[] {
  return [
    { entryId: "entry-1", cardNumber: 1, transfiguration: null, isBane: false },
    { entryId: "entry-2", cardNumber: 2, transfiguration: null, isBane: false },
  ];
}

describe("buildStartingDeckView", () => {
  it("resolves each deck entry to its card, keyed by entryId with its rules text", () => {
    const view = buildStartingDeckView(makeDeck(), makeCardDatabase());

    expect(view.cards).toHaveLength(2);
    const [first, second] = view.cards;
    // Keyed by the stable entry id, never the card name.
    expect(first?.entryId).toBe("entry-1");
    expect(second?.entryId).toBe("entry-2");
    // The resolved card is carried through with its rules text (GameCard reads
    // that text directly for its folded-in hover glossary help).
    expect(first?.model.displaySnapshot.cardNumber).toBe(1);
    expect(first?.model.displaySnapshot.renderedText).toBe("Hold the line.");
    expect(second?.model.displaySnapshot.renderedText).toBe("Draw a card.");
    // The test hook is derived from the entry id.
    expect(first?.testId).toContain("entry-1");
  });

  it("preserves acquisition order", () => {
    // A deck whose entries are out of card-number order still resolves in the
    // order the entries were acquired.
    const deck: DeckEntry[] = [
      {
        entryId: "entry-2",
        cardNumber: 2,
        transfiguration: null,
        isBane: false,
      },
      {
        entryId: "entry-1",
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
      },
    ];

    const view = buildStartingDeckView(deck, makeCardDatabase());

    expect(view.cards.map((c) => c.entryId)).toEqual(["entry-2", "entry-1"]);
  });

  it("drops an entry whose card is not in the database", () => {
    const deck: DeckEntry[] = [
      {
        entryId: "entry-1",
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
      },
      // cardNumber 99 is absent from the database.
      {
        entryId: "entry-missing",
        cardNumber: 99,
        transfiguration: null,
        isBane: false,
      },
      {
        entryId: "entry-2",
        cardNumber: 2,
        transfiguration: null,
        isBane: false,
      },
    ];

    const view = buildStartingDeckView(deck, makeCardDatabase());

    expect(view.cards.map((c) => c.entryId)).toEqual(["entry-1", "entry-2"]);
  });

  it("applies a debug stat override to the resolved card", () => {
    const deck: DeckEntry[] = [
      {
        entryId: "entry-1",
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
        statOverride: { energyCost: 7 },
      },
    ];

    const view = buildStartingDeckView(deck, makeCardDatabase());

    expect(view.cards[0]?.model.displaySnapshot.energyCost).toBe(7);
  });

  it("applies a persistent spark bonus to the resolved card", () => {
    const deck: DeckEntry[] = [
      {
        entryId: "entry-1",
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
        sparkBonus: 2,
      },
    ];

    const view = buildStartingDeckView(deck, makeCardDatabase());

    expect(view.cards[0]?.model.displaySnapshot.spark).toBe(3);
  });
});
