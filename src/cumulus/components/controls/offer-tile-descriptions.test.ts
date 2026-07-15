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
  offerTileLabel,
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
const FOUR_CARDS: OfferTileFourCards = [CARD, CARD, CARD, CARD];
const DREAMSIGN: OfferTileDreamsign = {
  id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
  art: { kind: "dreamsign", imageName: "acorn_gold.png" },
};

const COPY_CASES: ReadonlyArray<
  readonly [OfferTileModel, label: string, description: string]
> = [
  [
    { id: "gift", kind: "card-gift", card: CARD },
    "Card Gift",
    "Add 1 card to your deck.",
  ],
  [
    { id: "draft", kind: "card-draft", cards: FOUR_CARDS },
    "Card Draft",
    "Choose 1 of 4 cards to add to your deck.",
  ],
  [
    { id: "category", kind: "category-draft", cards: FOUR_CARDS },
    "Category Draft",
    "Choose 1 of 4 cards from a shared category to add to your deck.",
  ],
  [
    { id: "transfigured", kind: "transfigured-draft", cards: FOUR_CARDS },
    "Transfigured Draft",
    "Choose 1 of 4 transfigured cards to add to your deck.",
  ],
  [
    {
      id: "copies",
      kind: "copies-draft",
      cards: FOUR_CARDS,
      copyCount: 3,
    },
    "Copies Draft",
    "Choose 1 of 4 cards and add 3 copies of it to your deck.",
  ],
  [
    { id: "bundle", kind: "card-bundle", cards: [CARD, CARD] },
    "Card Bundle",
    "Add all 2 cards to your deck.",
  ],
  [
    { id: "transfigure", kind: "transfigure-card", card: CARD },
    "Transfigure Card",
    "Transfigure 1 card in your deck.",
  ],
  [
    { id: "keyword", kind: "keyword-modification", card: CARD },
    "Keyword Modification",
    "Modify a keyword on 1 card in your deck.",
  ],
  [
    { id: "tribal", kind: "tribal-change", card: CARD },
    "Kindred Change",
    "Change the character type of 1 card in your deck.",
  ],
  [
    { id: "starters", kind: "transfigure-starters", cards: [CARD] },
    "Refine Starters",
    "Transfigure 1 starter card in your deck.",
  ],
  [
    { id: "purge", kind: "purge-card", card: CARD },
    "Purge Card",
    "Purge 1 card from your deck.",
  ],
  [
    {
      id: "trade",
      kind: "trade-card",
      outgoing: CARD,
      incoming: FOUR_CARDS,
    },
    "Trade Card",
    "Purge 1 card and choose 1 of 4 cards to add to your deck.",
  ],
  [
    { id: "duplicate", kind: "duplicate-card", cards: [CARD, CARD] },
    "Duplicate Card",
    "Choose 1 of 2 cards in your deck to duplicate.",
  ],
  [
    { id: "dreamsign-gift", kind: "dreamsign-gift", dreamsign: DREAMSIGN },
    "Dreamsign Gift",
    "Add 1 dreamsign to your collection.",
  ],
  [
    {
      id: "dreamsign-draft",
      kind: "dreamsign-draft",
      dreamsigns: [DREAMSIGN, DREAMSIGN],
    },
    "Dreamsign Draft",
    "Choose 1 of 2 dreamsigns to add to your collection.",
  ],
  [
    {
      id: "site",
      kind: "add-site",
      site: { id: "Duplication", glyph: GLYPHS.copy },
    },
    "Add Site",
    "Add 1 site to the current dreamscape.",
  ],
];

describe("offer tile descriptions", () => {
  it.each(COPY_CASES)(
    "derives exact copy for $0.kind",
    (model, label, description) => {
      expect(offerTileLabel(model)).toBe(label);
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
    ).toBe("Choose 1 of 4 cards and add 1 copy of it to your deck.");
  });
});
