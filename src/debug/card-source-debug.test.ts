import { describe, expect, it } from "vitest";
import { buildCardSourceDebugState } from "./card-source-debug";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
import type { ResolvedDreamcallerPackage } from "../types/content";

function makeCard(cardNumber: number, name: string): CardData {
  return {
    name: asCardName(name),
    id: asCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
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
      signatureCards: ["Lantern Witness"],
    },
    draftPoolCopiesByCard: { "2": 2, "7": 1 },
    dreamsignPoolIds: ["sign-1"],
    mandatoryOnlyPoolSize: 200,
    draftPoolSize: 200,
    doubledCardCount: 10,
    legalSubsetCount: 1,
    preferredSubsetCount: 1,
    starterDecklistCardNumbers: [1],
  };
}

describe("buildCardSourceDebugState", () => {
  it("flags cards that belong to the dreamcaller's starter decklist", () => {
    const result = buildCardSourceDebugState(
      "Draft Picks",
      "Draft",
      [makeCard(1, "Lantern Witness")],
      makeResolvedPackage(),
    );

    expect(result).toEqual({
      screenLabel: "Draft Picks",
      surface: "Draft",
      entries: [
        {
          cardNumber: 1,
          cardName: "Lantern Witness",
          inStarterDecklist: true,
          draftPoolCopies: 0,
        },
      ],
    });
  });

  it("reports the draft-pool copy count for non-starter cards", () => {
    const result = buildCardSourceDebugState(
      "Shop Offers",
      "Shop",
      [makeCard(2, "Banner Patrol"), makeCard(7, "Wandering Relic")],
      makeResolvedPackage(),
    );

    expect(result?.entries).toEqual([
      {
        cardNumber: 2,
        cardName: "Banner Patrol",
        inStarterDecklist: false,
        draftPoolCopies: 2,
      },
      {
        cardNumber: 7,
        cardName: "Wandering Relic",
        inStarterDecklist: false,
        draftPoolCopies: 1,
      },
    ]);
  });

  it("reports zero copies for cards outside the draft pool", () => {
    const result = buildCardSourceDebugState(
      "Shop Offers",
      "Shop",
      [makeCard(9, "Outsider Wisp")],
      makeResolvedPackage(),
    );

    expect(result?.entries[0]).toEqual({
      cardNumber: 9,
      cardName: "Outsider Wisp",
      inStarterDecklist: false,
      draftPoolCopies: 0,
    });
  });

  it("falls back to zero copies when there is no resolved package", () => {
    const result = buildCardSourceDebugState(
      "Draft Picks",
      "Draft",
      [makeCard(3, "Stray Echo")],
      null,
    );

    expect(result?.entries[0]).toEqual({
      cardNumber: 3,
      cardName: "Stray Echo",
      inStarterDecklist: false,
      draftPoolCopies: 0,
    });
  });

  it("returns null when no cards are visible", () => {
    expect(
      buildCardSourceDebugState("Battle Rewards", "BattleReward", [], null),
    ).toBeNull();
  });
});
