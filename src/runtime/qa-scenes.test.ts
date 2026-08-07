import { describe, expect, it } from "vitest";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
} from "../__test-helpers__/atlas-fixtures";
import type { CardData } from "../types/cards";
import { layerOrdinal } from "../types/layer-name";
import type { JourneyContent } from "../data/journey-content";
import type {
  ApollyonIncarnationContent,
  DreamAvatarContent,
} from "../types/content";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
} from "../__test-helpers__/pool-context";
import {
  QA_SCENES,
  buildQaScene,
  findQaScene,
  qaSceneLoadsBattle,
} from "./qa-scenes";
import {
  makeTutorialConfiguration,
  TEST_TUTORIAL_PLAYER_AVATAR_ID,
} from "../test/tutorial-configuration-fixture";

const TUTORIAL_DREAM_AVATAR_ID = TEST_TUTORIAL_PLAYER_AVATAR_ID;

function makeDreamAvatar(id = "dream-avatar-1"): DreamAvatarContent {
  return {
    id,
    name: "Test DreamAvatar",
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

function makeJourneyContent(
  incarnations: ApollyonIncarnationContent[] = makeIncarnations(),
): JourneyContent {
  const cardDatabase = new Map<number, CardData>(
    buildTestCorpusCards().map((card) => [card.cardNumber, card]),
  );
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase,
    tutorial: makeTutorialConfiguration(),
    dreamAvatars: [makeDreamAvatar()],
    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: MINIMAL_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
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
    expect(buildQaScene("not-a-real-scene", makeJourneyContent())).toBeNull();
  });

  it("registers the Augury site under its canonical QA ids", () => {
    expect(findQaScene("augury")?.label).toBe("Augury");
    expect(findQaScene("augury-enhanced")?.label).toBe("Augury (Enhanced)");
  });
});

describe('the "dream-avatar-select" QA scene', () => {
  it("parks the run on the journeyStart DreamAvatar selection screen", () => {
    const state = buildQaScene("dream-avatar-select", makeJourneyContent());

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("journeyStart");
    // The selection screen is shown before a DreamAvatar is chosen, so no
    // DreamAvatar, package, or draft state has been resolved yet.
    expect(state?.dreamAvatar).toBeNull();
    expect(state?.resolvedPackage).toBeNull();
    expect(state?.draftState).toBeNull();
  });
});

describe('the "tutorial-dream-avatar-select" QA scene', () => {
  it("parks journeyStart on the one fixed tutorial DreamAvatar UUID", () => {
    const content = makeJourneyContent();
    content.dreamAvatars = [makeDreamAvatar(TUTORIAL_DREAM_AVATAR_ID)];

    const state = buildQaScene("tutorial-dream-avatar-select", content);

    expect(state).not.toBeNull();
    expect(state?.screen).toEqual({
      type: "journeyStart",
      tutorialDreamAvatarId: TUTORIAL_DREAM_AVATAR_ID,
    });
    expect(state?.dreamAvatar).toBeNull();
    expect(state?.resolvedPackage).toBeNull();
    expect(state?.draftState).toBeNull();
  });

  it("fails to build when the required tutorial DreamAvatar is unavailable", () => {
    expect(
      buildQaScene("tutorial-dream-avatar-select", makeJourneyContent()),
    ).toBeNull();
  });
});

