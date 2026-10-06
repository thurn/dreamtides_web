import { testJourneySeed } from "../types/test-identities";
import { describe, expect, it } from "vitest";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
  MINIMAL_SITES_DATA,
} from "../testing/atlas-fixtures";
import type { CardData } from "../types/cards";
import { parseCardName } from "../types/card-identity";
import { parseQaSceneId } from "../types/identifiers";
import { layerOrdinal } from "../types/layer-name";
import type { JourneyContent } from "../data/journey-content";
import { eligibleTransfigurations } from "../transfiguration/transfiguration-logic";
import type {
  ApollyonIncarnationContent,
  AvatarContent,
} from "../types/content";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
} from "../testing/pool-context";
import {
  QA_SCENES,
  buildQaScene,
  findQaScene,
  qaSceneLoadsBattle,
} from "./qa-scenes";
import {
  makeTutorialConfiguration,
  TEST_TUTORIAL_PLAYER_AVATAR_ID,
} from "../testing/tutorial-configuration-fixture";
import { parseSiteId, type SiteId } from "../types/identifiers";
import type { JourneyState } from "../types/journey";
import { activeSiteIdOf } from "../rules/journey/sites";
import {
  testApollyonIncarnationId,
  testCardId,
  testDreamscapeId,
  testExplorationActionId,
  testGuideId,
  testAvatarId,
  testDreamsignId,
} from "../types/test-identities";

const TUTORIAL_AVATAR_ID = TEST_TUTORIAL_PLAYER_AVATAR_ID;

function activeSiteOf(state: JourneyState | null): SiteId | null {
  return state === null ? null : activeSiteIdOf(state);
}

function makeAvatar(id = "avatar-1"): AvatarContent {
  return {
    id: testAvatarId(id),
    name: "Test Avatar",
    title: "Caller of Tests",
    renderedText: "Test ability.",
    imageNumber: "0001",
    startingEssence: 250,
  };
}

function makeIncarnations(): ApollyonIncarnationContent[] {
  return [
    {
      id: testApollyonIncarnationId("incarnation-1"),
      title: "First Incarnation",
      description: "A test incarnation.",
      deckType: "test-deck",
    },
    {
      id: testApollyonIncarnationId("incarnation-2"),
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
    avatars: [makeAvatar()],
    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: MINIMAL_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    sitesData: MINIMAL_SITES_DATA,
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
    expect(findQaScene(parseQaSceneId(`  ${scene.id.toUpperCase()}  `))).toBe(
      scene,
    );
  });

  it("returns null for an unknown scene id", () => {
    expect(findQaScene(parseQaSceneId("not-a-real-scene"))).toBeNull();
    expect(
      buildQaScene(parseQaSceneId("not-a-real-scene"), makeJourneyContent()),
    ).toBeNull();
  });
});

describe('the "avatar-select" QA scene', () => {
  it("parks the run on the journeyStart Avatar selection screen", () => {
    const state = buildQaScene(
      parseQaSceneId("avatar-select"),
      makeJourneyContent(),
    );

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("journeyStart");
    // The selection screen is shown before an Avatar is chosen, so no
    // Avatar, package, or draft state has been resolved yet.
    expect(state?.avatar).toBeNull();
    expect(state?.resolvedPackage).toBeNull();
    expect(state?.draftState).toBeNull();
  });
});

describe('the "tutorial-avatar-select" QA scene', () => {
  it("parks journeyStart on the one fixed tutorial Avatar UUID", () => {
    const content = makeJourneyContent();
    content.avatars = [makeAvatar(TUTORIAL_AVATAR_ID)];

    const state = buildQaScene(
      parseQaSceneId("tutorial-avatar-select"),
      content,
    );

    expect(state).not.toBeNull();
    expect(state?.screen).toEqual({
      type: "journeyStart",
      tutorialAvatarId: testAvatarId(TUTORIAL_AVATAR_ID),
    });
    expect(state?.avatar).toBeNull();
    expect(state?.resolvedPackage).toBeNull();
    expect(state?.draftState).toBeNull();
  });
});

describe('the "atlas" QA scene', () => {
  it("parks the run on the atlas screen with a generated boss node", () => {
    const state = buildQaScene(parseQaSceneId("atlas"), makeJourneyContent());

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("atlas");
    // Between dreamscapes: no dreamscape entered and no active site.
    expect(state?.currentDreamscape).toBeNull();
    expect(state?.avatar?.id).toBe(testAvatarId("avatar-1"));

    const bossNodeId = state?.atlas.bossNodeId;
    expect(bossNodeId).toBeTruthy();
    expect(
      bossNodeId == null ? undefined : state?.atlas.nodes[bossNodeId],
    ).toBeDefined();
  });
});

