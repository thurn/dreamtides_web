import { describe, expect, it } from "vitest";
import type { JourneyContent } from "../../data/journey-content";
import type { CardData } from "../../types/cards";
import type { JourneyState } from "../../types/journey";
import { applyJourneyRewardEffect } from "./reward-effects";

const CARD_A = "11111111-1111-4111-8111-111111111111";
const CARD_B = "22222222-2222-4222-8222-222222222222";

function card(id: string, cardNumber: number): CardData {
  return { id, cardNumber } as CardData;
}

function fixture() {
  const journeyContent = {
    cardDatabase: new Map([
      [1, card(CARD_A, 1)],
      [2, card(CARD_B, 2)],
    ]),
    dreamsignTemplates: [],
  } as unknown as JourneyContent;
  const state = {
    deck: [
      {
        entryId: "entry-a",
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
      },
      {
        entryId: "entry-b",
        cardNumber: 2,
        transfiguration: null,
        isBane: false,
      },
    ],
    dreamsigns: [],
    essence: 3,
    currentDreamscape: null,
  } as unknown as JourneyState;
  return { journeyContent, state };
}

describe("applyJourneyRewardEffect", () => {
  it("applies a composite reward with one shared deterministic entry-id stream", () => {
    const { journeyContent, state } = fixture();
    const next = applyJourneyRewardEffect({
      state,
      journeyContent,
      mintEntryId: (_deck, index) => `mint-${String(index)}`,
      effect: {
        kind: "composite",
        children: [
          {
            kind: "remove_deck_entry",
            entryId: "entry-a",
            cardUuid: CARD_A,
            cardNumber: 1,
          },
          {
            kind: "duplicate_deck_entry",
            entryId: "entry-b",
            cardUuid: CARD_B,
            cardNumber: 2,
          },
          {
            kind: "add_catalog_card",
            cardUuid: CARD_A,
            cardNumber: 1,
            isBane: true,
          },
          {
            kind: "add_deck_entry_spark_bonus",
            entryId: "entry-b",
            cardUuid: CARD_B,
            cardNumber: 2,
            amount: 2,
          },
          {
            kind: "reduce_deck_entry_energy_cost",
            entryId: "entry-b",
            cardUuid: CARD_B,
            cardNumber: 2,
            amount: 1,
          },
          { kind: "add_essence", amount: 7 },
        ],
      },
    });

    expect(next?.deck.map((entry) => entry.entryId)).toEqual([
      "entry-b",
      "mint-0",
      "mint-1",
    ]);
    expect(next?.deck[0]?.sparkBonus).toBe(2);
    expect(next?.deck[0]?.keywordModification?.energyCostReduction).toBe(1);
    expect(next?.deck[2]?.isBane).toBe(true);
    expect(next?.essence).toBe(10);
  });

  it("rejects a composite atomically when any target identity is stale", () => {
    const { journeyContent, state } = fixture();
    const next = applyJourneyRewardEffect({
      state,
      journeyContent,
      effect: {
        kind: "composite",
        children: [
          { kind: "add_essence", amount: 5 },
          {
            kind: "remove_deck_entry",
            entryId: "entry-a",
            cardUuid: CARD_B,
            cardNumber: 1,
          },
        ],
      },
    });

    expect(next).toBeNull();
    expect(state.essence).toBe(3);
    expect(state.deck).toHaveLength(2);
  });
});
