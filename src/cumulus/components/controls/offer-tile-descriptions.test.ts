import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { AuguryArchetypeData } from "../../../types/augury-data";
import type { OfferTileCard, OfferTileModel } from "./OfferTile";
import {
  auguryOfferHeadline,
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

const textPresentation = (
  headline: string,
  subtitle: string,
): AuguryArchetypeData["presentation"] => ({
  headline: { kind: "text", text: headline },
  subtitle: { kind: "text", text: subtitle },
});

describe("offer tile descriptions", () => {
  it("interpolates semantic values into authored text", () => {
    const model: OfferTileModel = { id: "gift", kind: "card-gift", card: CARD };
    const presentation = textPresentation("Fixture headline", "Target {cardName}");

    expect(auguryOfferHeadline(model, presentation)).toBe("Fixture headline");
    expect(offerTileDescription(model, presentation)).toBe("Target \u2068Fixture Card\u2069");
  });

  it("selects authored count branches from the surfaced offer", () => {
    const presentation: AuguryArchetypeData["presentation"] = {
      headline: { kind: "text", text: "Fixture headline" },
      subtitle: {
        kind: "count",
        one: "Fixture singular {count}",
        other: "Fixture plural {count}",
      },
    };
    const one: OfferTileModel = {
      id: "one",
      kind: "duplicate-card",
      cards: [CARD],
    };
    const two: OfferTileModel = {
      id: "two",
      kind: "duplicate-card",
      cards: [CARD, CARD],
    };

    expect(offerTileDescription(one, presentation)).toBe("Fixture singular \u20681\u2069");
    expect(offerTileDescription(two, presentation)).toBe("Fixture plural \u20682\u2069");
  });

  it("selects authored category branches and interpolates named categories", () => {
    const presentation: AuguryArchetypeData["presentation"] = {
      headline: { kind: "text", text: "Fixture headline" },
      subtitle: {
        kind: "category",
        character: "Fixture character",
        event: "Fixture event",
        cheap: "Fixture cheap",
        midCost: "Fixture mid-cost",
        expensive: "Fixture expensive",
        fast: "Fixture fast",
        subtype: "Fixture subtype {categoryName}",
        package: "Fixture package {categoryName}",
      },
    };
    const model: OfferTileModel = {
      id: "category",
      kind: "category-draft",
      cards: [CARD, CARD],
      category: { kind: "subtype", name: "Spirit Animal" },
    };

    expect(offerTileDescription(model, presentation)).toBe(
      "Fixture subtype \u2068Spirit Animal\u2069",
    );
  });

  it("rejects copy whose placeholders do not match the offer model", () => {
    const model: OfferTileModel = { id: "draft", kind: "card-draft", cards: [CARD, CARD] };
    const presentation = textPresentation("Fixture headline", "Missing {cardName}");

    expect(() => offerTileDescription(model, presentation)).toThrow(
      /missing value for \{cardName\}/u,
    );
  });

  it("returns authored descriptions as plain rich text", () => {
    const model: OfferTileModel = { id: "gift", kind: "card-gift", card: CARD };
    const presentation = textPresentation("Fixture headline", "Fixture body");

    expect(offerTileRichDescription(model, presentation)).toEqual({
      kind: "plain",
      text: "Fixture body",
    });
  });
});
