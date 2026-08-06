import { describe, expect, it } from "vitest";
import {
  makeMerchantTestCard,
  makeMerchantTestDreamsignProfile,
  makeMerchantTestDreamsignTemplate,
} from "../journey_v2/testing/fixtures";
import { asCardId } from "../types/card-identity";
import {
  nextTidemarkLadderClimbAttemptNumber,
  rankWinsTidemarkLadderClimbAttempt,
  scoreTidemarkLadderClimbDreamsignCandidates,
  TIDEMARK_LADDER_CLIMB_ESSENCE_REWARD,
  tidemarkLadderClimbAttemptCost,
} from "./tidemark-ladder-climb";

describe("Tidemark Ladder Climb rules", () => {
  it("uses the four inclusive thresholds and Farpoint-only cost schedule", () => {
    expect(TIDEMARK_LADDER_CLIMB_ESSENCE_REWARD).toBe(25);
    expect(rankWinsTidemarkLadderClimbAttempt("Q", 1)).toBe(true);
    expect(rankWinsTidemarkLadderClimbAttempt("J", 1)).toBe(false);
    expect(rankWinsTidemarkLadderClimbAttempt("10", 2)).toBe(true);
    expect(rankWinsTidemarkLadderClimbAttempt("9", 2)).toBe(false);
    expect(rankWinsTidemarkLadderClimbAttempt("8", 3)).toBe(true);
    expect(rankWinsTidemarkLadderClimbAttempt("7", 3)).toBe(false);
    expect(rankWinsTidemarkLadderClimbAttempt("6", 4)).toBe(true);
    expect(rankWinsTidemarkLadderClimbAttempt("5", 4)).toBe(false);
    expect([1, 2, 3, 4].map((attempt) =>
      tidemarkLadderClimbAttemptCost(attempt as 1 | 2 | 3 | 4, false),
    )).toEqual([15, 25, 40, 60]);
    expect([1, 2, 3, 4].map((attempt) =>
      tidemarkLadderClimbAttemptCost(attempt as 1 | 2 | 3 | 4, true),
    )).toEqual([10, 20, 30, 45]);
  });

  it("owns the shared next-attempt eligibility contract", () => {
    const card = { rank: "2", suit: "clubs" } as const;
    const settledMiss = {
      attemptNumber: 1,
      card,
      won: false,
      costPaid: 15,
      cumulativeCost: 15,
      resultSettled: true,
      dreamsignAwarded: false,
      pendingDreamsignReplacement: false,
    } as const;

    expect(
      nextTidemarkLadderClimbAttemptNumber({ revealedCards: [], result: null }),
    ).toBe(1);
    expect(
      nextTidemarkLadderClimbAttemptNumber({
        revealedCards: [card],
        result: settledMiss,
      }),
    ).toBe(2);
    expect(
      nextTidemarkLadderClimbAttemptNumber({
        revealedCards: [card],
        result: { ...settledMiss, resultSettled: false },
      }),
    ).toBeNull();
    expect(
      nextTidemarkLadderClimbAttemptNumber({
        revealedCards: [card],
        result: { ...settledMiss, won: true },
      }),
    ).toBeNull();
    expect(
      nextTidemarkLadderClimbAttemptNumber({
        revealedCards: [card, card, card, card],
        result: {
          ...settledMiss,
          attemptNumber: 4,
          cumulativeCost: 140,
        },
      }),
    ).toBeNull();
  });

  it("sorts eligible Dreamsigns by deck match score and UUID tiebreaker", () => {
    const deckCards = [
      makeMerchantTestCard({
        id: asCardId("00000000-0000-4000-8000-000000000001"),
        cardNumber: 1,
        subtype: "Wolf",
      }),
      makeMerchantTestCard({
        id: asCardId("00000000-0000-4000-8000-000000000002"),
        cardNumber: 2,
        subtype: "Wolf",
      }),
      makeMerchantTestCard({
        id: asCardId("00000000-0000-4000-8000-000000000003"),
        cardNumber: 3,
        subtype: "Wolf",
      }),
    ];
    const templates = [
      makeMerchantTestDreamsignTemplate({ id: "sign-z-matched" }),
      makeMerchantTestDreamsignTemplate({ id: "sign-b-generic" }),
      makeMerchantTestDreamsignTemplate({ id: "sign-a-generic" }),
      makeMerchantTestDreamsignTemplate({ id: "sign-off-deck" }),
    ];
    const profiles = new Map([
      [
        "sign-z-matched",
        makeMerchantTestDreamsignProfile({
          id: "sign-z-matched",
          subtypes: ["Wolf"],
        }),
      ],
      [
        "sign-b-generic",
        makeMerchantTestDreamsignProfile({ id: "sign-b-generic" }),
      ],
      [
        "sign-a-generic",
        makeMerchantTestDreamsignProfile({ id: "sign-a-generic" }),
      ],
      [
        "sign-off-deck",
        makeMerchantTestDreamsignProfile({
          id: "sign-off-deck",
          subtypes: ["Dragon"],
        }),
      ],
    ]);

    expect(
      scoreTidemarkLadderClimbDreamsignCandidates({ templates, profiles, deckCards }),
    ).toEqual([
      { dreamsignId: "sign-z-matched", score: 1 },
      { dreamsignId: "sign-a-generic", score: 0.4 },
      { dreamsignId: "sign-b-generic", score: 0.4 },
      { dreamsignId: "sign-off-deck", score: 0 },
    ]);
  });
});
