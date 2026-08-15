import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";
import { LocalizedString } from "@trox/runtime";

expect.addEqualityTesters([localizedStringSourceEquality]);
import { LayerName } from "../../types/layer-name";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { createDefaultState } from "../../state/journey-context";
import type { DreamscapeNode, JourneyState } from "../../types/journey";
import {
  buildJourneyCompleteCardIds,
  buildJourneyCompleteView,
} from "./journey-complete-view-model";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { testAvatarId, testDreamsignId, testCardId } from "../../types/test-identities";

function card(cardNumber: number, idSeed: string): CardData {
  return {
    id: testCardId(idSeed),
    name: parseCardName("Shared Display Name"),
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

function node(idSeed: string, state: DreamscapeNode["state"]): DreamscapeNode {
  return {
    id: parseAtlasNodeId(idSeed),
    layer: LayerName.One,
    indexInLayer: 0,
    dreamscapeId: null,
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
    avatar: {
      id: testAvatarId("avatar-uuid"),
      name: "The Wayfinder",
      title: "Bearer of the Last Light",
      renderedText: "A fixture ability.",
      imageNumber: "001",
      startingEssence: 200,
    },
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
    dreamsigns: [
      {
        id: testDreamsignId("dreamsign-uuid"),
        name: "Fixture Sign",
        effectDescription: "A fixture effect.",
      },
    ],
    atlas: {
      ...base.atlas,
      nodes: {
        [parseAtlasNodeId("completedA")]: node("completed-a", "completed"),
        [parseAtlasNodeId("completedB")]: node("completed-b", "completed"),
        [parseAtlasNodeId("available")]: node("available", "available"),
      },
    },
  };
}

describe("buildJourneyCompleteView", () => {
  it("builds the interactive Avatar portrait and victory statistics from run state", () => {
    const journey = state();
    const view = buildJourneyCompleteView(journey);

    expect(view.avatar).toMatchObject({
      id: journey.avatar?.id,
      imageNumber: "001",
    });
    expect(view.avatar?.name).toBeInstanceOf(LocalizedString);
    expect(view.avatar?.title).toBeInstanceOf(LocalizedString);
    expect(view.avatar?.ability).toBeInstanceOf(LocalizedString);
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
