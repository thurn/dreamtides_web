import { describe, expect, it } from "vitest";
import { LayerName } from "../../types/layer-name";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { createDefaultState } from "../../state/quest-context";
import type { DreamscapeNode, QuestState } from "../../types/quest";
import {
  buildQuestCompleteCardIds,
  buildQuestCompleteView,
} from "./quest-complete-view-model";

function card(cardNumber: number, id: string): CardData {
  return {
    id: asCardId(id),
    name: asCardName("Shared Display Name"),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "A fixture ability.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function node(id: string, state: DreamscapeNode["state"]): DreamscapeNode {
  return {
    id,
    layer: LayerName.One,
    indexInLayer: 0,
    dreamscapeId: null,
    biomeName: "",
    biomeColor: "",
    sites: [],
    position: { x: 0, y: 0 },
    state,
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
  };
}

function state(): QuestState {
  const base = createDefaultState();
  return {
    ...base,
    essence: 140,
    completionLevel: 7,
    dreamcaller: {
      id: "dreamcaller-uuid",
      name: "The Wayfinder",
      title: "Bearer of the Last Light",
      renderedText: "A fixture ability.",
      imageNumber: "001",
      startingEssence: 200,
    },
    deck: [
      { entryId: "entry-a", cardNumber: 1, transfiguration: null, isBane: false },
      { entryId: "entry-b", cardNumber: 2, transfiguration: null, isBane: false },
    ],
    dreamsigns: [
      {
        id: "dreamsign-uuid",
        name: "Fixture Sign",
        effectDescription: "A fixture effect.",
        isBane: false,
      },
    ],
    atlas: {
      ...base.atlas,
      nodes: {
        completedA: node("completed-a", "completed"),
        completedB: node("completed-b", "completed"),
        available: node("available", "available"),
      },
    },
  };
}

describe("buildQuestCompleteView", () => {
  it("builds the interactive Dreamcaller portrait and victory statistics from run state", () => {
    const view = buildQuestCompleteView(state());

    expect(view.dreamcaller).toEqual({
      id: "dreamcaller-uuid",
      name: "The Wayfinder",
      title: "Bearer of the Last Light",
      ability: "A fixture ability.",
      imageNumber: "001",
    });
    expect(view.stats.map(({ id, value }) => [id, value])).toEqual([
      ["battles", 7],
      ["dreamscapes", 2],
      ["cards", 2],
      ["dreamsigns", 1],
      ["essence", 140],
    ]);
  });

  it("resolves same-named final-deck cards to distinct UUIDs for logging", () => {
    const fixtureState = state();
    const cardIds = buildQuestCompleteCardIds(
      fixtureState.deck,
      new Map([
        [1, card(1, "00000000-0000-0000-0000-000000000001")],
        [2, card(2, "00000000-0000-0000-0000-000000000002")],
      ]),
    );

    expect(cardIds).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    ]);
  });
});
