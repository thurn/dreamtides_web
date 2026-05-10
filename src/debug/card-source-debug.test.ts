import { describe, expect, it } from "vitest";
import { buildCardSourceDebugState } from "./card-source-debug";
import type { CardData } from "../types/cards";
import type { ResolvedDreamcallerPackage } from "../types/content";

function makeCard(
  cardNumber: number,
  name: string,
  tides: string[],
): CardData {
  return {
    name,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    tides,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeResolvedPackage(): ResolvedDreamcallerPackage {
  return {
    dreamcaller: {
      id: "caller-1",
      name: "Caller",
      title: "Debug Witness",
      renderedText: "Test rules text.",
      imageNumber: "0009",
      startingEssence: 250,
      mandatoryTides: ["core"],
      optionalTides: ["support-a", "support-b", "support-c"],
    },
    mandatoryTides: ["core"],
    optionalSubset: ["support-a", "support-b"],
    selectedTides: ["core", "support-a", "support-b"],
    draftPoolCopiesByCard: { "1": 2 },
    dreamsignPoolIds: ["sign-1"],
    mandatoryOnlyPoolSize: 120,
    draftPoolSize: 200,
    doubledCardCount: 10,
    legalSubsetCount: 3,
    preferredSubsetCount: 1,
  };
}

describe("buildCardSourceDebugState", () => {
  it("splits matching tides between required and optional selections", () => {
    const result = buildCardSourceDebugState(
      "Draft Picks",
      "Draft",
      [makeCard(1, "Lantern Witness", ["support-a", "core", "outsider"])],
      makeResolvedPackage(),
    );

    expect(result).toEqual({
      screenLabel: "Draft Picks",
      surface: "Draft",
      entries: [
        {
          cardNumber: 1,
          cardName: "Lantern Witness",
          cardTides: ["core", "outsider", "support-a"],
          matchedMandatoryTides: ["core"],
          matchedOptionalTides: ["support-a"],
          isFallback: false,
        },
      ],
    });
  });

  it("marks cards with no selected tide overlap as fallbacks", () => {
    const result = buildCardSourceDebugState(
      "Shop Offers",
      "Shop",
      [makeCard(7, "Wandering Relic", ["outsider"])],
      makeResolvedPackage(),
    );

    expect(result?.entries[0]).toEqual({
      cardNumber: 7,
      cardName: "Wandering Relic",
      cardTides: ["outsider"],
      matchedMandatoryTides: [],
      matchedOptionalTides: [],
      isFallback: true,
    });
  });

  it("returns null when no cards are visible", () => {
    expect(
      buildCardSourceDebugState("Battle Rewards", "BattleReward", [], null),
    ).toBeNull();
  });
});
