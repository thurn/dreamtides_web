import { testJourneySeed } from "../types/test-identities";
import { describe, expect, it, vi } from "vitest";
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
  buildQaSceneBattle,
  findQaScene,
  qaSceneLoadsBattle,
} from "./qa-scenes";
import { createBattleInitProvider } from "../session/providers/battle-init-provider";
import {
  beginBattle,
  registerBattleInitProvider,
} from "../rules/battle/battle-events";
import { initialFoldState, type FoldState } from "../rules/fold-state";
import { reduceGameEvent } from "../rules/reducer";
import { validateLoadedState } from "../rules/journey/lifecycle";
import { TEST_CONTENT_CONFIG } from "../testing/journey-genesis";
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
  testDreamscapeArtKey,
  testDreamscapeId,
  testExplorationActionId,
  testGuideArtKey,
  testGuideId,
  testAvatarId,
  testDreamsignId,
  testDreamwellCardId,
  testDreamwellCardName,
  testEventActor,
} from "../types/test-identities";

const TUTORIAL_AVATAR_ID = TEST_TUTORIAL_PLAYER_AVATAR_ID;

const SCENE_OPTIONS = { journeySeed: testJourneySeed("qa-scenes") };

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
      buildQaScene(
        parseQaSceneId("not-a-real-scene"),
        makeJourneyContent(),
        SCENE_OPTIONS,
      ),
    ).toBeNull();
  });
});

