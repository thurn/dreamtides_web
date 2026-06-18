import { describe, expect, it } from "vitest";
import {
  MINIMAL_ATLAS_CONFIG,
  MINIMAL_DREAMSCAPES,
} from "../__test-helpers__/atlas-fixtures";
import type { CardData } from "../types/cards";
import type { QuestContent } from "../data/quest-content";
import type {
  ApollyonIncarnationContent,
  DreamcallerContent,
} from "../types/content";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
} from "../__test-helpers__/pool-context";
import { QA_SCENES, buildQaScene, findQaScene } from "./qa-scenes";

function makeDreamcaller(): DreamcallerContent {
  return {
    id: "dreamcaller-1",
    name: "Test Dreamcaller",
    title: "Caller of Tests",
    renderedText: "Test ability.",
    imageNumber: "0001",
    startingEssence: 250,
    signatureCards: ["Alpha Card 1"],
  };
}

function makeIncarnations(): ApollyonIncarnationContent[] {
  return [
    {
      id: "incarnation-1",
      title: "First Incarnation",
      description: "A test incarnation.",
      deckType: "test-deck",
    },
    {
      id: "incarnation-2",
      title: "Second Incarnation",
      description: "Another test incarnation.",
      deckType: "test-deck",
    },
  ];
}

function makeQuestContent(
  incarnations: ApollyonIncarnationContent[] = makeIncarnations(),
): QuestContent {
  const cardDatabase = new Map<number, CardData>(
    buildTestCorpusCards().map((card) => [card.cardNumber, card]),
  );
  return {
    cardDatabase,
    dreamcallers: [makeDreamcaller()],
    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: MINIMAL_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasConfig: MINIMAL_ATLAS_CONFIG,
    apollyonIncarnations: incarnations,
    poolContext: makeTestPoolContext(["dreamsign-1", "dreamsign-2"]),
  };
}

describe("QA scenes", () => {
  it("registers each scene under a unique lowercase id", () => {
    const ids = QA_SCENES.map((scene) => scene.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBe(id.trim().toLowerCase());
    }
  });

  it("resolves a scene id case-insensitively and ignores surrounding space", () => {
    const scene = QA_SCENES[0];
    expect(findQaScene(scene.id)).toBe(scene);
    expect(findQaScene(`  ${scene.id.toUpperCase()}  `)).toBe(scene);
  });

  it("returns null for an unknown scene id", () => {
    expect(findQaScene("not-a-real-scene")).toBeNull();
    expect(buildQaScene("not-a-real-scene", makeQuestContent())).toBeNull();
  });
});

describe('the "atlas" QA scene', () => {
  it("parks the run on the atlas screen with a generated boss node", () => {
    const state = buildQaScene("atlas", makeQuestContent());

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("atlas");
    // Between dreamscapes: no dreamscape entered and no active site.
    expect(state?.currentDreamscape).toBeNull();
    expect(state?.activeSiteId).toBeNull();
    expect(state?.dreamcaller?.id).toBe("dreamcaller-1");

    const bossNodeId = state?.atlas.bossNodeId;
    expect(bossNodeId).toBeTruthy();
    expect(
      bossNodeId === undefined ? undefined : state?.atlas.nodes[bossNodeId],
    ).toBeDefined();
  });

  it("assigns a boss incarnation drawn from the supplied incarnations", () => {
    const incarnations = makeIncarnations();
    const state = buildQaScene("atlas", makeQuestContent(incarnations));

    const incarnationId = state?.atlas.bossIncarnationId;
    expect(incarnationId).toBeTruthy();
    expect(incarnations.map((i) => i.id)).toContain(incarnationId);
  });
});