describe('the "atlas" QA scene', () => {
  it("parks the run on the atlas screen with a generated boss node", () => {
    const state = buildQaScene("atlas", makeJourneyContent());

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("atlas");
    // Between dreamscapes: no dreamscape entered and no active site.
    expect(state?.currentDreamscape).toBeNull();
    expect(state?.activeSiteId).toBeNull();
    expect(state?.dreamAvatar?.id).toBe("dream-avatar-1");

    const bossNodeId = state?.atlas.bossNodeId;
    expect(bossNodeId).toBeTruthy();
    expect(
      bossNodeId === undefined ? undefined : state?.atlas.nodes[bossNodeId],
    ).toBeDefined();
  });

  it("assigns a boss incarnation drawn from the supplied incarnations", () => {
    const incarnations = makeIncarnations();
    const state = buildQaScene("atlas", makeJourneyContent(incarnations));

    const incarnationId = state?.atlas.bossIncarnationId;
    expect(incarnationId).toBeTruthy();
    expect(incarnations.map((i) => i.id)).toContain(incarnationId);
  });

  it("parks on the layer-1 frontier, a genuinely reachable resting state", () => {
    const state = buildQaScene("atlas", makeJourneyContent());
    // "atlas" is the first real resting screen (one dreamscape completed), so
    // the completion level and frontier depth are both 1.
    expect(state?.completionLevel).toBe(1);
    const available = Object.values(state?.atlas.nodes ?? {}).filter(
      (node) => node.state === "available",
    );
    expect(available.length).toBeGreaterThan(0);
    expect(available.every((node) => layerOrdinal(node.layer) === 1)).toBe(
      true,
    );
  });
});

describe('the "random-site-atlas" QA scene', () => {
  it("places Maddox's enhanced Random Site on an available Atlas node", () => {
    const content = makeJourneyContent();
    content.dreamscapes = [
      ...content.dreamscapes,
      {
        id: "rust-expanse-test",
        name: "The Rust Expanse",
        aesthetic: "A test wasteland.",
        guideId: "maddox",
        signatureSite: "RandomSite",
        affiliationId: null,
        isStarter: false,
        dreamAvatarIds: [],
      },
    ];
    content.guides = [
      {
        id: "maddox",
        name: "Maddox",
        homeDreamscapeId: "rust-expanse-test",
        siteType: "RandomSite",
        dialog: ["Pick a road."],
        homeSpecialty: "Choose one of three sites.",
      },
    ];

    const state = buildQaScene("random-site-atlas", content);

    expect(state?.screen.type).toBe("atlas");
    const maddoxNode = Object.values(state?.atlas.nodes ?? {}).find(
      (node) =>
        node.dreamscapeId === "rust-expanse-test" && node.state === "available",
    );
    expect(maddoxNode?.state).toBe("available");
    expect(maddoxNode?.enhancedSiteType).toBe("RandomSite");
    const randomSite = maddoxNode?.sites.find(
      (site) => site.type === "RandomSite",
    );
    expect(randomSite?.isEnhanced).toBe(true);
    expect(randomSite?.randomSite?.mode).toBe("homeChoice");
  });
});