describe('the "random-site-atlas" QA scene', () => {
  it("places Maddox's enhanced Random Site on an available Atlas node", () => {
    const content = makeJourneyContent();
    content.dreamscapes = [
      ...content.dreamscapes,
      {
        id: testDreamscapeId("rust-expanse-test"),
        name: "The Rust Expanse",
        guideId: testGuideId("maddox"),
        signatureSite: "RandomSite",
        affiliationId: null,
        isStarter: false,
        avatarIds: [],
      },
    ];
    content.guides = [
      {
        id: testGuideId("maddox"),
        name: "Maddox",
        homeDreamscapeId: testDreamscapeId("rust-expanse-test"),
        siteType: "RandomSite",
        portraitSource: "fixture-guide.png",
        dialogue: { site: ["Pick a road."] },
        homeSpecialty: "Choose one of three sites.",
      },
    ];

    const state = buildQaScene(parseQaSceneId("random-site-atlas"), content);

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
    const state = buildQaScene(
      parseQaSceneId("tutorial-atlas"),
      makeJourneyContent(),
    );

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
        parseQaSceneId(`atlas${String(displayLayer)}`),
        makeJourneyContent(),
      );

      expect(state).not.toBeNull();
      expect(state?.screen.type).toBe("atlas");
      expect(state?.currentDreamscape).toBeNull();
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
});

describe("the battle layer QA scenes", () => {
  const displayLayers = [1, 2, 3, 4, 5, 6, 7];

  it("loads an active battle only for the dedicated playable scene", () => {
    expect(qaSceneLoadsBattle(parseQaSceneId("battle"))).toBe(false);
    expect(qaSceneLoadsBattle(parseQaSceneId("battle3"))).toBe(false);
    expect(qaSceneLoadsBattle(parseQaSceneId("battle-playable"))).toBe(true);
  });

  for (const displayLayer of [1, 2]) {
    it(`parks the tutorial journey on its Layer ${String(displayLayer)} Battle start screen`, () => {
      const state = buildQaScene(
        parseQaSceneId(`tutorial-battle${String(displayLayer)}`),
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
        parseQaSceneId(`battle${String(displayLayer)}`),
        makeJourneyContent(),
      );

      expect(state).not.toBeNull();
      expect(state?.completionLevel).toBe(displayLayer - 1);
      expect(state?.screen.type).toBe("site");
      expect(state?.currentDreamscape).not.toBeNull();

      const node =
        state?.currentDreamscape == null
          ? undefined
          : state.atlas.nodes[state.currentDreamscape];
      expect(node).toBeDefined();
      expect(node === undefined ? undefined : layerOrdinal(node.layer)).toBe(
        displayLayer - 1,
      );
      const battleSite = node?.sites.find(
        (site) => site.id === activeSiteOf(state),
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
    const state = buildQaScene(parseQaSceneId("battle"), makeJourneyContent());

    expect(state).not.toBeNull();
    expect(state?.completionLevel).toBe(0);
    expect(state?.screen.type).toBe("site");
    const node =
      state?.currentDreamscape == null
        ? undefined
        : state.atlas.nodes[state.currentDreamscape];
    expect(node === undefined ? undefined : layerOrdinal(node.layer)).toBe(0);
    expect(
      node?.sites.find((site) => site.id === activeSiteOf(state))?.type,
    ).toBe("Battle");
  });
});

describe("site QA scenes", () => {
  it("registers direct QA jumps for gameplay site screens", () => {
    const expectedSites = [[parseQaSceneId("draft"), "Draft"]] as const;

    for (const [sceneId, siteType] of expectedSites) {
      const state = buildQaScene(sceneId, makeJourneyContent());
      expect(state).not.toBeNull();
      expect(state?.screen.type).toBe("site");
      expect(state?.currentDreamscape).not.toBeNull();
      const node =
        state?.currentDreamscape === null ||
        state?.currentDreamscape === undefined
          ? undefined
          : state?.atlas.nodes[state.currentDreamscape];
      const activeSite = node?.sites.find(
        (site) => site.id === activeSiteOf(state),
      );
      expect(activeSite?.type).toBe(siteType);
    }
  });
});

describe('the "exploration" QA scene', () => {
  const STARTER_CARD_IDS = Array.from(
    { length: 10 },
    (_, index) =>
      `b0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );

  function addStarterCatalog(content: JourneyContent): void {
    const starterCardNumbers = content.poolContext?.starterCardNumbers ?? [];
    starterCardNumbers.forEach((cardNumber, index) => {
      const id = STARTER_CARD_IDS[index];
      if (id === undefined) {
        throw new Error("Exploration QA fixture has too many starter cards.");
      }
      content.cardDatabase.set(cardNumber, {
        id: testCardId(id),
        name: parseCardName(`QA Starter ${String(index + 1)}`),
        cardNumber,
        cardType: index % 2 === 0 ? "Character" : "Event",
        subtype: index % 2 === 0 ? "Survivor" : "",
        isStarter: true,
        roles: ["starter-deck"],
        energyCost: 1,
        spark: 1,
        isFast: false,
        renderedText: "",
        imageNumber: cardNumber,
        artOwned: true,
      });
    });
  }

  function explorationContent(): {
    content: JourneyContent;
    encounterCardId: CardData["id"];
  } {
    const content = makeJourneyContent();
    addStarterCatalog(content);
    const nonStarterCards = [...content.cardDatabase.values()].filter(
      (card) => !card.isStarter,
    );
    nonStarterCards.slice(0, 8).forEach((card) => {
      content.cardDatabase.set(card.cardNumber, {
        ...card,
        cardType: "Character",
        subtype: "Survivor",
      });
    });
    nonStarterCards.slice(8, 14).forEach((card) => {
      content.cardDatabase.set(card.cardNumber, {
        ...card,
        cardType: "Event",
        subtype: "",
      });
    });
    nonStarterCards.slice(14, 16).forEach((card) => {
      content.cardDatabase.set(card.cardNumber, {
        ...card,
        cardType: "Character",
        subtype: "Warrior",
      });
    });
    nonStarterCards.slice(16, 22).forEach((card) => {
      content.cardDatabase.set(card.cardNumber, {
        ...card,
        cardType: "Character",
        subtype: "Spirit Animal",
      });
    });
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
              id: testExplorationActionId("precise-choice-a"),
              label: "Choose A",
              effectText: "Gain Essence.",
              effectKind: "gain-essence-per-card",
            },
            {
              id: testExplorationActionId("precise-choice-b"),
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

    const state = buildQaScene(parseQaSceneId("exploration"), content, {
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

  it("parks the purchase-path scene before Exploration with Shop and Bazaar siblings", () => {
    const { content, encounterCardId } = explorationContent();

    const state = buildQaScene(
      parseQaSceneId("exploration-purchases"),
      content,
      {
        explorationCardId: encounterCardId,
        journeySeed: testJourneySeed("qa-purchase-path"),
      },
    );
    const currentNode =
      state?.currentDreamscape === null ||
      state?.currentDreamscape === undefined
        ? undefined
        : state.atlas.nodes[state.currentDreamscape];
    const activeSite = currentNode?.sites.find(
      (site) => site.id === activeSiteOf(state),
    );
    const shop = currentNode?.sites.find((site) => site.type === "Shop");
    const bazaar = currentNode?.sites.find(
      (site) => site.type === "DreamsignBazaar",
    );
    const battleIndex =
      currentNode?.sites.findIndex((site) => site.type === "Battle") ?? -1;
    const bazaarIndex =
      currentNode?.sites.findIndex((site) => site.type === "DreamsignBazaar") ??
      -1;

    expect(state).not.toBeNull();
    expect(state?.seed).toBe("qa-purchase-path");
    expect(state?.essence).toBe(101);
    expect(state?.screen).toEqual({
      type: "site",
      siteId: activeSiteOf(state),
    });
    expect(activeSite?.type).toBe("Exploration");
    expect(activeSite?.isVisited).toBe(false);
    expect(shop).toMatchObject({
      type: "Shop",
      isEnhanced: false,
      isVisited: false,
    });
    expect(bazaar).toMatchObject({
      id: parseSiteId(`${activeSiteOf(state) ?? "none"}-qa-dreamsign-bazaar`),
      type: "DreamsignBazaar",
      isEnhanced: false,
      isVisited: false,
    });
    expect(bazaarIndex).toBe(battleIndex - 1);
  });

  it("provides a dedicated duplicate-deck scene with two duplicated card UUIDs", () => {
    const { content, encounterCardId } = explorationContent();
    for (const [cardNumber, card] of content.cardDatabase) {
      if (card.isStarter) continue;
      content.cardDatabase.set(cardNumber, {
        ...card,
        renderedText: "2●: Gain 1 spark.",
      });
    }

    const state = buildQaScene(
      parseQaSceneId("exploration-duplicates"),
      content,
      {
        explorationCardId: encounterCardId,
      },
    );

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
    for (const [cardNumber, count] of countsByCardNumber) {
      if (count <= 1) continue;
      const card = content.cardDatabase.get(cardNumber);
      if (card === undefined) {
        throw new Error(
          "Duplicated QA deck cards must resolve in the catalog.",
        );
      }
      expect(
        eligibleTransfigurations(content.transfigurationData, card),
      ).toContain("Attuned");
    }
    expect(new Set(state?.deck.map((entry) => entry.entryId)).size).toBe(
      state?.deck.length,
    );
  });
});

describe('the "dreamscape-with-essence" QA scene', () => {
  it("parks on the dreamscape overview with an unvisited Essence site", () => {
    const state = buildQaScene(
      parseQaSceneId("dreamscape-with-essence"),
      makeJourneyContent(),
    );

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("dreamscape");
    expect(state?.essence).toBe(450);
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
    const state = buildQaScene(parseQaSceneId("reward"), makeJourneyContent());

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("dreamscape");
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
      id: testDreamsignId(`dreamsign-${String(index + 1)}`),
      name: `Dreamsign ${String(index + 1)}`,
      effectDescription: "A QA effect.",
    }));
    const state = buildQaScene(parseQaSceneId("reward-at-cap"), content);

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
