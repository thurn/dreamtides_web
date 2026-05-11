import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import { sampleRewardCards } from "./tide-weights";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: "Test Card",
    id: "test-id",
    cardNumber: 1,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    tides: ["alpha"],
    renderedText: "Test text",
    imageNumber: 1,
    artOwned: false,
    ...overrides,
  };
}

function makeDatabase(cards: CardData[]): Map<number, CardData> {
  return new Map(cards.map((card) => [card.cardNumber, card]));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("sampleRewardCards", () => {
  it("prefers package-adjacent rewards", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const rewards = sampleRewardCards(
      makeDatabase([
        makeCard({ cardNumber: 1, tides: ["alpha"] }),
        makeCard({ cardNumber: 2, tides: ["alpha", "beta"] }),
        makeCard({ cardNumber: 3, tides: ["alpha", "gamma"] }),
        makeCard({ cardNumber: 4, tides: ["alpha", "delta"] }),
        makeCard({ cardNumber: 5, tides: ["beta"] }),
      ]),
      4,
      ["alpha"],
    );

    expect(rewards).toHaveLength(4);
    for (const reward of rewards) {
      expect(reward.tides).toContain("alpha");
    }
  });

  it("falls back to the broader pool when no adjacent rewards exist", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const rewards = sampleRewardCards(
      makeDatabase([
        makeCard({ cardNumber: 1, tides: ["beta"] }),
        makeCard({ cardNumber: 2, tides: ["gamma"] }),
        makeCard({ cardNumber: 3, tides: ["delta"] }),
        makeCard({ cardNumber: 4, tides: ["epsilon"] }),
      ]),
      4,
      ["alpha"],
    );

    expect(rewards).toHaveLength(4);
    expect(rewards.map((reward) => reward.cardNumber)).toEqual([1, 2, 3, 4]);
  });
});
