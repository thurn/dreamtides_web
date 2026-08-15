import { describe, expect, it } from "vitest";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import type { JourneyContent } from "../../data/journey-content";
import type { CardData } from "../../types/cards";
import type { JourneyState } from "../../types/journey";
import { applyJourneyRewardEffect } from "./reward-effects";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";
import { parseCardName, type CardId } from "../../types/card-identity";

const CARD_A = testCardId("11111111-1111-4111-8111-111111111111");
const CARD_B = testCardId("22222222-2222-4222-8222-222222222222");

function card(id: CardId, cardNumber: number): CardData {
  return {
    id,
    name: parseCardName(`Fixture ${cardNumber}`),
    cardNumber,
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function fixture() {
  const journeyContent = {
    cardDatabase: new Map([
      [1, card(CARD_A, 1)],
      [2, card(CARD_B, 2)],
      [10002, card(NIGHTMARE_CARD_ID, 10002)],
    ]),
    dreamsignTemplates: [],
  } as unknown as JourneyContent;
  const state = {
    deck: [
      {
        entryId: parseDeckEntryId("entry-a"),
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
      },
      {
        entryId: parseDeckEntryId("entry-b"),
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
      mintEntryId: (_deck, index) => parseDeckEntryId(`mint-${String(index)}`),
      effect: {
        kind: "composite",
        children: [
          {
            kind: "remove_deck_entry",
            entryId: parseDeckEntryId("entry-a"),
            cardUuid: CARD_A,
            cardNumber: 1,
          },
          {
            kind: "duplicate_deck_entry",
            entryId: parseDeckEntryId("entry-b"),
            cardUuid: CARD_B,
            cardNumber: 2,
          },
          {
            kind: "add_catalog_card",
            cardUuid: NIGHTMARE_CARD_ID,
            cardNumber: 10002,
          },
          {
            kind: "add_deck_entry_spark_bonus",
            entryId: parseDeckEntryId("entry-b"),
            cardUuid: CARD_B,
            cardNumber: 2,
            amount: 2,
          },
          {
            kind: "reduce_deck_entry_energy_cost",
            entryId: parseDeckEntryId("entry-b"),
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
            entryId: parseDeckEntryId("entry-a"),
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

  it("inserts one exact prepared site and rejects stale or forged preconditions", () => {
    const { journeyContent, state: partialState } = fixture();
    const sourceSite = {
      id: parseSiteId("source-exploration"),
      type: "Exploration" as const,
      isEnhanced: false,
      isVisited: false,
    };
    const battleSite = {
      id: parseSiteId("battle"),
      type: "Battle" as const,
      isEnhanced: false,
      isVisited: false,
    };
    const state = {
      ...partialState,
      currentDreamscape: "node-a",
      atlas: {
        currentNodeId: parseAtlasNodeId("node-a"),
        nodes: {
          "node-a": { sites: [sourceSite, battleSite] },
        },
      },
    } as unknown as JourneyState;
    const effect = {
      kind: "insert_site" as const,
      targetNodeId: parseAtlasNodeId("node-a"),
      insertionIndex: 2,
      siblingSiteIdsBefore: [sourceSite.id, battleSite.id],
      site: {
        id: parseSiteId("site-exploration-source-exploration-action-a"),
        type: "Shop" as const,
        isEnhanced: false,
        isVisited: false,
      },
    };

    const next = applyJourneyRewardEffect({
      state,
      journeyContent,
      effect,
    });
    expect(next?.atlas.nodes[parseAtlasNodeId("node-a")]?.sites).toEqual([
      sourceSite,
      battleSite,
      effect.site,
    ]);
    expect(state.atlas.nodes[parseAtlasNodeId("node-a")]?.sites).toHaveLength(2);

    const invalidEffects = [
      { ...effect, targetNodeId: parseAtlasNodeId("node-b") },
      { ...effect, insertionIndex: 1 },
      { ...effect, siblingSiteIdsBefore: [battleSite.id, sourceSite.id] },
      { ...effect, site: { ...effect.site, id: sourceSite.id } },
      { ...effect, site: { ...effect.site, isEnhanced: true } },
      { ...effect, site: { ...effect.site, isVisited: true } },
    ];
    for (const invalidEffect of invalidEffects) {
      expect(
        applyJourneyRewardEffect({
          state,
          journeyContent,
          effect: invalidEffect,
        }),
      ).toBeNull();
    }
  });

  it("preserves the existing random add_site reward path", () => {
    const { journeyContent, state: partialState } = fixture();
    const state = {
      ...partialState,
      currentDreamscape: "node-a",
      atlas: {
        currentNodeId: parseAtlasNodeId("node-a"),
        nodes: { "node-a": { sites: [] } },
      },
    } as unknown as JourneyState;

    const next = applyJourneyRewardEffect({
      state,
      journeyContent,
      effect: { kind: "add_site", siteType: "Duplication" },
    });

    expect(next?.atlas.nodes[parseAtlasNodeId("node-a")]?.sites).toEqual([
      {
        id: parseSiteId("site-merchant-Duplication-0"),
        type: "Duplication",
        isEnhanced: false,
        isVisited: false,
      },
    ]);
  });
});
