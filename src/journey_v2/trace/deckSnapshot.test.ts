import { describe, expect, it } from "vitest";
import { asCardId } from "../../types/card-identity";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestJourneyState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { CardData } from "../../types/cards";
import type { MerchantContext } from "../types";
import { buildMerchantDeckSnapshot, deckFeatureTallies } from "./deckSnapshot";

function contextWithDeck(cards: readonly CardData[]): MerchantContext {
  const journeyContent = makeMerchantTestContent({ cards });
  const journeyState = makeMerchantTestJourneyState({
    deck: cards.map((card, i) =>
      makeMerchantTestDeckEntry({
        entryId: `entry-${String(i)}`,
        cardNumber: card.cardNumber,
      }),
    ),
  });
  return buildMerchantContext({
    journeyState,
    journeyContent,
    site: makeMerchantTestSite(),
  });
}

describe("deckFeatureTallies", () => {
  it("tallies card type, subtype, cost band, and keywords", () => {
    const cards: CardData[] = [
      makeMerchantTestCard({
        id: asCardId("a"),
        cardNumber: 1,
        cardType: "Character",
        subtype: "Warrior",
        energyCost: 1,
      }),
      makeMerchantTestCard({
        id: asCardId("b"),
        cardNumber: 2,
        cardType: "Character",
        subtype: "Warrior",
        energyCost: 3,
      }),
      makeMerchantTestCard({
        id: asCardId("c"),
        cardNumber: 3,
        cardType: "Event",
        subtype: "Spell",
        energyCost: 5,
        isFast: true,
        reclaimCost: 2,
      }),
    ];
    const tallies = deckFeatureTallies(cards);
    expect(tallies.cardType).toEqual({ Character: 2, Event: 1 });
    expect(tallies.subtype).toEqual({ Warrior: 2, Spell: 1 });
    expect(tallies.costBand).toEqual({ cheap: 1, mid: 1, big: 1 });
    expect(tallies.keyword).toEqual({ fast: 1, reclaim: 1 });
  });

  it("buckets a variable (null) cost into its own band", () => {
    const tallies = deckFeatureTallies([
      makeMerchantTestCard({ id: asCardId("x"), cardNumber: 9, energyCost: null }),
    ]);
    expect(tallies.costBand).toEqual({ variable: 1 });
  });
});

describe("buildMerchantDeckSnapshot", () => {
  it("reports size, sorted card numbers, and feature tallies", () => {
    const cards = [
      makeMerchantTestCard({ id: asCardId("a"), cardNumber: 30, subtype: "Warrior" }),
      makeMerchantTestCard({ id: asCardId("b"), cardNumber: 10, subtype: "Warrior" }),
    ];
    const snapshot = buildMerchantDeckSnapshot(contextWithDeck(cards));
    expect(snapshot.size).toBe(2);
    expect(snapshot.cardNumbers).toEqual([10, 30]);
    expect(snapshot.features.subtype).toEqual({ Warrior: 2 });
    expect(snapshot.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a stable hash for the same deck content regardless of order", () => {
    const cards = [
      makeMerchantTestCard({ id: asCardId("a"), cardNumber: 30 }),
      makeMerchantTestCard({ id: asCardId("b"), cardNumber: 10 }),
    ];
    const reversed = [...cards].reverse();
    expect(buildMerchantDeckSnapshot(contextWithDeck(cards)).hash).toBe(
      buildMerchantDeckSnapshot(contextWithDeck(reversed)).hash,
    );
  });
});
