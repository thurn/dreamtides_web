import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import { GLYPHS } from "../../primitives/glyph";
import type {
  OfferTileCard,
  OfferTileDreamsign,
  OfferTileFourCards,
  OfferTileModel,
} from "./OfferTile";
import {
  offerTileDescription,
  offerTileRichDescription,
} from "./offer-tile-descriptions";

const CARD: OfferTileCard = {
  cardId: asCardId("7be2e6d7-abff-4c44-a0c3-35460da1693c"),
  displaySnapshot: {
    id: asCardId("7be2e6d7-abff-4c44-a0c3-35460da1693c"),
    name: asCardName("Test Card"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "Spirit Animal",
    isStarter: false,
    energyCost: 2,
    spark: 3,
    isFast: false,
    renderedText: "",
    imageNumber: 287269511,
    artOwned: true,
  },
};
const SECOND_CARD: OfferTileCard = {
  ...CARD,
  cardId: asCardId("161482b6-af07-4d9e-822d-8c738672beb9"),
  displaySnapshot: {
    ...CARD.displaySnapshot,
    id: asCardId("161482b6-af07-4d9e-822d-8c738672beb9"),
    name: asCardName("Second Card"),
    cardNumber: 2,
  },
};
const THIRD_CARD: OfferTileCard = {
  ...CARD,
  cardId: asCardId("b56ef7e8-c634-4d40-ac08-fab591dfbc4a"),
  displaySnapshot: {
    ...CARD.displaySnapshot,
    id: asCardId("b56ef7e8-c634-4d40-ac08-fab591dfbc4a"),
    name: asCardName("Third Card"),
    cardNumber: 3,
  },
};
const FOURTH_CARD: OfferTileCard = {
  ...CARD,
  cardId: asCardId("9b9c2743-75b3-499d-b5fb-c3429c92d420"),
  displaySnapshot: {
    ...CARD.displaySnapshot,
    id: asCardId("9b9c2743-75b3-499d-b5fb-c3429c92d420"),
    name: asCardName("Fourth Card"),
    cardNumber: 4,
  },
};
const FOUR_CARDS: OfferTileFourCards = [
  CARD,
  SECOND_CARD,
  THIRD_CARD,
  FOURTH_CARD,
];
const DREAMSIGN: OfferTileDreamsign = {
  id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
  name: "Rainbow Horn",
  art: { kind: "dreamsign", imageName: "acorn_gold.png" },
};

const COPY_CASES: ReadonlyArray<
  readonly [OfferTileModel, description: string]
> = [
  [
    { id: "gift", kind: "card-gift", card: CARD },
    "Add Test Card to your deck.",
  ],
  [
    { id: "draft", kind: "card-draft", cards: FOUR_CARDS },
    "Choose a card to add to your deck.",
  ],
  [
    {
      id: "category",
      kind: "category-draft",
      cards: FOUR_CARDS,
      categoryName: "warrior",
    },
    "Choose a warrior to add to your deck.",
  ],
  [
    { id: "transfigured", kind: "transfigured-draft", cards: FOUR_CARDS },
    "Choose a transfigured card to add to your deck.",
  ],
  [
    {
      id: "copies",
      kind: "copies-draft",
      cards: FOUR_CARDS,
      copyCount: 3,
    },
    "Choose a card and add three copies of it to your deck.",
  ],
  [
    { id: "bundle", kind: "card-bundle", cards: [CARD, SECOND_CARD] },
    "Add Test Card and Second Card to your deck.",
  ],
  [
    {
      id: "transfigure",
      kind: "transfigure-card",
      card: CARD,
      transfiguration: "Empowered",
    },
    "Transfigure Test Card into its Empowered form.",
  ],
  [
    {
      id: "keyword",
      kind: "keyword-modification",
      card: CARD,
      reclaimReduction: 1,
    },
    "Reduce the Reclaim cost of Test Card by one.",
  ],
  [
    {
      id: "tribal",
      kind: "tribal-change",
      card: CARD,
      newCharacterSubtype: "Warrior",
    },
    "Change the subtype of Test Card to Warrior.",
  ],
  [
    {
      id: "starters",
      kind: "transfigure-starters",
      cards: [CARD, SECOND_CARD],
    },
    "Transfigure Test Card and Second Card.",
  ],
  [
    { id: "purge", kind: "purge-card", card: CARD },
    "Purge Test Card.",
  ],
  [
    {
      id: "trade",
      kind: "trade-card",
      outgoing: CARD,
      incoming: FOUR_CARDS,
    },
    "Purge Test Card and choose a card to replace it.",
  ],
  [
    {
      id: "duplicate",
      kind: "duplicate-card",
      cards: [CARD, SECOND_CARD],
    },
    "Choose Test Card or Second Card to duplicate.",
  ],
  [
    { id: "dreamsign-gift", kind: "dreamsign-gift", dreamsign: DREAMSIGN },
    "Gain Rainbow Horn.",
  ],
  [
    {
      id: "dreamsign-draft",
      kind: "dreamsign-draft",
      dreamsigns: [DREAMSIGN, DREAMSIGN],
    },
    "Choose a dreamsign to gain.",
  ],
  [
    {
      id: "site",
      kind: "add-site",
      site: { id: "Duplication", name: "Duplication", glyph: GLYPHS.copy },
    },
    "Add a duplication site to the current dreamscape.",
  ],
];

describe("offer tile descriptions", () => {
  it.each(COPY_CASES)(
    "derives exact copy for $0.kind",
    (model, description) => {
      expect(offerTileDescription(model)).toBe(description);
    },
  );

  it("uses singular copy wording when a copies draft grants one copy", () => {
    expect(
      offerTileDescription({
        id: "single-copy",
        kind: "copies-draft",
        cards: FOUR_CARDS,
        copyCount: 1,
      }),
    ).toBe("Choose a card and add one copy of it to your deck.");
  });

  it("uses the category's article and exact Reclaim reduction", () => {
    expect(
      offerTileDescription({
        id: "event-category",
        kind: "category-draft",
        cards: FOUR_CARDS,
        categoryName: "event",
      }),
    ).toBe("Choose an event to add to your deck.");
    expect(
      offerTileDescription({
        id: "double-reclaim-reduction",
        kind: "keyword-modification",
        card: CARD,
        reclaimReduction: 2,
      }),
    ).toBe("Reduce the Reclaim cost of Test Card by two.");
  });

  it("names a single duplicate target and counts three choices in words", () => {
    expect(
      offerTileDescription({
        id: "single-duplicate",
        kind: "duplicate-card",
        cards: [CARD],
      }),
    ).toBe("Duplicate Test Card.");
    expect(
      offerTileDescription({
        id: "three-duplicates",
        kind: "duplicate-card",
        cards: [CARD, SECOND_CARD, THIRD_CARD],
      }),
    ).toBe("Choose one of three cards in your deck to duplicate.");
  });

  it("names every bundled card", () => {
    expect(
      offerTileDescription({
        id: "three-card-bundle",
        kind: "card-bundle",
        cards: [CARD, SECOND_CARD, THIRD_CARD],
      }),
    ).toBe("Add Test Card, Second Card, and Third Card to your deck.");
  });

  it("underlines specific card and dreamsign names in InfoCard copy", () => {
    expect(
      offerTileRichDescription({ id: "gift", kind: "card-gift", card: CARD }),
    ).toEqual({
      kind: "inline",
      parts: [
        { kind: "plain", text: "Add " },
        { kind: "underline", text: "Test Card" },
        { kind: "plain", text: " to your deck." },
      ],
    });
    expect(
      offerTileRichDescription({
        id: "sign",
        kind: "dreamsign-gift",
        dreamsign: DREAMSIGN,
      }),
    ).toEqual({
      kind: "inline",
      parts: [
        { kind: "plain", text: "Gain " },
        { kind: "underline", text: "Rainbow Horn" },
        { kind: "plain", text: "." },
      ],
    });
  });

  it("never writes player-facing quantities as numerals", () => {
    for (const [model] of COPY_CASES) {
      expect(offerTileDescription(model)).not.toMatch(/\d/);
    }
  });
});
