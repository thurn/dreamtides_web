import { describe, expect, it } from "vitest";
import type { DreamcallerContent } from "../../types/content";
import type { Tides4DeckJson } from "../../draft/pool/tides4-io";
import { largestTides, toDreamcallerOfferView } from "./quest-start-view-model";

function tide(id: string, cardCount: number): Tides4DeckJson {
  return {
    id,
    name: id,
    role: "facet",
    color: "purple",
    cards: Array.from({ length: cardCount }, (_, index) => ({
      id: `${id}-card-${String(index)}`,
      name: `${id}-card-${String(index)}`,
      copies: 1,
    })),
  };
}

function dreamcaller(
  overrides: Partial<DreamcallerContent> = {},
): DreamcallerContent {
  return {
    id: "dc-1",
    name: "The Cartographer",
    title: "Mapper of Sleep",
    renderedText: "Whenever you map a dream, draw a card.",
    imageNumber: "42",
    portraitFocus: { x: 0.42, y: 0.18 },
    startingEssence: 3,
    ...overrides,
  };
}

describe("largestTides", () => {
  it("returns the input unchanged when at or below the cap", () => {
    const tides = [tide("a", 5), tide("b", 3), tide("c", 1)];
    expect(largestTides(tides)).toEqual(tides);
  });

  it("keeps the four largest tides by total card count, in original order", () => {
    const tides = [
      tide("a", 2),
      tide("b", 10),
      tide("c", 1),
      tide("d", 8),
      tide("e", 5),
      tide("f", 3),
    ];
    expect(largestTides(tides).map((t) => t.id)).toEqual(["b", "d", "e", "f"]);
  });

  it("counts copies, not unique card entries", () => {
    const big: Tides4DeckJson = {
      id: "big",
      name: "big",
      role: "facet",
      color: "purple",
      cards: [{ id: "x", name: "x", copies: 20 }],
    };
    const tides = [tide("a", 5), tide("b", 5), tide("c", 5), tide("d", 5), big];
    expect(largestTides(tides)).toHaveLength(4);
    expect(largestTides(tides).map((t) => t.id)).toContain("big");
  });
});

describe("toDreamcallerOfferView", () => {
  it("suppresses signature cards whenever tides exist (tides4 runs show tides instead)", () => {
    const view = toDreamcallerOfferView(
      dreamcaller({
        signatureCards: ["Alpha", "Beta"],
        signatureCardIds: ["uuid-a", "uuid-b"],
      }),
      [tide("t1", 3)],
    );
    expect(view.signatureCards).toEqual([]);
    expect(view.tides.map((t) => t.id)).toEqual(["t1"]);
  });

  it("shows signature cards keyed by their stable UUIDs when there are no tides", () => {
    const view = toDreamcallerOfferView(
      dreamcaller({
        signatureCards: ["Alpha", "Alpha"],
        signatureCardIds: ["uuid-a1", "uuid-a2"],
      }),
      [],
    );
    // Two cards sharing a display name stay distinct because keys come from
    // the index-aligned UUID list, never from the name.
    expect(view.signatureCards).toEqual([
      { id: "uuid-a1", name: "Alpha" },
      { id: "uuid-a2", name: "Alpha" },
    ]);
  });

  it("falls back to a name+index key only when a UUID is missing", () => {
    const view = toDreamcallerOfferView(
      dreamcaller({ signatureCards: ["Alpha"], signatureCardIds: [] }),
      [],
    );
    expect(view.signatureCards).toEqual([{ id: "Alpha-0", name: "Alpha" }]);
  });

  it("copies the Dreamcaller's display fields through unchanged", () => {
    const view = toDreamcallerOfferView(dreamcaller(), []);
    expect(view).toMatchObject({
      id: "dc-1",
      name: "The Cartographer",
      title: "Mapper of Sleep",
      renderedText: "Whenever you map a dream, draw a card.",
      imageNumber: "42",
      portraitFocus: { x: 0.42, y: 0.18 },
      startingEssence: 3,
    });
  });
});