describe('the "tutorial-atlas" QA scene', () => {
  it("parks the tutorial journey at its first Atlas frontier", () => {
    const state = buildQaScene("tutorial-atlas", makeJourneyContent());

    expect(state?.screen.type).toBe("atlas");
    expect(state?.completionLevel).toBe(1);
    expect(state?.isTutorialJourney).toBe(true);
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
      const state = buildQaScene(
        `atlas${String(displayLayer)}`,
        makeJourneyContent(),
      );

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
      expect(
        available.every((node) => layerOrdinal(node.layer) === frontierLayer),
      ).toBe(true);
    });
  }

  it("never leaves an available node whose next layer is still unrevealed", () => {
    // The impossible layer-0 resting view the old scene produced showed the
    // next layer as an unseen dream. Replaying real completions guarantees the
    // reveal-two-layers-ahead rule has fired, so every choice the player can
    // make already shows one layer ahead.
    for (const displayLayer of displayLayers) {
      const state = buildQaScene(
        `atlas${String(displayLayer)}`,
        makeJourneyContent(),
      );
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

describe("the battle layer QA scenes", () => {
  const displayLayers = [1, 2, 3, 4, 5, 6, 7];

  it("loads an active battle only for the dedicated playable scene", () => {
    expect(qaSceneLoadsBattle("battle")).toBe(false);
    expect(qaSceneLoadsBattle("battle3")).toBe(false);
    expect(qaSceneLoadsBattle("battle-playable")).toBe(true);
  });

  for (const displayLayer of [1, 2]) {
    it(`parks the tutorial journey on its Layer ${String(displayLayer)} Battle start screen`, () => {
      const state = buildQaScene(
        `tutorial-battle${String(displayLayer)}`,
        makeJourneyContent(),
      );

      expect(state?.screen.type).toBe("site");
      expect(state?.completionLevel).toBe(displayLayer - 1);
      expect(state?.isTutorialJourney).toBe(true);
    });
  }

  for (const displayLayer of displayLayers) {
    it(`battle${String(displayLayer)} parks on the Layer ${String(displayLayer)} Battle start screen`, () => {
      const state = buildQaScene(
        `battle${String(displayLayer)}`,
        makeJourneyContent(),
      );

      expect(state).not.toBeNull();
      expect(state?.completionLevel).toBe(displayLayer - 1);
      expect(state?.screen.type).toBe("site");
      expect(state?.currentDreamscape).not.toBeNull();
      expect(state?.activeSiteId).toBe(
        state?.screen.type === "site" ? state.screen.siteId : null,
      );

      const node =
        state?.currentDreamscape == null
          ? undefined
          : state.atlas.nodes[state.currentDreamscape];
      expect(node).toBeDefined();
      expect(node === undefined ? undefined : layerOrdinal(node.layer)).toBe(
        displayLayer - 1,
      );
      const battleSite = node?.sites.find(
        (site) => site.id === state?.activeSiteId,
      );
      expect(battleSite?.type).toBe("Battle");
      expect(
        node?.sites
          .filter((site) => site.type !== "Battle")
          .every((site) => site.isVisited),
      ).toBe(true);
    });
  }

  it('aliases plain "battle" to the Layer 1 battle scene', () => {
    const state = buildQaScene("battle", makeJourneyContent());

    expect(state).not.toBeNull();
    expect(state?.completionLevel).toBe(0);
    expect(state?.screen.type).toBe("site");
    const node =
      state?.currentDreamscape == null
        ? undefined
        : state.atlas.nodes[state.currentDreamscape];
    expect(node === undefined ? undefined : layerOrdinal(node.layer)).toBe(0);
    expect(
      node?.sites.find((site) => site.id === state?.activeSiteId)?.type,
    ).toBe("Battle");
  });
});

describe("site QA scenes", () => {
  it("registers direct QA jumps for gameplay site screens", () => {
    const expectedSites = [["draft", "Draft"]] as const;

    for (const [sceneId, siteType] of expectedSites) {
      const state = buildQaScene(sceneId, makeJourneyContent());
      expect(state).not.toBeNull();
      expect(state?.screen.type).toBe("site");
      expect(state?.currentDreamscape).not.toBeNull();
      expect(state?.activeSiteId).toBe(
        state?.screen.type === "site" ? state.screen.siteId : null,
      );
      const node =
        state?.currentDreamscape === null ||
        state?.currentDreamscape === undefined
          ? undefined
          : state?.atlas.nodes[state.currentDreamscape];
      const activeSite = node?.sites.find(
        (site) => site.id === state?.activeSiteId,
      );
      expect(activeSite?.type).toBe(siteType);
    }
  });
});

describe('the "exploration" QA scene', () => {
  function explorationContent(): {
    content: JourneyContent;
    encounterCardId: CardData["id"];
  } {
    const content = makeJourneyContent();
    const encounterCardId = [...content.cardDatabase.values()][0]?.id;
    if (encounterCardId === undefined) {
      throw new Error("Exploration QA fixture requires a catalog card.");
    }
    content.exploration = {
      customCards: [],
      customDreamsigns: [],
      encounters: [
        {
          cardId: encounterCardId,
          prose: "A precise encounter.",
          actions: [
            {
              id: "precise-choice-a",
              label: "Choose A",
              effectText: "Gain Essence.",
              effectKind: "gain-essence-per-card",
            },
            {
              id: "precise-choice-b",
              label: "Choose B",
              effectText: "Gain Essence.",
              effectKind: "gain-essence-per-card",
            },
          ],
        },
      ],
    };
    return { content, encounterCardId };
  }

  it("prebuilds the encounter for the requested source-card UUID", () => {
    const { content, encounterCardId } = explorationContent();

    const state = buildQaScene("exploration", content, {
      explorationCardId: encounterCardId,
    });

    const runtime = Object.values(state?.siteRuntime ?? {}).find(
      (candidate) => candidate.kind === "exploration",
    );
    expect(runtime?.kind).toBe("exploration");
    if (runtime?.kind === "exploration") {
      expect(runtime.encounterCardId).toBe(encounterCardId);
    }
  });

  it("provides a dedicated duplicate-deck scene with two duplicated card UUIDs", () => {
    const { content, encounterCardId } = explorationContent();

    const state = buildQaScene("exploration-duplicates", content, {
      explorationCardId: encounterCardId,
    });

    expect(state).not.toBeNull();
    const countsByCardNumber = new Map<number, number>();
    for (const entry of state?.deck ?? []) {
      countsByCardNumber.set(
        entry.cardNumber,
        (countsByCardNumber.get(entry.cardNumber) ?? 0) + 1,
      );
    }
    expect(
      [...countsByCardNumber.values()].filter((count) => count > 1),
    ).toEqual([2, 2]);
    expect(new Set(state?.deck.map((entry) => entry.entryId)).size).toBe(
      state?.deck.length,
    );
  });

  it("holds a UUID-backed Dreamsign so purge follow-ups are exercisable", () => {
    const { content, encounterCardId } = explorationContent();
    content.dreamsignTemplates = [
      {
        id: "exploration-qa-dreamsign-id",
        name: "Exploration QA Dreamsign",
        effectDescription: "A QA effect.",
      },
    ];

    const state = buildQaScene("exploration", content, {
      explorationCardId: encounterCardId,
    });

    expect(state?.dreamsigns.map((dreamsign) => dreamsign.id)).toEqual([
      "exploration-qa-dreamsign-id",
    ]);
  });

  it("fails to build when the requested UUID has no authored encounter", () => {
    const { content } = explorationContent();

    expect(
      buildQaScene("exploration", content, {
        explorationCardId: "missing-exploration-card",
      }),
    ).toBeNull();
  });
});

describe('the "dreamscape-with-essence" QA scene', () => {
  it("parks on the dreamscape overview with an unvisited Essence site", () => {
    const state = buildQaScene("dreamscape-with-essence", makeJourneyContent());

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("dreamscape");
    expect(state?.essence).toBe(450);
    expect(state?.activeSiteId).toBeNull();
    expect(state?.currentDreamscape).not.toBeNull();

    const node = state?.currentDreamscape
      ? state.atlas.nodes[state.currentDreamscape]
      : undefined;
    const essenceSite = node?.sites.find((site) => site.type === "Essence");
    expect(essenceSite).toBeDefined();
    expect(essenceSite?.isVisited).toBe(false);
  });
});

describe('the "reward" QA scene', () => {
  it("parks on the dreamscape overview with an unvisited Reward site", () => {
    const state = buildQaScene("reward", makeJourneyContent());

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("dreamscape");
    expect(state?.activeSiteId).toBeNull();
    expect(state?.currentDreamscape).not.toBeNull();

    const node = state?.currentDreamscape
      ? state.atlas.nodes[state.currentDreamscape]
      : undefined;
    const rewardSite = node?.sites.find((site) => site.type === "Reward");
    expect(rewardSite).toBeDefined();
    expect(rewardSite?.isVisited).toBe(false);
  });

  it("builds the at-cap replacement state with UUID-backed Dreamsigns", () => {
    const content = makeJourneyContent();
    content.dreamsignTemplates = Array.from({ length: 13 }, (_, index) => ({
      id: `dreamsign-${String(index + 1)}`,
      name: `Dreamsign ${String(index + 1)}`,
      effectDescription: "A QA effect.",
    }));
    const state = buildQaScene("reward-at-cap", content);

    expect(state).not.toBeNull();
    expect(state?.dreamsigns).toHaveLength(state?.maxDreamsigns ?? 0);
    const runtime = Object.values(state?.siteRuntime ?? {}).find(
      (candidate) => candidate.kind === "reward",
    );
    expect(runtime?.kind).toBe("reward");
    if (runtime?.kind === "reward") {
      expect(runtime.reward.rewardType).toBe("dreamsign");
    }
  });
});