describe('the "avatar-select" QA scene', () => {
  it("parks the run on the journeyStart Avatar selection screen", () => {
    const state = buildQaScene(
      parseQaSceneId("avatar-select"),
      makeJourneyContent(),
      SCENE_OPTIONS,
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
      SCENE_OPTIONS,
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
    const state = buildQaScene(
      parseQaSceneId("atlas"),
      makeJourneyContent(),
      SCENE_OPTIONS,
    );

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
        artKey: testDreamscapeArtKey("rust-expanse-test"),
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
        artKey: testGuideArtKey("fixture-guide"),
        headTargetX: 0.6,
        dialogue: { site: ["Pick a road."] },
        homeSpecialty: "Choose one of three sites.",
      },
    ];

    const state = buildQaScene(
      parseQaSceneId("random-site-atlas"),
      content,
      SCENE_OPTIONS,
    );

    expect(state?.screen.type).toBe("atlas");
    const maddoxNode = Object.values(state?.atlas.nodes ?? {}).find(
      (node) =>
        node.dreamscapeId === testDreamscapeId("rust-expanse-test") &&
        node.state === "available",
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
      SCENE_OPTIONS,
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
        SCENE_OPTIONS,
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

  const battleScenes = QA_SCENES.filter(
    (scene) => qaSceneLoadsBattle(scene.id) && scene.promptLab === undefined,
  );
  const labScenes = QA_SCENES.filter((scene) => scene.promptLab !== undefined);

  /** Journey content whose starter cards and Dreamwell a battle can deal. */
  function battleSceneContent(): JourneyContent {
    const base = makeJourneyContent();
    const cardDatabase = new Map(base.cardDatabase);
    const [template] = cardDatabase.values();
    for (const cardNumber of base.poolContext.starterCardNumbers) {
      cardDatabase.set(cardNumber, {
        ...template,
        id: testCardId(`qa-scene-starter-${String(cardNumber)}`),
        cardNumber,
        imageNumber: cardNumber,
        isStarter: true,
      });
    }
    return {
      ...base,
      cardDatabase,
      dreamwellCards: [
        {
          id: testDreamwellCardId("qa-scene-dreamwell"),
          name: testDreamwellCardName("QA Scene Dreamwell"),
          renderedText: "Synthetic Dreamwell fixture.",
          order: 1,
          energyAdded: 1,
          cardNumber: 1,
        },
      ],
    };
  }

  it("has battle-loading scenes to open", () => {
    expect(battleScenes.length).toBeGreaterThan(0);
  });

  for (const scene of battleScenes) {
    it(`${scene.id} loads the battle BEGIN_BATTLE folds, and LOAD_STATE accepts it`, () => {
      const content = battleSceneContent();
      const journey = buildQaScene(scene.id, content, SCENE_OPTIONS);
      if (journey === null) throw new Error("the scene did not build");
      const battle = buildQaSceneBattle(scene.id, content, journey);
      expect(battle?.engine).toBeDefined();

      const fold = {
        ...initialFoldState(journey.seed, TEST_CONTENT_CONFIG),
        journey,
      };
      const loaded = validateLoadedState(fold, { snapshot: journey, battle });
      expect(loaded?.battle?.engine).toEqual(battle?.engine);

      registerBattleInitProvider(createBattleInitProvider(content));
      try {
        const begun = beginBattle(
          fold,
          { siteId: activeSiteOf(journey) },
          {
            contentConfig: TEST_CONTENT_CONFIG,
            seq: 0,
            rng: () => 0,
            intervening: [],
            timestamp: new Date(0).toISOString(),
          },
        );
        expect(begun?.battle).toEqual(battle);
      } finally {
        registerBattleInitProvider(null);
      }
    });
  }

  it("loads each prompt-lab fixture's synthetic battle, which LOAD_STATE accepts and the journey engine replays", () => {
    const content = battleSceneContent();
    const engine = createBattleInitProvider(content).engine;
    expect(labScenes.length).toBeGreaterThan(0);
    for (const scene of labScenes) {
      const journey = buildQaScene(scene.id, content, SCENE_OPTIONS);
      if (journey === null || scene.promptLab === undefined) throw new Error(`${scene.id} did not build`);
      const battle = buildQaSceneBattle(scene.id, content, journey);
      const fold = { ...initialFoldState(journey.seed, TEST_CONTENT_CONFIG), journey };
      const loaded = validateLoadedState(fold, { snapshot: journey, battle });
      const slice = loaded?.battle?.engine?.slice;
      if (slice === undefined) throw new Error(`${scene.id} loaded no engine battle`);

      expect(slice.committed.version, scene.id).toBe(battle?.engine?.slice.committed.version);
      expect(slice.inFlight === null || engine.decision(slice.committed) === null, scene.id).toBe(true);
      expect(battle?.init.playerDeckOrder.some((definition) => definition.renderedText.length > 0), scene.id).toBe(true);
    }
  });

  it("loads a card-lab battle, reports a request it cannot serve, and folds debug actions that replay identically", () => {
    const content = battleSceneContent();
    const [card] = content.cardDatabase.values();
    if (card === undefined) throw new Error("no fixture card");
    const provider = createBattleInitProvider(content);
    const labOf = (token: string) => {
      const sceneId = parseQaSceneId(token);
      const journey = buildQaScene(sceneId, content, SCENE_OPTIONS);
      if (journey === null) throw new Error(`${token} did not build`);
      return { journey, battle: buildQaSceneBattle(sceneId, content, journey) };
    };
    const report = () => (globalThis as { __cardLab?: { status: string; reason: string | null } }).__cardLab;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { journey, battle } = labOf(`card-lab:${card.id}:base:player`);
      const slice = battle?.engine?.slice;
      expect(report()).toMatchObject({ status: "ready" });
      expect(slice?.history?.entries).toEqual([]);
      expect(
        slice?.committed.sides.player.hand.map((id) => slice.committed.instances[id]?.printing),
      ).toEqual([{ kind: "card", cardId: card.id }]);
      const asEnemy = labOf(`card-lab:${card.id}:base:enemy`).battle?.engine?.slice.committed;
      expect(asEnemy?.sides.enemy.hand).toEqual([]);

      for (const [token, reason] of [
        [`card-lab:${testCardId("missing")}:base:player`, "unknownCard"],
        [`card-lab:${card.id}:bogus:player`, "unknownVariant"],
        [`card-lab:${card.id}:base:nobody`, "unknownSide"],
      ] as const) {
        expect(labOf(token).battle?.engine?.slice.history, token).toBeUndefined();
        expect(report(), token).toMatchObject({ status: "rejected", reason });
      }
      expect(errors).toHaveBeenCalledTimes(3);

      registerBattleInitProvider(provider);
      let seq = 0;
      const fold = (state: FoldState, op: unknown) =>
        reduceGameEvent(
          state,
          {
            type: "BATTLE_DEBUG",
            payload: { op },
            actor: testEventActor("p1"),
            clientTimestamp: new Date(0).toISOString(),
            basedOnSeq: seq,
          },
          { contentConfig: TEST_CONTENT_CONFIG, seq: ++seq, rng: () => 0, intervening: [], timestamp: new Date(0).toISOString() },
        );
      const loaded = validateLoadedState({ ...initialFoldState(journey.seed, TEST_CONTENT_CONFIG), journey }, { snapshot: journey, battle });
      if (loaded === null) throw new Error("LOAD_STATE refused the card-lab battle");
      const energized = fold(loaded, { kind: "setEnergy", side: "player", energy: 3 });
      expect(energized.outcome).toBe("applied");
      expect(energized.state.battle?.engine?.slice.committed.sides.player.currentEnergy).toBe(3);
      expect(fold(loaded, { kind: "setEnergy", side: "player", energy: 3 }).state).toEqual(energized.state);
      expect(fold(energized.state, { kind: "setEnergy", side: "player" }).outcome).toBe("bounced");
      expect(fold(energized.state, { kind: "undo", keep: 0 }).state.battle?.engine?.slice.committed).toEqual(slice?.committed);
      expect(fold({ ...energized.state, battle: null }, { kind: "undo", keep: 0 }).outcome).toBe("bounced");
    } finally {
      errors.mockRestore();
      registerBattleInitProvider(null);
    }
  });

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
        SCENE_OPTIONS,
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
        SCENE_OPTIONS,
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
    const state = buildQaScene(
      parseQaSceneId("battle"),
      makeJourneyContent(),
      SCENE_OPTIONS,
    );

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
      const state = buildQaScene(
        sceneId,
        makeJourneyContent(),
        SCENE_OPTIONS,
      );
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
      ...content.exploration,
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
      ...SCENE_OPTIONS,
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
        ...SCENE_OPTIONS,
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
      SCENE_OPTIONS,
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
    const state = buildQaScene(
      parseQaSceneId("reward"),
      makeJourneyContent(),
      SCENE_OPTIONS,
    );

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
    const state = buildQaScene(
      parseQaSceneId("reward-at-cap"),
      content,
      SCENE_OPTIONS,
    );

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

describe("QA scene seeding", () => {
  // One scene per kind of seeded content: the Avatar offer's seed, Atlas
  // layouts at several depths, a parked site, a keeper battle, and an end
  // screen built on a fully replayed Atlas.
  const sceneIds = [
    "avatar-select",
    "atlas",
    "atlas4",
    "shop",
    "draft",
    "battle3",
    "dreamscape",
    "journeycomplete",
  ].map((id) => parseQaSceneId(id));

  for (const sceneId of sceneIds) {
    it(`${sceneId} is a pure function of the game seed`, () => {
      const content = makeJourneyContent();
      const seed = testJourneySeed("qa-seed-7");
      const first = buildQaScene(sceneId, content, { journeySeed: seed });
      // An intervening build with another seed leaves no trace on the next.
      buildQaScene(sceneId, content, {
        journeySeed: testJourneySeed("qa-seed-8"),
      });
      const second = buildQaScene(sceneId, content, { journeySeed: seed });

      expect(first).not.toBeNull();
      expect(first?.seed).toBe(seed);
      expect(second).toEqual(first);
    });
  }
});
