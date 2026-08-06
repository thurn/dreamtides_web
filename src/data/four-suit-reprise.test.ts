import { describe, expect, it } from "vitest";
import {
  FOUR_SUIT_REPRISE_OUTCOMES,
  eligibleFourSuitRepriseTargets,
  fourSuitRepriseDrawCost,
  fourSuitRepriseOutcomeForSuit,
} from "./four-suit-reprise";

describe("Four-Suit Reprise rules", () => {
  it("maps every suit to exactly one deck effect", () => {
    expect(FOUR_SUIT_REPRISE_OUTCOMES.map((rule) => rule.suit)).toEqual([
      "spades",
      "diamonds",
      "hearts",
      "clubs",
    ]);
    expect(fourSuitRepriseOutcomeForSuit("spades")).toBe("transfiguration");
    expect(fourSuitRepriseOutcomeForSuit("diamonds")).toBe("essence");
    expect(fourSuitRepriseOutcomeForSuit("hearts")).toBe("duplication");
    expect(fourSuitRepriseOutcomeForSuit("clubs")).toBe("purge");
  });

  it("applies the Farpoint price", () => {
    expect(fourSuitRepriseDrawCost(false)).toBe(25);
    expect(fourSuitRepriseDrawCost(true)).toBe(15);
  });

  it("keeps only live, unused, untransfigured target entries", () => {
    const targets = [
      { entryId: "entry-1", cardId: "card-1", cardNumber: 1 },
      { entryId: "entry-2", cardId: "card-2", cardNumber: 2 },
      { entryId: "entry-3", cardId: "card-3", cardNumber: 3 },
      { entryId: "entry-4", cardId: "card-4", cardNumber: 4 },
    ];
    expect(eligibleFourSuitRepriseTargets({
      targets,
      usedCardIds: ["card-1"],
      deck: [
        { entryId: "entry-1", cardNumber: 1, isBane: false, transfiguration: null },
        { entryId: "entry-2", cardNumber: 2, isBane: false, transfiguration: null },
        { entryId: "entry-3", cardNumber: 3, isBane: true, transfiguration: null },
        { entryId: "entry-4", cardNumber: 4, isBane: false, transfiguration: "Empowered" },
      ],
    })).toEqual([targets[1]]);
  });
});
