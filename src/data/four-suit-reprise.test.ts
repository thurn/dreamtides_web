import { describe, expect, it } from "vitest";
import {
  eligibleFourSuitRepriseTargets,
  fourSuitRepriseDrawCost,
  fourSuitRepriseOutcomeForSuit,
} from "./four-suit-reprise";
import { gambleGameByRulesKind } from "./gamble-data";
import { gambleFixture } from "../testing/gamble-fixture";

describe("Four-Suit Reprise rules", () => {
  it("maps every suit to exactly one deck effect", () => {
    const rules = gambleGameByRulesKind(
      gambleFixture(),
      "fourSuitReprise",
    ).rules;
    expect(rules.outcomes.map((rule) => rule.suit)).toEqual([
      "spades",
      "diamonds",
      "hearts",
      "clubs",
    ]);
    expect(fourSuitRepriseOutcomeForSuit(rules, "spades")).toBe(
      "transfiguration",
    );
    expect(fourSuitRepriseOutcomeForSuit(rules, "diamonds")).toBe("essence");
    expect(fourSuitRepriseOutcomeForSuit(rules, "hearts")).toBe("duplication");
    expect(fourSuitRepriseOutcomeForSuit(rules, "clubs")).toBe("purge");
  });

  it("applies the Farpoint price", () => {
    const economy = {
      kind: "fourSuitReprise" as const,
      standardDrawPrice: 10,
      enhancedDrawPrice: 0,
      essenceReward: 100,
    };
    expect(fourSuitRepriseDrawCost(economy, false)).toBe(10);
    expect(fourSuitRepriseDrawCost(economy, true)).toBe(0);
  });

  it("keeps only live, unused, untransfigured target entries", () => {
    const targets = [
      { entryId: "entry-1", cardId: "card-1", cardNumber: 1 },
      { entryId: "entry-2", cardId: "card-2", cardNumber: 2 },
      { entryId: "entry-3", cardId: "card-3", cardNumber: 3 },
      { entryId: "entry-4", cardId: "card-4", cardNumber: 4 },
    ];
    expect(
      eligibleFourSuitRepriseTargets({
        targets,
        usedCardIds: ["card-1"],
        deck: [
          {
            entryId: "entry-1",
            cardNumber: 1,
            isBane: false,
            transfiguration: null,
          },
          {
            entryId: "entry-2",
            cardNumber: 2,
            isBane: false,
            transfiguration: null,
          },
          {
            entryId: "entry-3",
            cardNumber: 3,
            isBane: true,
            transfiguration: null,
          },
          {
            entryId: "entry-4",
            cardNumber: 4,
            isBane: false,
            transfiguration: "Empowered",
          },
        ],
      }),
    ).toEqual([targets[1]]);
  });
});
