import { describe, expect, it } from "vitest";
import { LayerName } from "../../types/layer-name";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { createDefaultState } from "../../state/journey-context";
import type { DreamscapeNode, JourneyState } from "../../types/journey";
import {
  buildJourneyCompleteCardIds,
  buildJourneyCompleteView,
} from "./journey-complete-view-model";

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
    sites: [],
    position: { x: 0, y: 0 },
    state,
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
  };
}

function state(): JourneyState {
  const base = createDefaultState();
  return {
    ...base,
    essence: 140,
    completionLevel: 7,
    dreamAvatar: {
      id: "dream-avatar-uuid",
      name: "The Wayfinder",
      title: "Bearer of the Last Light",
      renderedText: "A fixture ability.",
      imageNumber: "001",
      startingEssence: 200,
    },
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
    dreamsigns: [
      {
        id: "dreamsign-uuid",
        name: "Fixture Sign",
        effectDescription: "A fixture effect.",
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

describe("buildJourneyCompleteView", () => {
  it("builds the interactive DreamAvatar portrait and victory statistics from run state", () => {
    const view = buildJourneyCompleteView(state());

    expect(view.dreamAvatar).toEqual({
      id: "dream-avatar-uuid",
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
    const cardIds = buildJourneyCompleteCardIds(
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
