import { describe, expect, it } from "vitest";
import {
  makeMerchantTestCard,
  makeMerchantTestDreamsignTemplate,
} from "../journey_v2/testing/fixtures";
import {
  nextTidemarkLadderClimbAttemptNumber,
  rankWinsTidemarkLadderClimbAttempt,
  scoreTidemarkLadderClimbDreamsignCandidates,
  tidemarkLadderClimbAttemptCost,
} from "./tidemark-ladder-climb";
import { gambleGameByRulesKind } from "./gamble-data";
import { gambleFixture } from "../testing/gamble-fixture";
import {
  buildAffinityContext,
  buildTideAffinityIndex,
} from "../selection/tide-affinity";
import { testDreamsignId, testTideId, testCardId } from "../types/test-identities";

describe("Tidemark Ladder Climb rules", () => {
  const economy = {
    kind: "ladderClimb" as const,
    winEssence: 37,
    attempts: [2, 7, 13, 23].map((standardCost, index) => ({
      attempt: (index + 1) as 1 | 2 | 3 | 4,
      standardCost,
      enhancedCost: 1,
    })),
  };
  it("uses the four inclusive thresholds and Farpoint-only cost schedule", () => {
    const rules = gambleGameByRulesKind(gambleFixture(), "ladderClimb").rules;
    expect(economy.winEssence).toBe(37);
    expect(rankWinsTidemarkLadderClimbAttempt(rules, "Q", 1)).toBe(true);
    expect(rankWinsTidemarkLadderClimbAttempt(rules, "J", 1)).toBe(false);
    expect(rankWinsTidemarkLadderClimbAttempt(rules, "10", 2)).toBe(true);
    expect(rankWinsTidemarkLadderClimbAttempt(rules, "9", 2)).toBe(false);
    expect(rankWinsTidemarkLadderClimbAttempt(rules, "8", 3)).toBe(true);
    expect(rankWinsTidemarkLadderClimbAttempt(rules, "7", 3)).toBe(false);
    expect(rankWinsTidemarkLadderClimbAttempt(rules, "6", 4)).toBe(true);
    expect(rankWinsTidemarkLadderClimbAttempt(rules, "5", 4)).toBe(false);
    expect(
      [1, 2, 3, 4].map((attempt) =>
        tidemarkLadderClimbAttemptCost(
          economy,
          attempt as 1 | 2 | 3 | 4,
          false,
        ),
      ),
    ).toEqual([2, 7, 13, 23]);
    expect(
      [1, 2, 3, 4].map((attempt) =>
        tidemarkLadderClimbAttemptCost(economy, attempt as 1 | 2 | 3 | 4, true),
      ),
    ).toEqual([1, 1, 1, 1]);
  });

  it("owns the shared next-attempt eligibility contract", () => {
    const rules = gambleGameByRulesKind(gambleFixture(), "ladderClimb").rules;
    const card = { rank: "2", suit: "clubs" } as const;
    const settledMiss = {
      attemptNumber: 1,
      card,
      won: false,
      costPaid: 0,
      cumulativeCost: 0,
      resultSettled: true,
      dreamsignAwarded: false,
      pendingDreamsignReplacement: false,
    } as const;

    expect(
      nextTidemarkLadderClimbAttemptNumber(rules, {
        revealedCards: [],
        result: null,
      }),
    ).toBe(1);
    expect(
      nextTidemarkLadderClimbAttemptNumber(rules, {
        revealedCards: [card],
        result: settledMiss,
      }),
    ).toBe(2);
    expect(
      nextTidemarkLadderClimbAttemptNumber(rules, {
        revealedCards: [card],
        result: { ...settledMiss, resultSettled: false },
      }),
    ).toBeNull();
    expect(
      nextTidemarkLadderClimbAttemptNumber(rules, {
        revealedCards: [card],
        result: { ...settledMiss, won: true },
      }),
    ).toBeNull();
    expect(
      nextTidemarkLadderClimbAttemptNumber(rules, {
        revealedCards: [card, card, card, card],
        result: {
          ...settledMiss,
          attemptNumber: 4,
          cumulativeCost: 30,
        },
      }),
    ).toBeNull();
  });

  it("sorts eligible Dreamsigns by tide affinity, rarity, and UUID", () => {
    const deckCards = [
      makeMerchantTestCard({
        id: testCardId("00000000-0000-4000-8000-000000000001"),
        cardNumber: 1,
        subtype: "Spirit Animal",
      }),
      makeMerchantTestCard({
        id: testCardId("00000000-0000-4000-8000-000000000002"),
        cardNumber: 2,
        subtype: "Spirit Animal",
      }),
      makeMerchantTestCard({
        id: testCardId("00000000-0000-4000-8000-000000000003"),
        cardNumber: 3,
        subtype: "Spirit Animal",
      }),
    ];
    const templates = [
      makeMerchantTestDreamsignTemplate({
        id: testDreamsignId("sign-z-matched"),
        rarity: "Common",
        tideIds: [testTideId("wolf-tide")],
      }),
      makeMerchantTestDreamsignTemplate({
        id: testDreamsignId("sign-b-generic"),
        rarity: "Uncommon",
        tideIds: [],
      }),
      makeMerchantTestDreamsignTemplate({
        id: testDreamsignId("sign-a-generic"),
        rarity: "Uncommon",
        tideIds: [],
      }),
      makeMerchantTestDreamsignTemplate({
        id: testDreamsignId("sign-off-deck"),
        rarity: "Common",
        tideIds: [testTideId("dragon-tide")],
      }),
    ];
    const affinityIndex = buildTideAffinityIndex({
      version: 2,
      selection: { bandFraction: 0.25, bandMinimum: 5 },
      tidePoolByAvatar: {},
      tides: [
        {
          id: testTideId("wolf-tide"),
          displayName: "Wolf Tide",
          auguryPackageReference: "Wolf Tide package",
          displayDescription: "",
          resonance: "ember",
          role: "neutral",
          cards: deckCards.map((card) => ({ id: card.id, copies: 1 as const })),
        },
        {
          id: testTideId("dragon-tide"),
          displayName: "Dragon Tide",
          auguryPackageReference: "Dragon Tide package",
          displayDescription: "",
          resonance: "ember",
          role: "neutral",
          cards: [],
        },
      ],
    });
    const affinityContext = buildAffinityContext({
      index: affinityIndex,
      deckCardUuids: deckCards.map((card) => card.id),
    });

    expect(
      scoreTidemarkLadderClimbDreamsignCandidates({
        templates,
        affinityIndex,
        affinityContext,
      }),
    ).toEqual([
      { dreamsignId: testDreamsignId("sign-z-matched"), score: 1 },
      { dreamsignId: testDreamsignId("sign-a-generic"), score: 0 },
      { dreamsignId: testDreamsignId("sign-b-generic"), score: 0 },
      { dreamsignId: testDreamsignId("sign-off-deck"), score: 0 },
    ]);
  });
});
