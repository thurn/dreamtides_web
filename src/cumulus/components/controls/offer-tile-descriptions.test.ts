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
    "Add a card to your deck.",
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
    "Choose a card from a single category to add to your deck.",
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
    "Add two cards to your deck.",
  ],
  [
    {
      id: "transfigure",
      kind: "transfigure-card",
      card: CARD,
      transfiguration: "Empowered",
    },
    "Transfigure a card in your deck.",
  ],
  [
    {
      id: "keyword",
      kind: "keyword-modification",
      card: CARD,
      reclaimReduction: 1,
    },
    "Reduce the Reclaim cost of a card.",
  ],
  [
    {
      id: "tribal",
      kind: "tribal-change",
      card: CARD,
      newCharacterSubtype: "Warrior",
    },
    "Change the subtype of a card.",
  ],
  [
    {
      id: "starters",
      kind: "transfigure-starters",
      cards: [CARD, SECOND_CARD],
    },
    "Transfigure two starter cards.",
  ],
  [
    { id: "purge", kind: "purge-card", card: CARD },
    "Purge a card from your deck.",
  ],
  [
    {
      id: "trade",
      kind: "trade-card",
      outgoing: CARD,
      incoming: FOUR_CARDS,
    },
    "Purge a card and choose a card to replace it.",
  ],
  [
    {
      id: "duplicate",
      kind: "duplicate-card",
      cards: [CARD, SECOND_CARD],
    },
    "Choose one of two cards in your deck to duplicate.",
  ],
  [
    { id: "dreamsign-gift", kind: "dreamsign-gift", dreamsign: DREAMSIGN },
    "Gain a dreamsign.",
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
    "Add a site to the current dreamscape.",
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

  it("counts one or two starter cards explicitly", () => {
    expect(
      offerTileDescription({
        id: "one-starter",
        kind: "transfigure-starters",
        cards: [CARD],
      }),
    ).toBe("Transfigure one starter card.");
    expect(
      offerTileDescription({
        id: "two-starters",
        kind: "transfigure-starters",
        cards: [CARD, SECOND_CARD],
      }),
    ).toBe("Transfigure two starter cards.");
  });

  it("keeps category and Reclaim details nonspecific", () => {
    expect(
      offerTileDescription({
        id: "event-category",
        kind: "category-draft",
        cards: FOUR_CARDS,
        categoryName: "event",
      }),
    ).toBe("Choose a card from a single category to add to your deck.");
    expect(
      offerTileDescription({
        id: "double-reclaim-reduction",
        kind: "keyword-modification",
        card: CARD,
        reclaimReduction: 2,
      }),
    ).toBe("Reduce the Reclaim cost of a card.");
  });

  it("describes duplicate targets without names and counts multiple choices", () => {
    expect(
      offerTileDescription({
        id: "single-duplicate",
        kind: "duplicate-card",
        cards: [CARD],
      }),
    ).toBe("Duplicate a card in your deck.");
    expect(
      offerTileDescription({
        id: "three-duplicates",
        kind: "duplicate-card",
        cards: [CARD, SECOND_CARD, THIRD_CARD],
      }),
    ).toBe("Choose one of three cards in your deck to duplicate.");
  });

  it("counts bundled cards without naming them", () => {
    expect(
      offerTileDescription({
        id: "three-card-bundle",
        kind: "card-bundle",
        cards: [CARD, SECOND_CARD, THIRD_CARD],
      }),
    ).toBe("Add three cards to your deck.");
  });

  it("keeps InfoCard copy plain and nonspecific", () => {
    expect(
      offerTileRichDescription({ id: "gift", kind: "card-gift", card: CARD }),
    ).toEqual({ kind: "plain", text: "Add a card to your deck." });
    expect(
      offerTileRichDescription({
        id: "sign",
        kind: "dreamsign-gift",
        dreamsign: DREAMSIGN,
      }),
    ).toEqual({ kind: "plain", text: "Gain a dreamsign." });
  });

  it("never exposes model-provided names or named attributes", () => {
    const forbidden = [
      "Test Card",
      "Second Card",
      "Third Card",
      "Fourth Card",
      "Rainbow Horn",
      "Duplication",
      "warrior",
      "Empowered",
      "Warrior",
    ];
    for (const [model] of COPY_CASES) {
      const copy = offerTileDescription(model);
      for (const name of forbidden) {
        expect(copy).not.toContain(name);
      }
    }
  });

  it("never writes player-facing quantities as numerals", () => {
    for (const [model] of COPY_CASES) {
      expect(offerTileDescription(model)).not.toMatch(/\d/);
    }
  });
});
