import { describe, expect, it } from "vitest";
import {
  makeMerchantTestCard,
  makeMerchantTestDreamsignProfile,
  makeMerchantTestDreamsignTemplate,
} from "../journey_v2/testing/fixtures";
import { asCardId } from "../types/card-identity";
import {
  nextTidemarkAttemptNumber,
  rankWinsTidemarkAttempt,
  scoreTidemarkDreamsignCandidates,
  tidemarkAttemptCost,
} from "./tidemark-progressive-draw";

describe("Tidemark Progressive Draw rules", () => {
  it("uses the four inclusive thresholds and Farpoint-only cost schedule", () => {
    expect(rankWinsTidemarkAttempt("Q", 1)).toBe(true);
    expect(rankWinsTidemarkAttempt("J", 1)).toBe(false);
    expect(rankWinsTidemarkAttempt("10", 2)).toBe(true);
    expect(rankWinsTidemarkAttempt("9", 2)).toBe(false);
    expect(rankWinsTidemarkAttempt("8", 3)).toBe(true);
    expect(rankWinsTidemarkAttempt("7", 3)).toBe(false);
    expect(rankWinsTidemarkAttempt("6", 4)).toBe(true);
    expect(rankWinsTidemarkAttempt("5", 4)).toBe(false);
    expect([1, 2, 3, 4].map((attempt) =>
      tidemarkAttemptCost(attempt as 1 | 2 | 3 | 4, false),
    )).toEqual([15, 25, 40, 60]);
    expect([1, 2, 3, 4].map((attempt) =>
      tidemarkAttemptCost(attempt as 1 | 2 | 3 | 4, true),
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
      nextTidemarkAttemptNumber({ revealedCards: [], result: null }),
    ).toBe(1);
    expect(
      nextTidemarkAttemptNumber({
        revealedCards: [card],
        result: settledMiss,
      }),
    ).toBe(2);
    expect(
      nextTidemarkAttemptNumber({
        revealedCards: [card],
        result: { ...settledMiss, resultSettled: false },
      }),
    ).toBeNull();
    expect(
      nextTidemarkAttemptNumber({
        revealedCards: [card],
        result: { ...settledMiss, won: true },
      }),
    ).toBeNull();
    expect(
      nextTidemarkAttemptNumber({
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
      scoreTidemarkDreamsignCandidates({ templates, profiles, deckCards }),
    ).toEqual([
      { dreamsignId: "sign-z-matched", score: 1 },
      { dreamsignId: "sign-a-generic", score: 0.4 },
      { dreamsignId: "sign-b-generic", score: 0.4 },
      { dreamsignId: "sign-off-deck", score: 0 },
    ]);
  });
});
