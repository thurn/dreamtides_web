import { describe, expect, it } from "vitest";
import { buildAuguryContext } from "../context/buildAuguryContext";
import {
  makeAuguryTestCard,
  makeAuguryTestContent,
  makeAuguryTestDeckEntry,
  makeAuguryTestJourneyState,
  makeAuguryTestSite,
} from "../testing/fixtures";
import type { CardData } from "../../types/cards";
import type { AuguryContext } from "../types";
import { buildAuguryDeckSnapshot, deckFeatureTallies } from "./deckSnapshot";
import { parseDeckEntryId } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";

function contextWithDeck(cards: readonly CardData[]): AuguryContext {
  const journeyContent = makeAuguryTestContent({ cards });
  const journeyState = makeAuguryTestJourneyState({
    deck: cards.map((card, i) =>
      makeAuguryTestDeckEntry({
        entryId: parseDeckEntryId(`entry-${String(i)}`),
        cardNumber: card.cardNumber,
      }),
    ),
  });
  return buildAuguryContext({
    journeyState,
    journeyContent,
    site: makeAuguryTestSite(),
  });
}

describe("deckFeatureTallies", () => {
  it("tallies card type, subtype, cost band, and keywords", () => {
    const cards: CardData[] = [
      makeAuguryTestCard({
        id: testCardId("a"),
        cardNumber: 1,
        cardType: "Character",
        subtype: "Warrior",
        energyCost: 1,
      }),
      makeAuguryTestCard({
        id: testCardId("b"),
        cardNumber: 2,
        cardType: "Character",
        subtype: "Warrior",
        energyCost: 3,
      }),
      makeAuguryTestCard({
        id: testCardId("c"),
        cardNumber: 3,
        cardType: "Event",
        subtype: "",
        energyCost: 5,
        isFast: true,
        reclaimCost: 2,
      }),
    ];
    const tallies = deckFeatureTallies(cards);
    expect(tallies.cardType).toEqual({ Character: 2, Event: 1 });
    expect(tallies.subtype).toEqual({ Warrior: 2, "": 1 });
    expect(tallies.costBand).toEqual({ cheap: 1, mid: 1, big: 1 });
    expect(tallies.keyword).toEqual({ fast: 1, reclaim: 1 });
  });

  it("buckets a variable (null) cost into its own band", () => {
    const tallies = deckFeatureTallies([
      makeAuguryTestCard({
        id: testCardId("x"),
        cardNumber: 9,
        energyCost: null,
      }),
    ]);
    expect(tallies.costBand).toEqual({ variable: 1 });
  });
});

describe("buildAuguryDeckSnapshot", () => {
  it("reports size, sorted card numbers, and feature tallies", () => {
    const cards = [
      makeAuguryTestCard({
        id: testCardId("a"),
        cardNumber: 30,
        subtype: "Warrior",
      }),
      makeAuguryTestCard({
        id: testCardId("b"),
        cardNumber: 10,
        subtype: "Warrior",
      }),
    ];
    const snapshot = buildAuguryDeckSnapshot(contextWithDeck(cards));
    expect(snapshot.size).toBe(2);
    expect(snapshot.cardNumbers).toEqual([10, 30]);
    expect(snapshot.features.subtype).toEqual({ Warrior: 2 });
    expect(snapshot.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a stable hash for the same deck content regardless of order", () => {
    const cards = [
      makeAuguryTestCard({ id: testCardId("a"), cardNumber: 30 }),
      makeAuguryTestCard({ id: testCardId("b"), cardNumber: 10 }),
    ];
    const reversed = [...cards].reverse();
    expect(buildAuguryDeckSnapshot(contextWithDeck(cards)).hash).toBe(
      buildAuguryDeckSnapshot(contextWithDeck(reversed)).hash,
    );
  });
});
