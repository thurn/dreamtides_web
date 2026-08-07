import { describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { MessageFormatter } from "../../hooks/use-messages";
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
    name: asCardName("Fixture Card"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "Spirit Animal",
    isStarter: false,
    energyCost: 2,
    spark: 3,
    isFast: false,
    renderedText: "",
    imageNumber: 1,
    artOwned: true,
  },
};

function card(index: number): OfferTileCard {
  const id = asCardId(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  return {
    ...CARD,
    cardId: id,
    displaySnapshot: {
      ...CARD.displaySnapshot,
      id,
      cardNumber: index,
      name: asCardName(`Fixture ${String(index)}`),
    },
  };
}

const FOUR_CARDS: OfferTileFourCards = [card(1), card(2), card(3), card(4)];
const DREAMSIGN: OfferTileDreamsign = {
  id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
  name: "Fixture Dreamsign",
  art: { kind: "dreamsign", imageName: "fixture.png" },
};

const CASES: ReadonlyArray<
  readonly [model: OfferTileModel, expectedMessageId: string]
> = [
  [{ id: "gift", kind: "card-gift", card: CARD }, "augury-offer-card-gift-description"],
  [{ id: "draft", kind: "card-draft", cards: FOUR_CARDS }, "augury-offer-card-draft-description"],
  [{ id: "copies", kind: "copies-draft", cards: FOUR_CARDS, copyCount: 3 }, "augury-offer-copies-draft-description"],
  [{ id: "category", kind: "category-draft", cards: FOUR_CARDS, category: { kind: "subtype", name: "fixture" } }, "augury-offer-category-draft-description"],
  [{ id: "transfigured", kind: "transfigured-draft", cards: FOUR_CARDS }, "augury-offer-transfigured-draft-description"],
  [{ id: "bundle", kind: "card-bundle", cards: [card(1), card(2)] }, "augury-offer-card-bundle-description"],
  [{ id: "transfigure", kind: "transfigure-card", card: CARD, transfiguration: "Empowered" }, "augury-offer-transfigure-card-description"],
  [{ id: "starters", kind: "transfigure-starters", cards: [card(1), card(2)] }, "augury-offer-transfigure-two-starters-description"],
  [{ id: "keyword", kind: "keyword-modification", card: CARD, reclaimReduction: 1 }, "augury-offer-reclaim-reduction-description"],
  [{ id: "tribal", kind: "tribal-change", card: CARD, newCharacterSubtype: "Warrior" }, "augury-offer-subtype-change-description"],
  [{ id: "purge", kind: "purge-card", card: CARD }, "augury-offer-purge-card-description"],
  [{ id: "trade", kind: "trade-card", outgoing: CARD, incoming: FOUR_CARDS }, "augury-offer-trade-card-description"],
  [{ id: "duplicate", kind: "duplicate-card", cards: [card(1), card(2)] }, "augury-offer-duplicate-card-choice-description"],
  [{ id: "dreamsign", kind: "dreamsign-gift", dreamsign: DREAMSIGN }, "augury-offer-dreamsign-gift-description"],
  [{ id: "dreamsign-draft", kind: "dreamsign-draft", dreamsigns: [DREAMSIGN, DREAMSIGN] }, "augury-offer-dreamsign-draft-description"],
  [{ id: "site", kind: "add-site", site: { id: "Duplication", name: "Duplication", glyph: GLYPHS.copy } }, "augury-offer-add-site-description"],
];

describe("offer tile descriptions", () => {
  it.each(CASES)("selects a typed complete message for $0.kind", (model, expectedMessageId) => {
    const formatter = vi.fn((id: string) => id) as unknown as MessageFormatter;

    expect(offerTileDescription(model, formatter)).toBe(expectedMessageId);
    expect(formatter).toHaveBeenCalledOnce();
  });

  it("passes copy and candidate counts as numbers", () => {
    const formatter = vi.fn((id: string) => id) as unknown as MessageFormatter;

    offerTileDescription(
      { id: "copies", kind: "copies-draft", cards: FOUR_CARDS, copyCount: 2 },
      formatter,
    );
    expect(formatter).toHaveBeenLastCalledWith(
      "augury-offer-copies-draft-description",
      { copyCount: 2 },
    );

    offerTileDescription(
      { id: "duplicate", kind: "duplicate-card", cards: [card(1), card(2), card(3)] },
      formatter,
    );
    expect(formatter).toHaveBeenLastCalledWith(
      "augury-offer-duplicate-card-choice-description",
      { candidateCount: 3 },
    );
  });

  it("passes semantic category variants to Fluent", () => {
    const formatter = vi.fn((id: string) => id) as unknown as MessageFormatter;

    offerTileDescription(
      {
        id: "event",
        kind: "category-draft",
        cards: FOUR_CARDS,
        category: { kind: "event" },
      },
      formatter,
    );
    expect(formatter).toHaveBeenLastCalledWith(
      "augury-offer-category-draft-description",
      { category: "event", categoryName: "" },
    );

    offerTileDescription(
      {
        id: "subtype",
        kind: "category-draft",
        cards: FOUR_CARDS,
        category: { kind: "subtype", name: "Fixture" },
      },
      formatter,
    );
    expect(formatter).toHaveBeenLastCalledWith(
      "augury-offer-category-draft-description",
      { category: "subtype", categoryName: "Fixture" },
    );
  });

  it("selects distinct complete messages for singular semantic variants", () => {
    const formatter = vi.fn((id: string) => id) as unknown as MessageFormatter;

    expect(
      offerTileDescription(
        { id: "starter", kind: "transfigure-starters", cards: [CARD] },
        formatter,
      ),
    ).toBe("augury-offer-transfigure-one-starter-description");
    expect(
      offerTileDescription(
        { id: "duplicate", kind: "duplicate-card", cards: [CARD] },
        formatter,
      ),
    ).toBe("augury-offer-duplicate-one-card-description");
  });

  it("returns localized descriptions as plain rich text", () => {
    const formatter = vi.fn((id: string) => id) as unknown as MessageFormatter;

    expect(
      offerTileRichDescription(
        { id: "gift", kind: "card-gift", card: CARD },
        formatter,
      ),
    ).toEqual({
      kind: "plain",
      text: "augury-offer-card-gift-description",
    });
  });
});
