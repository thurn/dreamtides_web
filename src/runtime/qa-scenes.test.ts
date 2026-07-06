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

describe('the "dreamcaller-select" QA scene', () => {
  it("parks the run on the questStart Dreamcaller selection screen", () => {
    const state = buildQaScene("dreamcaller-select", makeQuestContent());

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("questStart");
    // The selection screen is shown before a Dreamcaller is chosen, so no
    // Dreamcaller, package, or draft state has been resolved yet.
    expect(state?.dreamcaller).toBeNull();
    expect(state?.resolvedPackage).toBeNull();
    expect(state?.draftState).toBeNull();
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

  it("parks on the layer-1 frontier, a genuinely reachable resting state", () => {
    const state = buildQaScene("atlas", makeQuestContent());
    // "atlas" is the first real resting screen (one dreamscape completed), so
    // the completion level and frontier depth are both 1.
    expect(state?.completionLevel).toBe(1);
    const available = Object.values(state?.atlas.nodes ?? {}).filter(
      (node) => node.state === "available",
    );
    expect(available.length).toBeGreaterThan(0);
    expect(available.every((node) => node.layer === 1)).toBe(true);
  });
});

describe("the atlas layer QA scenes", () => {
  // `atlasN` is numbered by the UI's 1-indexed "Layer N" column label, so it
  // parks the frontier on 0-indexed layer N-1. Column I (the starter) is never
  // a resting frontier, so the numbered scenes run Layer II through Layer VII.
  const displayLayers = [2, 3, 4, 5, 6, 7];

  for (const displayLayer of displayLayers) {
    const frontierLayer = displayLayer - 1;
    it(`atlas${String(displayLayer)} parks on the atlas with the frontier on the "Layer ${String(displayLayer)}" column`, () => {
      const state = buildQaScene(`atlas${String(displayLayer)}`, makeQuestContent());

      expect(state).not.toBeNull();
      expect(state?.screen.type).toBe("atlas");
      expect(state?.currentDreamscape).toBeNull();
      expect(state?.activeSiteId).toBeNull();
      // Reaching the column-N frontier means N-1 dreamscapes were completed.
      expect(state?.completionLevel).toBe(frontierLayer);

      const nodes = Object.values(state?.atlas.nodes ?? {});
      const completed = nodes.filter((node) => node.state === "completed");
      expect(completed.length).toBe(frontierLayer);

      // The available frontier sits on the 0-indexed layer the UI shows as N.
      const available = nodes.filter((node) => node.state === "available");
      expect(available.length).toBeGreaterThan(0);
      expect(available.every((node) => node.layer === frontierLayer)).toBe(true);
    });
  }

  it("never leaves an available node whose next layer is still unrevealed", () => {
    // The impossible layer-0 resting view the old scene produced showed the
    // next layer as an unseen dream. Replaying real completions guarantees the
    // reveal-two-layers-ahead rule has fired, so every choice the player can
    // make already shows one layer ahead.
    for (const displayLayer of displayLayers) {
      const state = buildQaScene(`atlas${String(displayLayer)}`, makeQuestContent());
      const nodes = state?.atlas.nodes ?? {};
      const available = Object.values(nodes).filter(
        (node) => node.state === "available",
      );
      for (const node of available) {
        for (const forwardId of node.forwardIds) {
          expect(nodes[forwardId]?.state).not.toBe("unrevealed");
        }
      }
    }
  });

  it("registers an atlasN scene for every reachable frontier column", () => {
    for (const displayLayer of displayLayers) {
      expect(findQaScene(`atlas${String(displayLayer)}`)).not.toBeNull();
    }
    // Layer I (the starter) is never a resting frontier.
    expect(findQaScene("atlas1")).toBeNull();
  });
});
