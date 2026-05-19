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
          sourceTides: [
            {
              tideId: "core",
              displayName: "Core",
              requirement: "required",
              role: "supporting",
            },
            {
              tideId: "support-a",
              displayName: "Support A",
              requirement: "optional",
              role: "supporting",
            },
          ],
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
      sourceTides: [],
      isFallback: true,
    });
  });

  it("labels source tide roles from configured tide metadata", () => {
    const result = buildCardSourceDebugState(
      "Draft Picks",
      "Draft",
      [
        makeCard(2, "Banner Patrol", [
          "ally_formation",
          "cheap_curve",
          "fast_setup",
        ]),
      ],
      {
        ...makeResolvedPackage(),
        mandatoryTides: ["ally_formation"],
        optionalSubset: ["cheap_curve", "fast_setup"],
        selectedTides: ["ally_formation", "cheap_curve", "fast_setup"],
      },
    );

    expect(result?.entries[0]?.sourceTides).toEqual([
      {
        tideId: "ally_formation",
        displayName: "Banner Formation",
        requirement: "required",
        role: "structural",
      },
      {
        tideId: "cheap_curve",
        displayName: "First-Light Muster",
        requirement: "optional",
        role: "utility",
      },
      {
        tideId: "fast_setup",
        displayName: "Quick Lattice",
        requirement: "optional",
        role: "supporting",
      },
    ]);
  });

  it("returns null when no cards are visible", () => {
    expect(
      buildCardSourceDebugState("Battle Rewards", "BattleReward", [], null),
    ).toBeNull();
  });
});
