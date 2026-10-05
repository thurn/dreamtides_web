import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../testing/annotated-text";
import { parseCardName } from "../../../types/card-identity";
import type { AuguryArchetypeData } from "../../../types/augury-data";
import type { CardData } from "../../../types/cards";
import type { OfferTileModel } from "./OfferTile";
import {
  auguryOfferHeadline,
  offerTileDescription,
  offerTileRichDescription,
} from "./offer-tile-descriptions";
import { testCardId, testOfferTileId } from "../../../types/test-identities";

expect.addEqualityTesters([annotatedTextEquality]);

const CARD: Readonly<CardData> = {
  id: testCardId("7be2e6d7-abff-4c44-a0c3-35460da1693c"),
  name: parseCardName("Fixture Card"),
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
    const model: OfferTileModel = { id: testOfferTileId("gift"), kind: "card-gift", card: CARD };
    const presentation = textPresentation(
      "Fixture headline",
      "Target {cardName}",
    );

    expect(auguryOfferHeadline(model, presentation)).toBe(
      "Fixture headline",
    );
    expect(offerTileDescription(model, presentation)).toBe(
      "Target Fixture Card",
    );
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
      id: testOfferTileId("one"),
      kind: "duplicate-card",
      cards: [CARD],
    };
    const two: OfferTileModel = {
      id: testOfferTileId("two"),
      kind: "duplicate-card",
      cards: [CARD, CARD],
    };

    expect(offerTileDescription(one, presentation)).toBe(
      "Fixture singular 1",
    );
    expect(offerTileDescription(two, presentation)).toBe(
      "Fixture plural 2",
    );
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
        subtype: "Fixture subtype {subtypeName}",
        package: "Fixture package {packageReference}",
      },
    };
    const model: OfferTileModel = {
      id: testOfferTileId("category"),
      kind: "category-draft",
      cards: [CARD, CARD],
      category: { kind: "subtype", name: "Spirit Animal" },
    };

    expect(offerTileDescription(model, presentation)).toBe(
      "Fixture subtype Spirit Animal",
    );

    const packageModel: OfferTileModel = {
      id: testOfferTileId("package-category"),
      kind: "category-draft",
      cards: [CARD, CARD],
      category: {
        kind: "package",
        name: "Fixture Tide package",
      },
    };
    expect(
      offerTileDescription(packageModel, presentation),
    ).toBe("Fixture package Fixture Tide package");
  });

  it("rejects copy whose placeholders do not match the offer model", () => {
    const model: OfferTileModel = {
      id: testOfferTileId("draft"),
      kind: "card-draft",
      cards: [CARD, CARD],
    };
    const presentation = textPresentation(
      "Fixture headline",
      "Missing {cardName}",
    );

    expect(() =>
      offerTileDescription(model, presentation),
    ).toThrow(/missing value for \{cardName\}/u);
  });

  it("keeps surfaced identities out of hover copy", () => {
    const model: OfferTileModel = {
      id: testOfferTileId("gift"),
      kind: "card-gift",
      card: CARD,
    };
    const presentation = textPresentation(
      "Fixture headline",
      "Target {cardName}",
    );
    const richDescription = offerTileRichDescription(model, presentation);

    expect(richDescription.kind).toBe("plain");
    if (richDescription.kind !== "plain") return;
    expect(richDescription.text).toBe(
      auguryOfferHeadline(model, presentation),
    );
    expect(richDescription.text).not.toBe(
      offerTileDescription(model, presentation),
    );
  });

  it("rejects identity placeholders in generic headlines", () => {
    const model: OfferTileModel = {
      id: testOfferTileId("gift"),
      kind: "card-gift",
      card: CARD,
    };
    const presentation = textPresentation("Target {cardName}", "Fixture body");

    expect(() => offerTileRichDescription(model, presentation)).toThrow(
      /missing value for \{cardName\}/u,
    );
  });
});
