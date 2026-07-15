import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import { GLYPHS } from "../../primitives/glyph";
import type {
  OfferTileCard,
  OfferTileDreamsign,
  OfferTileFourCards,
  OfferTileModel,
} from "./OfferTile";
import { offerTileDescription } from "./offer-tile-descriptions";

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
    { id: "category", kind: "category-draft", cards: FOUR_CARDS },
    "Choose a card to add to your deck.",
  ],
  [
    { id: "transfigured", kind: "transfigured-draft", cards: FOUR_CARDS },
    "Choose a card to add to your deck.",
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
    { id: "transfigure", kind: "transfigure-card", card: CARD },
    "Transfigure Test Card.",
  ],
  [
    { id: "keyword", kind: "keyword-modification", card: CARD },
    "Modify a keyword on Test Card.",
  ],
  [
    { id: "tribal", kind: "tribal-change", card: CARD },
    "Change the character type of Test Card.",
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
    "Add one dreamsign to your collection.",
  ],
  [
    {
      id: "dreamsign-draft",
      kind: "dreamsign-draft",
      dreamsigns: [DREAMSIGN, DREAMSIGN],
    },
    "Choose a dreamsign to add to your collection.",
  ],
  [
    {
      id: "site",
      kind: "add-site",
      site: { id: "Duplication", glyph: GLYPHS.copy },
    },
    "Add one site to the current dreamscape.",
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

  it("names one or two bundled cards and counts larger bundles in words", () => {
    expect(
      offerTileDescription({
        id: "three-card-bundle",
        kind: "card-bundle",
        cards: [CARD, SECOND_CARD, THIRD_CARD],
      }),
    ).toBe("Add all three cards to your deck.");
  });

  it("never writes player-facing quantities as numerals", () => {
    for (const [model] of COPY_CASES) {
      expect(offerTileDescription(model)).not.toMatch(/\d/);
    }
  });
});
