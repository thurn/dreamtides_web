import { describe, expect, it } from "vitest";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
  MINIMAL_SITES_DATA,
} from "../__test-helpers__/atlas-fixtures";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
import { asQaSceneId } from "../types/identifiers";
import { layerOrdinal } from "../types/layer-name";
import type { JourneyContent } from "../data/journey-content";
import type {
  ExplorationActionContent,
  ExplorationEffectKind,
  ExplorationFixedSiteType,
} from "../data/exploration";
import type {
  ExplorationActionOfferRuntime,
  ExplorationSiteRuntime,
  JourneyState,
  SiteState,
} from "../types/journey";
import {
  buildExplorationRuntime,
  resolveExplorationChoice,
} from "../coop/providers/exploration-provider";
import { NIGHTMARE_CARD_ID } from "../data/nightmare";
import { eligibleTransfigurations } from "../transfiguration/transfiguration-logic";
import { createSiteContentProvider } from "../coop/providers/site-provider";
import { openSite, registerSiteContentProvider } from "../rules/journey/sites";
import { buyShopSlot, rerollShop } from "../rules/journey/shop";
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
import { asSiteId } from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import type { SiteId } from "../types/identifiers";
import { asGuideId } from "../types/identifiers";
import { asDreamscapeId } from "../types/identifiers";
import { asApollyonIncarnationId } from "../types/identifiers";
import { asDreamAvatarId } from "../types/identifiers";
import { asDreamsignId } from "../types/identifiers";
import { asExplorationActionId } from "../types/identifiers";
import { asDeckEntryId } from "../types/identifiers";

const TUTORIAL_DREAM_AVATAR_ID = TEST_TUTORIAL_PLAYER_AVATAR_ID;

function makeDreamAvatar(id = "dream-avatar-1"): DreamAvatarContent {
  return {
    id: asDreamAvatarId(id),
    name: "Test DreamAvatar",
    title: "Caller of Tests",
    renderedText: "Test ability.",
    imageNumber: "0001",
    startingEssence: 250,
    signatureCards: [asCardName("Alpha Card 1")],
  };
}

function makeIncarnations(): ApollyonIncarnationContent[] {
  return [
    {
      id: asApollyonIncarnationId("incarnation-1"),
      title: "First Incarnation",
      description: "A test incarnation.",
      deckType: "test-deck",
    },
    {
      id: asApollyonIncarnationId("incarnation-2"),
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
    expect(findQaScene(asQaSceneId(`  ${scene.id.toUpperCase()}  `))).toBe(
      scene,
    );
  });

  it("returns null for an unknown scene id", () => {
    expect(findQaScene(asQaSceneId("not-a-real-scene"))).toBeNull();
    expect(
      buildQaScene(asQaSceneId("not-a-real-scene"), makeJourneyContent()),
    ).toBeNull();
  });

  it("registers the Augury site under its canonical QA ids", () => {
    expect(findQaScene(asQaSceneId("augury"))?.label).toBe("Augury");
    expect(findQaScene(asQaSceneId("augury-enhanced"))?.label).toBe(
      "Augury (Enhanced)",
    );
  });
});

describe('the "dream-avatar-select" QA scene', () => {
  it("parks the run on the journeyStart DreamAvatar selection screen", () => {
    const state = buildQaScene(
      asQaSceneId("dream-avatar-select"),
      makeJourneyContent(),
    );

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

    const state = buildQaScene(
      asQaSceneId("tutorial-dream-avatar-select"),
      content,
    );

    expect(state).not.toBeNull();
    expect(state?.screen).toEqual({
      type: "journeyStart",
      tutorialDreamAvatarId: asDreamAvatarId(TUTORIAL_DREAM_AVATAR_ID),
    });
    expect(state?.dreamAvatar).toBeNull();
    expect(state?.resolvedPackage).toBeNull();
    expect(state?.draftState).toBeNull();
  });

  it("fails to build when the required tutorial DreamAvatar is unavailable", () => {
    expect(
      buildQaScene(
        asQaSceneId("tutorial-dream-avatar-select"),
        makeJourneyContent(),
      ),
    ).toBeNull();
  });
});

describe('the "atlas" QA scene', () => {
  it("parks the run on the atlas screen with a generated boss node", () => {
    const state = buildQaScene(asQaSceneId("atlas"), makeJourneyContent());

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
    const state = buildQaScene(
      asQaSceneId("atlas"),
      makeJourneyContent(incarnations),
    );

    const incarnationId = state?.atlas.bossIncarnationId;
    expect(incarnationId).toBeTruthy();
    expect(incarnations.map((i) => i.id)).toContain(incarnationId);
  });

  it("parks on the layer-1 frontier, a genuinely reachable resting state", () => {
    const state = buildQaScene(asQaSceneId("atlas"), makeJourneyContent());
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
        id: asDreamscapeId("rust-expanse-test"),
        name: "The Rust Expanse",
        guideId: asGuideId("maddox"),
        signatureSite: "RandomSite",
        affiliationId: null,
        isStarter: false,
        dreamAvatarIds: [],
      },
    ];
    content.guides = [
      {
        id: asGuideId("maddox"),
        name: "Maddox",
        homeDreamscapeId: asDreamscapeId("rust-expanse-test"),
        siteType: "RandomSite",
        portraitSource: "fixture-guide.png",
        dialogue: { site: ["Pick a road."] },
        homeSpecialty: "Choose one of three sites.",
      },
    ];

    const state = buildQaScene(asQaSceneId("random-site-atlas"), content);

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
      asQaSceneId("tutorial-atlas"),
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
        asQaSceneId(`atlas${String(displayLayer)}`),
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
        asQaSceneId(`atlas${String(displayLayer)}`),
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
      expect(
        findQaScene(asQaSceneId(`atlas${String(displayLayer)}`)),
      ).not.toBeNull();
    }
    // Layer I (the starter) is never a resting frontier.
    expect(findQaScene(asQaSceneId("atlas1"))).toBeNull();
  });
});

describe("the battle layer QA scenes", () => {
  const displayLayers = [1, 2, 3, 4, 5, 6, 7];

  it("loads an active battle only for the dedicated playable scene", () => {
    expect(qaSceneLoadsBattle(asQaSceneId("battle"))).toBe(false);
    expect(qaSceneLoadsBattle(asQaSceneId("battle3"))).toBe(false);
    expect(qaSceneLoadsBattle(asQaSceneId("battle-playable"))).toBe(true);
  });

  for (const displayLayer of [1, 2]) {
    it(`parks the tutorial journey on its Layer ${String(displayLayer)} Battle start screen`, () => {
      const state = buildQaScene(
        asQaSceneId(`tutorial-battle${String(displayLayer)}`),
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
        asQaSceneId(`battle${String(displayLayer)}`),
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
    const state = buildQaScene(asQaSceneId("battle"), makeJourneyContent());

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
    const expectedSites = [[asQaSceneId("draft"), "Draft"]] as const;

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
  const STARTER_CARD_IDS = Array.from(
    { length: 10 },
    (_, index) =>
      `b0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  const DREAMSIGN_IDS = Array.from(
    { length: 8 },
    (_, index) =>
      `a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ).map(asDreamsignId);

  function addDreamsignCatalog(content: JourneyContent): void {
    content.dreamsignTemplates = DREAMSIGN_IDS.map((id, index) => ({
      id,
      name: `QA Dreamsign ${String(index + 1)}`,
      effectDescription: "A deterministic QA effect.",
    }));
    content.poolContext = makeTestPoolContext(DREAMSIGN_IDS);
  }

  function addStarterCatalog(content: JourneyContent): void {
    const starterCardNumbers = content.poolContext?.starterCardNumbers ?? [];
    starterCardNumbers.forEach((cardNumber, index) => {
      const id = STARTER_CARD_IDS[index];
      if (id === undefined) {
        throw new Error("Exploration QA fixture has too many starter cards.");
      }
      content.cardDatabase.set(cardNumber, {
        id: asCardId(id),
        name: asCardName(`QA Starter ${String(index + 1)}`),
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

  function dreamsignAction(
    effectKind: ExplorationEffectKind,
  ): ExplorationActionContent {
    return {
      id: asExplorationActionId("c0000000-0000-4000-8000-000000000001"),
      label: "Exercise Dreamsign plan",
      effectText: "Prepare a deterministic Dreamsign mutation.",
      effectKind,
      ...(effectKind === "gain-offered-dreamsign" ||
      effectKind === "replace-selected-dreamsign-with-offered"
        ? { offerCount: 3 }
        : {}),
      ...(effectKind === "purge-selected-dreamsign-and-gain-random"
        ? { count: 3 }
        : {}),
    };
  }

  function starterAction(
    effectKind:
      | "purge-starter-card"
      | "purge-random-starter-card"
      | "purge-random-starter-and-gain-card"
      | "replace-all-starter-cards",
  ): ExplorationActionContent {
    return {
      id: asExplorationActionId("d0000000-0000-4000-8000-000000000001"),
      label: "Exercise starter plan",
      effectText: "Prepare a deterministic starter-card mutation.",
      effectKind,
      ...(effectKind === "purge-random-starter-and-gain-card"
        ? { predicate: "survivor" as const }
        : effectKind === "replace-all-starter-cards"
          ? { predicate: "character" as const }
          : {}),
    };
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
              id: asExplorationActionId("precise-choice-a"),
              label: "Choose A",
              effectText: "Gain Essence.",
              effectKind: "gain-essence-per-card",
            },
            {
              id: asExplorationActionId("precise-choice-b"),
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

  function wave4bOffer(input: {
    readonly encounterCardId: CardData["id"];
    readonly action: ExplorationActionContent;
    readonly seed: string;
  }): {
    readonly content: JourneyContent;
    readonly state: NonNullable<ReturnType<typeof buildQaScene>>;
    readonly offer: ExplorationActionOfferRuntime;
  } {
    const { content } = explorationContent();
    const exploration = content.exploration;
    if (exploration === undefined) {
      throw new Error("Exploration QA fixture requires content.");
    }
    const sourceCard = [...content.cardDatabase.values()].find(
      (card) => !card.isStarter,
    );
    if (sourceCard === undefined) {
      throw new Error("Exploration QA fixture requires a source card.");
    }
    const encounterCardNumber = Math.max(...content.cardDatabase.keys()) + 1;
    content.cardDatabase.set(encounterCardNumber, {
      ...sourceCard,
      id: input.encounterCardId,
      name: asCardName("Wave 4b Encounter Fixture"),
      cardNumber: encounterCardNumber,
      imageNumber: encounterCardNumber,
    });
    content.exploration = {
      ...exploration,
      encounters: [
        {
          cardId: input.encounterCardId,
          prose: "A deterministic Wave 4b encounter.",
          actions: [input.action],
        },
      ],
    };
    const state = buildQaScene(asQaSceneId("exploration"), content, {
      explorationCardId: input.encounterCardId,
      journeySeed: input.seed,
    });
    const runtime = Object.values(state?.siteRuntime ?? {}).find(
      (candidate) => candidate.kind === "exploration",
    );
    const offer =
      runtime?.kind === "exploration" ? runtime.actionOffers[0] : undefined;
    if (
      state === null ||
      runtime?.kind !== "exploration" ||
      offer === undefined
    ) {
      throw new Error("Wave 4b QA encounter must prepare its selected action.");
    }
    expect(runtime.encounterCardId).toBe(input.encounterCardId);
    expect(offer.actionId).toBe(input.action.id);
    return { content, state, offer };
  }

  function wave5SiteInsertionOffer(input: {
    readonly encounterCardId: CardId;
    readonly actionId: string;
    readonly siteType: ExplorationFixedSiteType;
    readonly seed: string;
  }): {
    readonly state: NonNullable<ReturnType<typeof buildQaScene>>;
    readonly offer: ExplorationActionOfferRuntime;
  } {
    const { content } = explorationContent();
    const sourceCard = [...content.cardDatabase.values()].find(
      (card) => !card.isStarter,
    );
    if (sourceCard === undefined || content.exploration === undefined) {
      throw new Error("Wave 5 QA fixture requires Exploration content.");
    }
    const encounterCardNumber = Math.max(...content.cardDatabase.keys()) + 1;
    const encounterCardId = asCardId(input.encounterCardId);
    content.cardDatabase.set(encounterCardNumber, {
      ...sourceCard,
      id: encounterCardId,
      name: asCardName("Wave 5 Encounter Fixture"),
      cardNumber: encounterCardNumber,
      imageNumber: encounterCardNumber,
    });
    content.exploration = {
      ...content.exploration,
      encounters: [
        {
          cardId: encounterCardId,
          prose: "A deterministic Wave 5 encounter.",
          actions: [
            {
              id: asExplorationActionId(input.actionId),
              label: "Open a fixed site",
              effectText: "Add a fixed site to this Dreamscape.",
              effectKind: "add-fixed-site",
              canonicalMechanicId: "add-site",
              selectionPolicyId: "fixed",
              siteType: input.siteType,
            },
          ],
        },
      ],
    };

    const state = buildQaScene(asQaSceneId("exploration"), content, {
      explorationCardId: input.encounterCardId,
      journeySeed: input.seed,
    });
    const runtime = Object.values(state?.siteRuntime ?? {}).find(
      (candidate) => candidate.kind === "exploration",
    );
    const offer =
      runtime?.kind === "exploration" ? runtime.actionOffers[0] : undefined;
    if (
      state === null ||
      runtime?.kind !== "exploration" ||
      offer === undefined
    ) {
      throw new Error("Wave 5 QA encounter must prepare its selected action.");
    }
    expect(runtime.encounterCardId).toBe(input.encounterCardId);
    expect(offer.actionId).toBe(input.actionId);
    return { state, offer };
  }

  function wave5bSiteTypeChoiceOffer(input: {
    readonly encounterCardId: CardId;
    readonly actionId: string;
    readonly seed: string;
  }): {
    readonly state: NonNullable<ReturnType<typeof buildQaScene>>;
    readonly offer: ExplorationActionOfferRuntime;
  } {
    const { content } = explorationContent();
    const sourceCard = [...content.cardDatabase.values()].find(
      (card) => !card.isStarter,
    );
    if (sourceCard === undefined || content.exploration === undefined) {
      throw new Error("Wave 5b QA fixture requires Exploration content.");
    }
    const encounterCardNumber = Math.max(...content.cardDatabase.keys()) + 1;
    const encounterCardId = asCardId(input.encounterCardId);
    content.cardDatabase.set(encounterCardNumber, {
      ...sourceCard,
      id: encounterCardId,
      name: asCardName("Wave 5b Encounter Fixture"),
      cardNumber: encounterCardNumber,
      imageNumber: encounterCardNumber,
    });
    content.exploration = {
      ...content.exploration,
      encounters: [
        {
          cardId: encounterCardId,
          prose: "A deterministic Wave 5b encounter.",
          actions: [
            {
              id: asExplorationActionId(input.actionId),
              label: "Choose a site",
              effectText: "Choose one of three sites to add.",
              followupTitle: "Choose a site",
              followupSubtitle: "Choose one prepared site.",
              effectKind: "choose-site-type",
              canonicalMechanicId: "add-site",
              selectionPolicyId: "site-uniform",
              offerCount: 3,
            },
          ],
        },
      ],
    };

    const state = buildQaScene(asQaSceneId("exploration"), content, {
      explorationCardId: input.encounterCardId,
      journeySeed: input.seed,
    });
    const runtime = Object.values(state?.siteRuntime ?? {}).find(
      (candidate) => candidate.kind === "exploration",
    );
    const offer =
      runtime?.kind === "exploration" ? runtime.actionOffers[0] : undefined;
    if (
      state === null ||
      runtime?.kind !== "exploration" ||
      offer === undefined
    ) {
      throw new Error("Wave 5b QA encounter must prepare its selected action.");
    }
    expect(runtime.encounterCardId).toBe(input.encounterCardId);
    expect(offer.actionId).toBe(input.actionId);
    return { state, offer };
  }

  function wave6ShopModifierOffer(input: {
    readonly encounterCardId: CardId;
    readonly action: ExplorationActionContent;
    readonly seed: string;
  }): {
    readonly content: JourneyContent;
    readonly state: NonNullable<ReturnType<typeof buildQaScene>>;
    readonly sourceSite: SiteState;
    readonly shopSite: SiteState;
    readonly bazaarSite: SiteState;
    readonly offer: ExplorationActionOfferRuntime;
  } {
    const { content } = explorationContent();
    addDreamsignCatalog(content);
    const sourceCard = [...content.cardDatabase.values()].find(
      (card) => !card.isStarter,
    );
    if (sourceCard === undefined || content.exploration === undefined) {
      throw new Error("Wave 6 QA fixture requires Exploration content.");
    }
    const encounterCardNumber = Math.max(...content.cardDatabase.keys()) + 1;
    const encounterCardId = asCardId(input.encounterCardId);
    content.cardDatabase.set(encounterCardNumber, {
      ...sourceCard,
      id: encounterCardId,
      name: asCardName("Wave 6 Encounter Fixture"),
      cardNumber: encounterCardNumber,
      imageNumber: encounterCardNumber,
    });
    content.exploration = {
      ...content.exploration,
      encounters: [
        {
          cardId: encounterCardId,
          prose: "A deterministic Wave 6 encounter.",
          actions: [input.action],
        },
      ],
    };

    const state = buildQaScene(asQaSceneId("exploration-purchases"), content, {
      explorationCardId: encounterCardId,
      journeySeed: input.seed,
    });
    const node =
      state?.currentDreamscape === null ||
      state?.currentDreamscape === undefined
        ? undefined
        : state.atlas.nodes[state.currentDreamscape];
    const sourceSite = node?.sites.find(
      (site) => site.id === state?.activeSiteId,
    );
    const shopSite = node?.sites.find((site) => site.type === "Shop");
    const bazaarSite = node?.sites.find(
      (site) => site.type === "DreamsignBazaar",
    );
    const runtime = Object.values(state?.siteRuntime ?? {}).find(
      (candidate) => candidate.kind === "exploration",
    );
    const offer =
      runtime?.kind === "exploration" ? runtime.actionOffers[0] : undefined;
    if (
      state === null ||
      sourceSite?.type !== "Exploration" ||
      shopSite === undefined ||
      bazaarSite === undefined ||
      runtime?.kind !== "exploration" ||
      offer === undefined
    ) {
      throw new Error("Wave 6 QA encounter must prepare its purchase path.");
    }
    expect(runtime.encounterCardId).toBe(encounterCardId);
    expect(offer.actionId).toBe(input.action.id);
    return { content, state, sourceSite, shopSite, bazaarSite, offer };
  }

  const WAVE7_FIXED_REPLACEMENT_CARD_ID = asCardId(
    "ffec9fdd-d948-4756-b7df-39b9e982613e",
  );
  const WAVE7_LEGENDARY_CARD_ID = asCardId(
    "e0000000-0000-4000-8000-000000000072",
  );

  const WAVE8_ACTION_IDS = {
    40: "7b390b9d-5d57-4a70-b25b-aaa5f842a1ca",
    75: "7c4aa242-8a27-4835-8ad0-4abc08b18e60",
    77: "fcce63dc-f8c5-4183-be2a-9de4929ca8c2",
    78: "2352e33a-f5a3-461e-ab6d-d1d6eb15c6b9",
    80: "e01fd10a-0e68-4bf4-b0fb-9859ba0d6443",
  } as const;

  function wave8Action(
    template: keyof typeof WAVE8_ACTION_IDS,
  ): ExplorationActionContent {
    const common = {
      id: asExplorationActionId(WAVE8_ACTION_IDS[template]),
      label: `T${String(template)} fixture`,
      effectText: `T${String(template)} fixture effect.`,
    };
    switch (template) {
      case 40:
        return {
          ...common,
          effectKind: "transfigure-all-cards",
          canonicalMechanicId: "transfigure-deck-entry",
          selectionPolicyId: "uniform",
        };
      case 75:
        return {
          ...common,
          effectText: "Purge {deck_card} and transfigure its companions.",
          effectKind: "purge-disclosed-and-transfigure-same-type",
          canonicalMechanicId: "purge-deck-entry",
          selectionPolicyId: "purge-misfit",
          transfiguration: "Resonant",
        };
      case 77:
        return {
          ...common,
          effectKind: "make-predicate-fast-and-gain-nightmares",
          canonicalMechanicId: "make-deck-fast",
          predicate: "event",
          nightmareCount: 2,
        };
      case 78:
        return {
          ...common,
          effectKind: "take-transfigured-cards-and-gain-nightmares",
          canonicalMechanicId: "transfigured-card-chooser",
          selectionPolicyId: "card-fit",
          predicate: "event",
          offerCount: 4,
          transfiguration: "Enduring",
          nightmareCount: 2,
          followupTitle: "T78 fixture",
          followupSubtitle: "Choose zero or more prepared cards.",
        };
      case 80:
        return {
          ...common,
          effectKind: "purge-one-transfigure-and-copy-others",
          canonicalMechanicId: "transfigure-deck-entry",
          selectionPolicyId: "uniform",
          offerCount: 4,
          transfiguration: "Attuned",
          followupTitle: "T80 fixture",
          followupSubtitle: "Choose one prepared entry to purge.",
        };
    }
  }

  function wave8Offer(input: {
    readonly encounterCardId: CardId;
    readonly action: ExplorationActionContent;
    readonly seed: string;
    readonly duplicateDeck?: boolean;
    readonly deckTransform?: (
      deck: JourneyState["deck"],
      content: JourneyContent,
    ) => JourneyState["deck"];
  }): {
    readonly content: JourneyContent;
    readonly state: NonNullable<ReturnType<typeof buildQaScene>>;
    readonly sourceSite: SiteState;
    readonly runtime: ExplorationSiteRuntime;
    readonly offer: ExplorationActionOfferRuntime;
  } {
    const { content } = explorationContent();
    const sourceCard = [...content.cardDatabase.values()].find(
      (card) => !card.isStarter,
    );
    if (sourceCard === undefined || content.exploration === undefined) {
      throw new Error("Wave 8 QA fixture requires Exploration content.");
    }

    for (const [cardNumber, card] of content.cardDatabase) {
      content.cardDatabase.set(cardNumber, {
        ...card,
        renderedText: "▸Dawn: Gain 1 spark. 2●: Gain 1 spark.",
      });
    }

    const nightmareCardNumber = Math.max(...content.cardDatabase.keys()) + 1;
    content.cardDatabase.set(nightmareCardNumber, {
      ...sourceCard,
      id: NIGHTMARE_CARD_ID,
      name: asCardName("Wave 8 Nightmare Fixture"),
      cardNumber: nightmareCardNumber,
      cardType: "Event",
      subtype: "",
      isStarter: false,
      roles: ["nightmare"],
      rarity: "Special",
      energyCost: 0,
      spark: null,
      imageNumber: nightmareCardNumber,
    });

    const encounterCardNumber = nightmareCardNumber + 1;
    const encounterCardId = asCardId(input.encounterCardId);
    content.cardDatabase.set(encounterCardNumber, {
      ...sourceCard,
      id: encounterCardId,
      name: asCardName("Wave 8 Encounter Fixture"),
      cardNumber: encounterCardNumber,
      imageNumber: encounterCardNumber,
    });
    content.exploration = {
      ...content.exploration,
      encounters: [
        {
          cardId: encounterCardId,
          prose: "A deterministic Wave 8 encounter.",
          actions: [input.action],
        },
      ],
    };

    const baseState = buildQaScene(
      asQaSceneId(
        input.duplicateDeck ? "exploration-duplicates" : "exploration",
      ),
      content,
      { journeySeed: input.seed },
    );
    if (baseState === null) {
      throw new Error("Wave 8 QA scene foundation must build.");
    }
    const sourceSite = Object.values(baseState.atlas.nodes)
      .flatMap((node) => node.sites)
      .find((site) => site.id === baseState.activeSiteId);
    if (sourceSite?.type !== "Exploration") {
      throw new Error("Wave 8 QA fixture requires an active Exploration site.");
    }
    const preparedState = {
      ...baseState,
      deck:
        input.deckTransform === undefined
          ? baseState.deck
          : input.deckTransform(baseState.deck, content),
    };
    const runtime = buildExplorationRuntime(
      preparedState,
      sourceSite,
      content,
      () => 0.37,
      encounterCardId,
    );
    const offer = runtime?.actionOffers[0];
    if (runtime === null || offer === undefined) {
      throw new Error("Wave 8 QA encounter must prepare its selected action.");
    }
    const state = {
      ...preparedState,
      siteRuntime: {
        ...preparedState.siteRuntime,
        [sourceSite.id]: runtime,
      },
    };
    expect(runtime.encounterCardId).toBe(encounterCardId);
    expect(offer.actionId).toBe(input.action.id);
    return { content, state, sourceSite, runtime, offer };
  }

  function resolveWave8Offer(input: {
    readonly content: JourneyContent;
    readonly state: NonNullable<ReturnType<typeof buildQaScene>>;
    readonly sourceSite: SiteState;
    readonly runtime: ExplorationSiteRuntime;
    readonly actionId: string;
    readonly selection: Record<string, unknown>;
    readonly seq: number;
  }): NonNullable<ReturnType<typeof resolveExplorationChoice>> {
    const resolved = resolveExplorationChoice({
      journey: input.state,
      site: input.sourceSite,
      payload: {
        actionId: input.actionId,
        selection: input.selection,
        ...(input.runtime.selectionRulesVersion === undefined
          ? {}
          : {
              selectionRulesVersion: input.runtime.selectionRulesVersion,
            }),
      },
      seq: input.seq,
      content: input.content,
    });
    if (resolved === null) {
      throw new Error(
        "Wave 8 QA action must resolve from its prepared intent.",
      );
    }
    return resolved;
  }

  it("provides the mixed, untransfigured deck and full draft package required by Wave 8", () => {
    const { content, state } = wave8Offer({
      encounterCardId: asCardId("e0000000-0000-4000-8000-000000000840"),
      seed: "4001",
      action: wave8Action(40),
    });
    const deckCards = state.deck.map((entry) => {
      const card = content.cardDatabase.get(entry.cardNumber);
      if (card === undefined) {
        throw new Error(
          "Wave 8 deck entries must resolve through the catalog.",
        );
      }
      return card;
    });
    const draftCardNumbers = Object.entries(
      state.draftState?.draftPoolCopiesByCard ?? {},
    ).flatMap(([cardNumber, copies]) =>
      copies > 0 ? [Number(cardNumber)] : [],
    );

    expect(state.deck.length).toBeGreaterThanOrEqual(4);
    expect(new Set(state.deck.map((entry) => entry.entryId)).size).toBe(
      state.deck.length,
    );
    expect(state.deck.every((entry) => entry.transfiguration === null)).toBe(
      true,
    );
    expect(new Set(deckCards.map((card) => card.cardType))).toEqual(
      new Set(["Character", "Event"]),
    );
    expect(
      state.deck.some(
        (entry, index) =>
          deckCards[index].cardType === "Event" &&
          entry.keywordModification?.fast === true,
      ),
    ).toBe(true);
    expect(
      deckCards.filter((card) => card.subtype === "Survivor").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      deckCards.filter((card) => card.subtype === "Warrior").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      deckCards.filter((card) => card.subtype === "Spirit Animal").length,
    ).toBeGreaterThanOrEqual(4);
    expect(draftCardNumbers).toHaveLength(
      state.resolvedPackage?.draftPoolSize ?? 0,
    );
    expect(draftCardNumbers.length).toBeGreaterThanOrEqual(4);
    expect(
      [...content.cardDatabase.values()].some(
        (card) =>
          card.id === NIGHTMARE_CARD_ID && card.roles?.includes("nightmare"),
      ),
    ).toBe(true);
  });

  it("prepares and resolves T40 from one exact signed all-card plan", () => {
    const { content, state, sourceSite, runtime, offer } = wave8Offer({
      encounterCardId: asCardId("e0000000-0000-4000-8000-000000000840"),
      seed: "4001",
      action: wave8Action(40),
    });
    const preparation = offer.compoundActionPreparation;
    if (preparation?.kind !== "all-card-transfiguration") {
      throw new Error("T40 QA fixture requires an all-card preparation.");
    }

    expect(Object.keys(preparation).sort()).toEqual(
      [
        "allCards",
        "kind",
        "planSignature",
        "selectionContentRevision",
        "selectionKey",
        "selectionRulesVersion",
        "selectorSignatures",
        "selectorTraces",
        "targets",
      ].sort(),
    );
    expect(preparation.selectionKey).toBe(WAVE8_ACTION_IDS[40]);
    expect(preparation.planSignature).toMatch(/^[0-9a-f]{64}$/u);
    expect(preparation.allCards).toHaveLength(state.deck.length);
    expect(preparation.targets).toHaveLength(state.deck.length);
    expect(
      preparation.targets.map(({ entryId, cardId }) => ({ entryId, cardId })),
    ).toEqual(
      preparation.allCards.map(({ entryId, cardId }) => ({ entryId, cardId })),
    );
    expect(offer).toMatchObject({
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "uniform",
      selectionKey: WAVE8_ACTION_IDS[40],
      selectionSignature: preparation.planSignature,
      offeredCardIds: [],
      offeredDeckEntryIds: [],
      transfigurationByEntryId: Object.fromEntries(
        preparation.targets.map(({ entryId, transfiguration }) => [
          entryId,
          transfiguration,
        ]),
      ),
    });

    const resolved = resolveWave8Offer({
      content,
      state,
      sourceSite,
      runtime,
      actionId: WAVE8_ACTION_IDS[40],
      selection: {},
      seq: 4001,
    });
    const resolution = explorationResolution(resolved, sourceSite.id);
    expect(resolution).toMatchObject({
      actionId: WAVE8_ACTION_IDS[40],
      selection: {},
      selectionSignature: preparation.planSignature,
      affectedEntryIds: preparation.targets.map(({ entryId }) => entryId),
      cardTransfigurations: preparation.targets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: target.transfiguration,
      })),
    });
    expect(
      preparation.targets.map((target) => ({
        entryId: target.entryId,
        transfiguration: resolved.deck.find(
          (entry) => entry.entryId === target.entryId,
        )?.transfiguration,
      })),
    ).toEqual(
      preparation.targets.map((target) => ({
        entryId: target.entryId,
        transfiguration: target.transfiguration,
      })),
    );
  });

  it("keeps T40 signed but unavailable when the QA deck is empty", () => {
    const { offer } = wave8Offer({
      encounterCardId: asCardId("e0000000-0000-4000-8000-000000000840"),
      seed: "4000",
      action: wave8Action(40),
      deckTransform: () => [],
    });
    const preparation = offer.compoundActionPreparation;
    expect(preparation).toMatchObject({
      kind: "all-card-transfiguration",
      allCards: [],
      targets: [],
      unavailableReason: "empty-deck",
      selectionKey: WAVE8_ACTION_IDS[40],
    });
    expect(preparation?.planSignature).toMatch(/^[0-9a-f]{64}$/u);
    expect(offer.selectionSignature).toBe(preparation?.planSignature);
  });

  it("prepares T75 with one disclosed purge entry and exact same-type companions", () => {
    const { content, state, sourceSite, runtime, offer } = wave8Offer({
      encounterCardId: asCardId("e0000000-0000-4000-8000-000000000875"),
      seed: "7501",
      action: wave8Action(75),
    });
    const preparation = offer.compoundActionPreparation;
    if (
      preparation?.kind !== "purge-disclosed-transfigure-same-type" ||
      preparation.target === null
    ) {
      throw new Error("T75 QA fixture requires one disclosed purge target.");
    }
    const target = preparation.target;

    expect(Object.keys(preparation).sort()).toEqual(
      [
        "companionTargets",
        "eligiblePurgeTargets",
        "kind",
        "planSignature",
        "selectionContentRevision",
        "selectionKey",
        "selectionRulesVersion",
        "selectorSignatures",
        "selectorTraces",
        "target",
        "transfiguration",
      ].sort(),
    );
    expect(preparation).toMatchObject({
      selectionKey: WAVE8_ACTION_IDS[75],
      transfiguration: "Resonant",
    });
    expect(preparation.planSignature).toMatch(/^[0-9a-f]{64}$/u);
    expect(preparation.companionTargets.length).toBeGreaterThan(0);
    expect(
      preparation.companionTargets.every(
        ({ entryId, transfiguration }) =>
          entryId !== target.entryId && transfiguration === "Resonant",
      ),
    ).toBe(true);
    expect(offer).toMatchObject({
      canonicalMechanicId: "purge-deck-entry",
      selectionPolicyId: "purge-misfit",
      selectionSignature: preparation.planSignature,
      offeredDeckEntryIds: [target.entryId],
      transfigurationByEntryId: Object.fromEntries(
        preparation.companionTargets.map(({ entryId, transfiguration }) => [
          entryId,
          transfiguration,
        ]),
      ),
    });

    const targetSnapshot = state.deck.find(
      (entry) => entry.entryId === target.entryId,
    );
    const resolved = resolveWave8Offer({
      content,
      state,
      sourceSite,
      runtime,
      actionId: WAVE8_ACTION_IDS[75],
      selection: { entryIds: [target.entryId] },
      seq: 7501,
    });
    const resolution = explorationResolution(resolved, sourceSite.id);
    expect(resolution).toMatchObject({
      actionId: WAVE8_ACTION_IDS[75],
      selection: { entryIds: [target.entryId] },
      selectionSignature: preparation.planSignature,
      resolvedCardType: target.effectiveCardType,
      purgedEntryIds: [target.entryId],
      purgedCardIds: [target.cardId],
      purgedEntrySnapshots: [targetSnapshot],
      affectedEntryIds: [
        target.entryId,
        ...preparation.companionTargets.map(({ entryId }) => entryId),
      ],
      cardTransfigurations: preparation.companionTargets.map((companion) => ({
        entryId: companion.entryId,
        cardId: companion.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: companion.transfiguration,
      })),
    });
    expect(
      resolved.deck.some((entry) => entry.entryId === target.entryId),
    ).toBe(false);
  });

  it("records T75's no-companion edge without disclosing a stale target", () => {
    const { offer } = wave8Offer({
      encounterCardId: asCardId("e0000000-0000-4000-8000-000000000875"),
      seed: "7500",
      action: wave8Action(75),
      deckTransform: (deck) => deck.slice(0, 1),
    });
    const preparation = offer.compoundActionPreparation;
    expect(preparation).toMatchObject({
      kind: "purge-disclosed-transfigure-same-type",
      eligiblePurgeTargets: [],
      target: null,
      companionTargets: [],
      unavailableReason: "no-same-type-companion",
    });
    expect(offer.offeredDeckEntryIds).toEqual([]);
    expect(offer.selectionSignature).toBe(preparation?.planSignature);
  });

  it("prepares and resolves T77 with exact keyword and Nightmare mappings", () => {
    const { content, state, sourceSite, runtime, offer } = wave8Offer({
      encounterCardId: asCardId("e0000000-0000-4000-8000-000000000877"),
      seed: "7701",
      action: wave8Action(77),
      deckTransform: (deck, content) => {
        let retainedPriorFast = false;
        return deck.map((entry) => {
          const card = content.cardDatabase.get(entry.cardNumber);
          if (retainedPriorFast || card?.cardType !== "Event") return entry;
          retainedPriorFast = true;
          return { ...entry, keywordModification: { fast: true } };
        });
      },
    });
    const preparation = offer.compoundActionPreparation;
    if (preparation?.kind !== "predicate-fast-nightmares") {
      throw new Error("T77 QA fixture requires a predicate preparation.");
    }

    expect(Object.keys(preparation).sort()).toEqual(
      [
        "kind",
        "nightmareCount",
        "planSignature",
        "predicate",
        "selectionContentRevision",
        "selectionKey",
        "selectionRulesVersion",
        "selectorSignatures",
        "selectorTraces",
        "targets",
      ].sort(),
    );
    expect(preparation).toMatchObject({
      predicate: "event",
      nightmareCount: 2,
      selectionKey: WAVE8_ACTION_IDS[77],
    });
    expect(preparation.planSignature).toMatch(/^[0-9a-f]{64}$/u);
    expect(preparation.targets.length).toBeGreaterThan(0);
    expect(
      preparation.targets.every(({ entryId, cardId }) => {
        const entry = state.deck.find(
          (candidate) => candidate.entryId === entryId,
        );
        const card =
          entry === undefined
            ? undefined
            : content.cardDatabase.get(entry.cardNumber);
        return card?.id === cardId && card.cardType === "Event";
      }),
    ).toBe(true);
    expect(offer).toMatchObject({
      canonicalMechanicId: "make-deck-fast",
      selectionKey: WAVE8_ACTION_IDS[77],
      selectionSignature: preparation.planSignature,
      offeredCardIds: [],
      offeredDeckEntryIds: [],
      transfigurationByEntryId: {},
    });
    expect(offer.selectionPolicyId).toBeUndefined();

    const resolved = resolveWave8Offer({
      content,
      state,
      sourceSite,
      runtime,
      actionId: WAVE8_ACTION_IDS[77],
      selection: {},
      seq: 7701,
    });
    const resolution = explorationResolution(resolved, sourceSite.id);
    const nightmareGains = resolution?.nightmareGains ?? [];
    expect(resolution).toMatchObject({
      actionId: WAVE8_ACTION_IDS[77],
      selection: {},
      selectionSignature: preparation.planSignature,
      resolvedPredicate: "event",
      affectedEntryIds: preparation.targets.map(({ entryId }) => entryId),
      cardKeywordChanges: preparation.targets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        before:
          state.deck.find(({ entryId }) => entryId === target.entryId)
            ?.keywordModification ?? null,
        after: { fast: true },
      })),
      gainedCardIds: [NIGHTMARE_CARD_ID, NIGHTMARE_CARD_ID],
      gainedEntryIds: nightmareGains.map(({ entryId }) => entryId),
      nightmareGains,
    });
    expect(nightmareGains).toHaveLength(2);
    expect(
      preparation.targets.map(
        ({ entryId }) =>
          resolved.deck.find((entry) => entry.entryId === entryId)
            ?.keywordModification,
      ),
    ).toEqual(preparation.targets.map(() => ({ fast: true })));
    expect(
      nightmareGains.every(({ entryId, cardId }) => {
        const entry = resolved.deck.find(
          (candidate) => candidate.entryId === entryId,
        );
        return (
          cardId === NIGHTMARE_CARD_ID &&
          content.cardDatabase.get(entry?.cardNumber ?? -1)?.id ===
            NIGHTMARE_CARD_ID
        );
      }),
    ).toBe(true);
  });

  it("keeps T77 signed but unavailable when no deck entry matches its predicate", () => {
    const { offer } = wave8Offer({
      encounterCardId: asCardId("e0000000-0000-4000-8000-000000000877"),
      seed: "7700",
      action: wave8Action(77),
      deckTransform: (deck, content) =>
        deck.filter((entry) => {
          const card = content.cardDatabase.get(entry.cardNumber);
          return card?.cardType !== "Event";
        }),
    });
    const preparation = offer.compoundActionPreparation;
    expect(preparation).toMatchObject({
      kind: "predicate-fast-nightmares",
      predicate: "event",
      targets: [],
      unavailableReason: "no-predicate-matches",
    });
    expect(offer.selectionSignature).toBe(preparation?.planSignature);
  });

  it("resolves T78's zero-card branch with only its exact Nightmare gains", () => {
    const { content, state, sourceSite, runtime, offer } = wave8Offer({
      encounterCardId: asCardId("e0000000-0000-4000-8000-000000000878"),
      seed: "7801",
      action: wave8Action(78),
    });
    const preparation = offer.compoundActionPreparation;
    if (preparation?.kind !== "take-transfigured-nightmares") {
      throw new Error("T78 QA fixture requires a catalog-card preparation.");
    }

    expect(Object.keys(preparation).sort()).toEqual(
      [
        "kind",
        "nightmareCount",
        "offerCount",
        "offeredCards",
        "planSignature",
        "predicate",
        "selectionContentRevision",
        "selectionKey",
        "selectionRulesVersion",
        "selectorSignatures",
        "selectorTraces",
        "transfiguration",
      ].sort(),
    );
    expect(preparation).toMatchObject({
      predicate: "event",
      offerCount: 4,
      transfiguration: "Enduring",
      nightmareCount: 2,
      selectionKey: WAVE8_ACTION_IDS[78],
    });
    expect(preparation.offeredCards).toHaveLength(4);
    expect(
      new Set(preparation.offeredCards.map(({ cardId }) => cardId)).size,
    ).toBe(4);
    expect(offer).toMatchObject({
      canonicalMechanicId: "transfigured-card-chooser",
      selectionPolicyId: "card-fit",
      offeredCardIds: preparation.offeredCards.map(({ cardId }) => cardId),
      transfigurationByCardId: Object.fromEntries(
        preparation.offeredCards.map(({ cardId, transfiguration }) => [
          cardId,
          transfiguration,
        ]),
      ),
      selectionSignature: preparation.planSignature,
    });

    const resolved = resolveWave8Offer({
      content,
      state,
      sourceSite,
      runtime,
      actionId: WAVE8_ACTION_IDS[78],
      selection: { cardIds: [] },
      seq: 7801,
    });
    const resolution = explorationResolution(resolved, sourceSite.id);
    const nightmareGains = resolution?.nightmareGains ?? [];
    expect(resolution).toMatchObject({
      actionId: WAVE8_ACTION_IDS[78],
      selection: { cardIds: [] },
      selectionSignature: preparation.planSignature,
      resolvedPredicate: "event",
      affectedEntryIds: [],
      cardTransfigurations: [],
      gainedCardIds: [NIGHTMARE_CARD_ID, NIGHTMARE_CARD_ID],
      gainedEntryIds: nightmareGains.map(({ entryId }) => entryId),
      nightmareGains,
    });
    expect(nightmareGains).toHaveLength(2);
    expect(resolved.deck).toHaveLength(state.deck.length + 2);
  });

  it("resolves T78's multi-card branch and rejects duplicate or unknown UUID intent", () => {
    const fixture = wave8Offer({
      encounterCardId: asCardId("e0000000-0000-4000-8000-000000000878"),
      seed: "7802",
      action: wave8Action(78),
    });
    const preparation = fixture.offer.compoundActionPreparation;
    if (preparation?.kind !== "take-transfigured-nightmares") {
      throw new Error("T78 QA fixture requires a catalog-card preparation.");
    }
    const selected = preparation.offeredCards
      .slice(1, 3)
      .map(({ cardId }) => cardId);
    const payloadBase = {
      actionId: WAVE8_ACTION_IDS[78],
      selectionRulesVersion: fixture.runtime.selectionRulesVersion,
    };

    expect(
      resolveExplorationChoice({
        journey: fixture.state,
        site: fixture.sourceSite,
        payload: {
          ...payloadBase,
          selection: { cardIds: [selected[0], selected[0]] },
        },
        seq: 7802,
        content: fixture.content,
      }),
    ).toBeNull();
    expect(
      resolveExplorationChoice({
        journey: fixture.state,
        site: fixture.sourceSite,
        payload: {
          ...payloadBase,
          selection: {
            cardIds: ["e0000000-0000-4000-8000-000000008878"],
          },
        },
        seq: 7802,
        content: fixture.content,
      }),
    ).toBeNull();

    const resolved = resolveWave8Offer({
      content: fixture.content,
      state: fixture.state,
      sourceSite: fixture.sourceSite,
      runtime: fixture.runtime,
      actionId: WAVE8_ACTION_IDS[78],
      selection: { cardIds: selected },
      seq: 7803,
    });
    const resolution = explorationResolution(resolved, fixture.sourceSite.id);
    const gainedEntryIds = resolution?.gainedEntryIds ?? [];
    const selectedEntryIds = gainedEntryIds.slice(0, selected.length);
    const nightmareEntryIds = gainedEntryIds.slice(selected.length);
    expect(resolution).toMatchObject({
      selection: { cardIds: selected },
      affectedEntryIds: selectedEntryIds,
      gainedCardIds: [...selected, NIGHTMARE_CARD_ID, NIGHTMARE_CARD_ID],
      cardTransfigurations: selected.map((cardId, index) => ({
        entryId: selectedEntryIds[index],
        cardId,
        beforeTransfiguration: null,
        afterTransfiguration: "Enduring",
      })),
      nightmareGains: nightmareEntryIds.map((entryId) => ({
        entryId,
        cardId: NIGHTMARE_CARD_ID,
      })),
    });
    expect(selectedEntryIds).toHaveLength(2);
    expect(nightmareEntryIds).toHaveLength(2);
    expect(
      selectedEntryIds.map(
        (entryId) =>
          resolved.deck.find((entry) => entry.entryId === entryId)
            ?.transfiguration,
      ),
    ).toEqual(["Enduring", "Enduring"]);
  });

  it("prepares T80 by concrete entry UUID and persists its purge, forms, and copies", () => {
    const { content, state, sourceSite, runtime, offer } = wave8Offer({
      encounterCardId: asCardId("e0000000-0000-4000-8000-000000000880"),
      seed: "8001",
      action: wave8Action(80),
      duplicateDeck: true,
      deckTransform: (deck) => {
        const duplicatePair = deck.find((entry, index) =>
          deck.some(
            (candidate, candidateIndex) =>
              candidateIndex > index &&
              candidate.cardNumber === entry.cardNumber,
          ),
        );
        if (duplicatePair === undefined) return [];
        const sameCard = deck.filter(
          (entry) => entry.cardNumber === duplicatePair.cardNumber,
        );
        return [
          ...sameCard.slice(0, 2),
          ...deck
            .filter(
              (entry) =>
                entry.entryId.startsWith("exploration-qa-") &&
                entry.cardNumber !== duplicatePair.cardNumber,
            )
            .slice(0, 2),
        ];
      },
    });
    const preparation = offer.compoundActionPreparation;
    if (preparation?.kind !== "purge-transfigure-copy") {
      throw new Error("T80 QA fixture requires a deck-entry preparation.");
    }

    expect(Object.keys(preparation).sort()).toEqual(
      [
        "eligibleCards",
        "kind",
        "offerCount",
        "planSignature",
        "selectionContentRevision",
        "selectionKey",
        "selectionRulesVersion",
        "selectorSignatures",
        "selectorTraces",
        "targets",
        "transfiguration",
      ].sort(),
    );
    expect(preparation.targets).toHaveLength(4);
    expect(preparation.transfiguration).toBe("Attuned");
    expect(
      new Set(preparation.targets.map(({ entryId }) => entryId)).size,
    ).toBe(4);
    expect(new Set(preparation.targets.map(({ cardId }) => cardId)).size).toBe(
      3,
    );
    expect(offer).toMatchObject({
      offeredDeckEntryIds: preparation.targets.map(({ entryId }) => entryId),
      transfigurationByEntryId: Object.fromEntries(
        preparation.targets.map(({ entryId, transfiguration }) => [
          entryId,
          transfiguration,
        ]),
      ),
      selectionSignature: preparation.planSignature,
    });

    const purged = preparation.targets[1];
    const companions = preparation.targets.filter(
      ({ entryId }) => entryId !== purged.entryId,
    );
    const purgedSnapshot = state.deck.find(
      ({ entryId }) => entryId === purged.entryId,
    );
    const resolved = resolveWave8Offer({
      content,
      state,
      sourceSite,
      runtime,
      actionId: WAVE8_ACTION_IDS[80],
      selection: { entryIds: [purged.entryId] },
      seq: 8001,
    });
    const resolution = explorationResolution(resolved, sourceSite.id);
    const copies = resolution?.cardCopies ?? [];
    expect(resolution).toMatchObject({
      selection: { entryIds: [purged.entryId] },
      purgedEntryIds: [purged.entryId],
      purgedCardIds: [purged.cardId],
      purgedEntrySnapshots: [purgedSnapshot],
      affectedEntryIds: [
        purged.entryId,
        ...companions.map(({ entryId }) => entryId),
      ],
      cardTransfigurations: companions.map((companion) => ({
        entryId: companion.entryId,
        cardId: companion.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: "Attuned",
      })),
      gainedEntryIds: copies.map(({ mintedEntryId }) => mintedEntryId),
      gainedCardIds: companions.map(({ cardId }) => cardId),
      cardCopies: companions.map((companion, index) => ({
        sourceEntryId: companion.entryId,
        sourceCardId: companion.cardId,
        mintedEntryId: copies[index]?.mintedEntryId,
        mintedCardId: companion.cardId,
      })),
    });
    expect(copies).toHaveLength(3);
    expect(resolved.deck).toHaveLength(state.deck.length + 2);
    expect(
      resolved.deck.some(({ entryId }) => entryId === purged.entryId),
    ).toBe(false);
    expect(
      companions.every(({ entryId }) =>
        resolved.deck.some(
          (entry) =>
            entry.entryId === entryId && entry.transfiguration === "Attuned",
        ),
      ),
    ).toBe(true);
    expect(
      copies.every(({ mintedEntryId, mintedCardId }) => {
        const entry = resolved.deck.find(
          ({ entryId }) => entryId === mintedEntryId,
        );
        return (
          entry?.transfiguration === "Attuned" &&
          content.cardDatabase.get(entry.cardNumber)?.id === mintedCardId
        );
      }),
    ).toBe(true);
  });

  it("keeps T80 signed and unavailable with fewer than four eligible entries", () => {
    const { offer } = wave8Offer({
      encounterCardId: asCardId("e0000000-0000-4000-8000-000000000880"),
      seed: "8000",
      action: wave8Action(80),
      deckTransform: (deck) => deck.slice(0, 3),
    });
    const preparation = offer.compoundActionPreparation;
    expect(preparation).toMatchObject({
      kind: "purge-transfigure-copy",
      targets: [],
      unavailableReason: "insufficient-fixed-form-deck-entries",
    });
    expect(offer.offeredDeckEntryIds).toEqual([]);
    expect(offer.selectionSignature).toBe(preparation?.planSignature);
  });

  function wave7Offer(input: {
    readonly encounterCardId: CardId;
    readonly action: ExplorationActionContent;
    readonly seed: string;
  }): {
    readonly content: JourneyContent;
    readonly state: NonNullable<ReturnType<typeof buildQaScene>>;
    readonly sourceSite: SiteState;
    readonly runtime: ExplorationSiteRuntime;
    readonly offer: ExplorationActionOfferRuntime;
  } {
    const { content } = explorationContent();
    const sourceCard = [...content.cardDatabase.values()].find(
      (card) => !card.isStarter,
    );
    if (sourceCard === undefined || content.exploration === undefined) {
      throw new Error("Wave 7 QA fixture requires Exploration content.");
    }

    for (const [cardNumber, card] of content.cardDatabase) {
      content.cardDatabase.set(cardNumber, {
        ...card,
        ...(card.isStarter
          ? { rarity: "Starter" as const }
          : { rarity: undefined }),
      });
    }

    const encounterCardNumber = Math.max(...content.cardDatabase.keys()) + 1;
    const encounterCardId = asCardId(input.encounterCardId);
    content.cardDatabase.set(encounterCardNumber, {
      ...sourceCard,
      id: encounterCardId,
      name: asCardName("Wave 7 Encounter Fixture"),
      cardNumber: encounterCardNumber,
      imageNumber: encounterCardNumber,
      rarity: undefined,
    });

    const fixedCardNumber = encounterCardNumber + 1;
    content.cardDatabase.set(fixedCardNumber, {
      ...sourceCard,
      id: WAVE7_FIXED_REPLACEMENT_CARD_ID,
      name: asCardName("Wave 7 Fixed Replacement Fixture"),
      cardNumber: fixedCardNumber,
      cardType: "Character",
      subtype: "Ancient",
      isStarter: false,
      roles: [],
      rarity: undefined,
      energyCost: 9,
      imageNumber: fixedCardNumber,
    });
    const legendaryCardNumber = fixedCardNumber + 1;
    content.cardDatabase.set(legendaryCardNumber, {
      ...sourceCard,
      id: WAVE7_LEGENDARY_CARD_ID,
      name: asCardName("Wave 7 Legendary Fixture"),
      cardNumber: legendaryCardNumber,
      cardType: "Character",
      subtype: "Ancient",
      isStarter: false,
      roles: [],
      rarity: "Legendary",
      energyCost: 9,
      imageNumber: legendaryCardNumber,
    });
    content.exploration = {
      ...content.exploration,
      encounters: [
        {
          cardId: encounterCardId,
          prose: "A deterministic Wave 7 encounter.",
          actions: [input.action],
        },
      ],
    };

    const state = buildQaScene(asQaSceneId("exploration"), content, {
      explorationCardId: encounterCardId,
      journeySeed: input.seed,
    });
    const sourceSite = Object.values(state?.atlas.nodes ?? {})
      .flatMap((node) => node.sites)
      .find((site) => site.id === state?.activeSiteId);
    const runtime =
      sourceSite === undefined ? undefined : state?.siteRuntime[sourceSite.id];
    const offer =
      runtime?.kind === "exploration" ? runtime.actionOffers[0] : undefined;
    if (
      state === null ||
      sourceSite?.type !== "Exploration" ||
      runtime?.kind !== "exploration" ||
      offer === undefined
    ) {
      throw new Error("Wave 7 QA encounter must prepare its selected action.");
    }
    expect(runtime.encounterCardId).toBe(encounterCardId);
    expect(offer.actionId).toBe(input.action.id);
    return { content, state, sourceSite, runtime, offer };
  }

  function resolveWave7Offer(input: {
    readonly content: JourneyContent;
    readonly state: NonNullable<ReturnType<typeof buildQaScene>>;
    readonly sourceSite: SiteState;
    readonly runtime: ExplorationSiteRuntime;
    readonly actionId: string;
    readonly selection: Record<string, unknown>;
    readonly seq: number;
  }): NonNullable<ReturnType<typeof resolveExplorationChoice>> {
    const resolved = resolveExplorationChoice({
      journey: input.state,
      site: input.sourceSite,
      payload: {
        actionId: input.actionId,
        selection: input.selection,
        ...(input.runtime.selectionRulesVersion === undefined
          ? {}
          : {
              selectionRulesVersion: input.runtime.selectionRulesVersion,
            }),
      },
      seq: input.seq,
      content: input.content,
    });
    if (resolved === null) {
      throw new Error(
        "Wave 7 QA action must resolve from its prepared intent.",
      );
    }
    return resolved;
  }

  function explorationResolution(
    state: JourneyState,
    siteId: SiteId,
  ): ExplorationSiteRuntime["resolution"] {
    const runtime = state.siteRuntime[siteId];
    return runtime?.kind === "exploration" ? runtime.resolution : null;
  }

  function resolveWave6ShopModifier(input: {
    readonly content: JourneyContent;
    readonly state: NonNullable<ReturnType<typeof buildQaScene>>;
    readonly sourceSite: SiteState;
    readonly actionId: string;
    readonly seq: number;
  }): NonNullable<ReturnType<typeof resolveExplorationChoice>> {
    const runtime = input.state.siteRuntime[input.sourceSite.id];
    const resolved = resolveExplorationChoice({
      journey: input.state,
      site: input.sourceSite,
      payload: {
        actionId: input.actionId,
        selection: {},
        ...(runtime?.kind === "exploration" &&
        runtime.selectionRulesVersion !== undefined
          ? { selectionRulesVersion: runtime.selectionRulesVersion }
          : {}),
      },
      seq: input.seq,
      content: input.content,
    });
    if (resolved === null) {
      throw new Error("Wave 6 QA action must resolve from an empty selection.");
    }
    return resolved;
  }

  function eventContext(seq: number) {
    return {
      seq,
      rng: (drawIndex: number) => ((drawIndex + 3) % 10) / 10,
      intervening: [],
      timestamp: "1970-01-01T00:00:00.000Z",
    };
  }

  it("prebuilds the encounter for the requested source-card UUID", () => {
    const { content, encounterCardId } = explorationContent();

    const state = buildQaScene(asQaSceneId("exploration"), content, {
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

    const state = buildQaScene(asQaSceneId("exploration-purchases"), content, {
      explorationCardId: encounterCardId,
      journeySeed: "qa-purchase-path",
    });
    const currentNode =
      state?.currentDreamscape === null ||
      state?.currentDreamscape === undefined
        ? undefined
        : state.atlas.nodes[state.currentDreamscape];
    const activeSite = currentNode?.sites.find(
      (site) => site.id === state?.activeSiteId,
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
      siteId: state?.activeSiteId,
    });
    expect(activeSite?.type).toBe("Exploration");
    expect(activeSite?.isVisited).toBe(false);
    expect(shop).toMatchObject({
      type: "Shop",
      isEnhanced: false,
      isVisited: false,
    });
    expect(bazaar).toMatchObject({
      id: asSiteId(
        `${state?.activeSiteId ?? asSiteId("")}-qa-dreamsign-bazaar`,
      ),
      type: "DreamsignBazaar",
      isEnhanced: false,
      isVisited: false,
    });
    expect(bazaarIndex).toBe(battleIndex - 1);
  });

  it("prepares and replays T56 through a free next Shop restock and purchase", () => {
    const encounterCardId = "1b4d2adc-64ab-4020-bae6-b35321898bf0";
    const actionId = "0e0d5d1d-5c79-4352-b03a-2abe039680e5";
    const { content, state, sourceSite, shopSite, bazaarSite, offer } =
      wave6ShopModifierOffer({
        encounterCardId: asCardId(encounterCardId),
        seed: "5601",
        action: {
          id: asExplorationActionId(actionId),
          label: "T56 fixture",
          effectText: "T56 fixture effect.",
          effectKind: "free-next-shop",
          canonicalMechanicId: "shop-purchase-modifier",
        },
      });

    expect(offer).toMatchObject({
      actionId,
      canonicalMechanicId: "shop-purchase-modifier",
      offeredCardIds: [],
      offeredDeckEntryIds: [],
      offeredDreamAvatarIds: [],
      offeredDreamsignIds: [],
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
    });
    expect(offer.selectionPolicyId).toBeUndefined();
    expect(offer.selectionRulesVersion).toBeUndefined();
    expect(offer.selectionSignature).toBeUndefined();

    const resolved = resolveWave6ShopModifier({
      content,
      state,
      sourceSite,
      actionId,
      seq: 560,
    });
    const explorationRuntime = resolved.siteRuntime[sourceSite.id];
    expect(resolved.essence).toBe(101);
    expect(resolved.shopModifiers.freeNextShopModifiers).toEqual([
      {
        kind: "free-next-shop",
        sourceSiteId: sourceSite.id,
        sourceActionId: asExplorationActionId(actionId),
      },
    ]);
    expect(
      explorationRuntime?.kind === "exploration"
        ? explorationRuntime.resolution
        : null,
    ).toMatchObject({
      actionId,
      selection: {},
      shopModifier: {
        kind: "free-next-shop",
        sourceSiteId: sourceSite.id,
        sourceActionId: asExplorationActionId(actionId),
      },
    });

    registerSiteContentProvider(createSiteContentProvider(content));
    try {
      const openedBazaar = openSite(
        resolved,
        { siteId: bazaarSite.id },
        eventContext(561),
      );
      const bazaarRuntime = openedBazaar?.siteRuntime[bazaarSite.id];
      expect(openedBazaar?.shopModifiers.freeNextShopModifiers).toEqual([
        {
          kind: "free-next-shop",
          sourceSiteId: sourceSite.id,
          sourceActionId: asExplorationActionId(actionId),
        },
      ]);
      expect(
        bazaarRuntime?.kind === "shop"
          ? bazaarRuntime.freePurchaseSource
          : undefined,
      ).toBeUndefined();

      const opened = openSite(
        openedBazaar ?? resolved,
        { siteId: shopSite.id },
        eventContext(562),
      );
      const openedRuntime = opened?.siteRuntime[shopSite.id];
      expect(opened?.shopModifiers.freeNextShopModifiers).toEqual([]);
      expect(
        openedRuntime?.kind === "shop"
          ? openedRuntime.freePurchaseSource
          : undefined,
      ).toEqual({
        sourceSiteId: sourceSite.id,
        sourceActionId: asExplorationActionId(actionId),
      });

      const rerolled =
        opened === null
          ? null
          : rerollShop(opened, { siteId: shopSite.id }, eventContext(563));
      const rerolledRuntime = rerolled?.siteRuntime[shopSite.id];
      expect(rerolled?.essence).toBe(51);
      expect(
        rerolledRuntime?.kind === "shop"
          ? rerolledRuntime.freePurchaseSource
          : undefined,
      ).toEqual({
        sourceSiteId: sourceSite.id,
        sourceActionId: asExplorationActionId(actionId),
      });
      expect(
        rerolledRuntime?.kind === "shop" ? rerolledRuntime.rerollCount : -1,
      ).toBe(1);

      const purchased =
        rerolled === null
          ? null
          : buyShopSlot(
              rerolled,
              { siteId: shopSite.id, slotIndex: 0 },
              eventContext(564),
            );
      const purchasedRuntime = purchased?.siteRuntime[shopSite.id];
      const receipt =
        purchasedRuntime?.kind === "shop"
          ? purchasedRuntime.purchaseHistory[0]
          : undefined;
      expect(purchased?.essence).toBe(51);
      expect(receipt).toMatchObject({
        eventSeq: 564,
        siteId: shopSite.id,
        slotIndex: 0,
        pricePaid: 0,
        essenceBefore: 51,
        essenceAfter: 51,
        freeNextShopSource: {
          sourceSiteId: sourceSite.id,
          sourceActionId: asExplorationActionId(actionId),
        },
      });
      expect(receipt?.priceBeforeFree).toBeGreaterThan(0);
    } finally {
      registerSiteContentProvider(null);
    }
  });

  it("prepares and replays T82 from odd Essence through Shop and Bazaar counters", () => {
    const encounterCardId = "a7820b34-9fdc-46cc-8357-53c8caa056b1";
    const actionId = "c884d8d4-2f30-4dff-a59a-1823791c2189";
    const { content, state, sourceSite, shopSite, bazaarSite, offer } =
      wave6ShopModifierOffer({
        encounterCardId: asCardId(encounterCardId),
        seed: "8201",
        action: {
          id: asExplorationActionId(actionId),
          label: "T82 fixture",
          effectText: "T82 fixture effect.",
          effectKind: "lose-half-essence-and-free-purchases",
          canonicalMechanicId: "shop-purchase-modifier",
          count: 3,
        },
      });

    expect(offer).toMatchObject({
      actionId,
      canonicalMechanicId: "shop-purchase-modifier",
      offeredCardIds: [],
      offeredDeckEntryIds: [],
      offeredDreamAvatarIds: [],
      offeredDreamsignIds: [],
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
    });
    expect(offer.selectionPolicyId).toBeUndefined();
    expect(offer.selectionRulesVersion).toBeUndefined();
    expect(offer.selectionSignature).toBeUndefined();

    const resolved = resolveWave6ShopModifier({
      content,
      state,
      sourceSite,
      actionId,
      seq: 820,
    });
    const explorationRuntime = resolved.siteRuntime[sourceSite.id];
    const modifier = {
      kind: "free-purchases" as const,
      sourceSiteId: sourceSite.id,
      sourceActionId: asExplorationActionId(actionId),
      initialCount: 3,
      remainingCount: 3,
    };
    expect(resolved.essence).toBe(51);
    expect(resolved.shopModifiers.freePurchaseModifiers).toEqual([modifier]);
    expect(
      explorationRuntime?.kind === "exploration"
        ? explorationRuntime.resolution
        : null,
    ).toMatchObject({
      actionId,
      selection: {},
      essenceBefore: 101,
      essenceSpent: 50,
      essenceAfter: 51,
      shopModifier: modifier,
    });

    registerSiteContentProvider(createSiteContentProvider(content));
    try {
      const openedShop = openSite(
        resolved,
        { siteId: shopSite.id },
        eventContext(821),
      );
      const purchasedShop =
        openedShop === null
          ? null
          : buyShopSlot(
              openedShop,
              { siteId: shopSite.id, slotIndex: 0 },
              eventContext(822),
            );
      expect(purchasedShop?.essence).toBe(51);
      expect(purchasedShop?.shopModifiers.freePurchaseModifiers).toEqual([
        { ...modifier, remainingCount: 2 },
      ]);
      const shopRuntime = purchasedShop?.siteRuntime[shopSite.id];
      expect(
        shopRuntime?.kind === "shop" ? shopRuntime.purchaseHistory[0] : null,
      ).toMatchObject({
        eventSeq: 822,
        pricePaid: 0,
        essenceBefore: 51,
        essenceAfter: 51,
        freePurchaseModifier: {
          sourceSiteId: sourceSite.id,
          sourceActionId: asExplorationActionId(actionId),
          initialCount: 3,
          remainingBefore: 3,
          remainingAfter: 2,
        },
      });

      const openedBazaar =
        purchasedShop === null
          ? null
          : openSite(
              purchasedShop,
              { siteId: bazaarSite.id },
              eventContext(823),
            );
      const bazaarRuntime = openedBazaar?.siteRuntime[bazaarSite.id];
      expect(
        bazaarRuntime?.kind === "shop"
          ? bazaarRuntime.freePurchaseSource
          : undefined,
      ).toBeUndefined();
      const purchasedBazaar =
        openedBazaar === null
          ? null
          : buyShopSlot(
              openedBazaar,
              { siteId: bazaarSite.id, slotIndex: 0 },
              eventContext(824),
            );
      expect(purchasedBazaar?.essence).toBe(51);
      expect(purchasedBazaar?.shopModifiers.freePurchaseModifiers).toEqual([
        { ...modifier, remainingCount: 1 },
      ]);
      const purchasedBazaarRuntime =
        purchasedBazaar?.siteRuntime[bazaarSite.id];
      expect(
        purchasedBazaarRuntime?.kind === "shop"
          ? purchasedBazaarRuntime.purchaseHistory[0]
          : null,
      ).toMatchObject({
        eventSeq: 824,
        pricePaid: 0,
        essenceBefore: 51,
        essenceAfter: 51,
        freePurchaseModifier: {
          sourceSiteId: sourceSite.id,
          sourceActionId: asExplorationActionId(actionId),
          initialCount: 3,
          remainingBefore: 2,
          remainingAfter: 1,
        },
      });
      expect(
        JSON.parse(
          JSON.stringify(purchasedBazaar?.shopModifiers.freePurchaseModifiers),
        ),
      ).toEqual([{ ...modifier, remainingCount: 1 }]);
    } finally {
      registerSiteContentProvider(null);
    }
  });

  it.each([
    {
      template: 41,
      encounterCardId: asCardId("1658d9a0-c3b0-4eb7-babc-4933acf362c4"),
      actionId: "6937ba6d-2d29-45ee-ac65-65bd91162341",
      siteType: "Duplication",
      seed: "4101",
    },
    {
      template: 42,
      encounterCardId: asCardId("1b4d2adc-64ab-4020-bae6-b35321898bf0"),
      actionId: "424f9916-1ab1-4b7c-9798-1c2aa4bdf192",
      siteType: "Shop",
      seed: "4201",
    },
    {
      template: 43,
      encounterCardId: asCardId("4cec92f2-9bac-4949-a602-cd0a44618aaf"),
      actionId: "a9335699-7a01-4626-ba0d-84541218845d",
      siteType: "DreamsignBazaar",
      seed: "4301",
    },
    {
      template: 44,
      encounterCardId: asCardId("2f5cc27f-db6e-4bc8-bfa2-eeacebae57f7"),
      actionId: "644222aa-e1ce-44a7-8f54-e3acc604399f",
      siteType: "Transfiguration",
      seed: "4401",
    },
    {
      template: 45,
      encounterCardId: asCardId("ccbefadc-aab8-4f8c-a705-07bd70c91731"),
      actionId: "4d5f2648-caf2-43ee-a07a-178cf3a77bfd",
      siteType: "Purge",
      seed: "4501",
    },
  ] as const)(
    "prepares the routable T$template fixed-$siteType insertion",
    ({ encounterCardId, actionId, siteType, seed }) => {
      const { state, offer } = wave5SiteInsertionOffer({
        encounterCardId,
        actionId,
        siteType,
        seed,
      });
      const currentNodeId = state.atlas.currentNodeId;
      const currentNode =
        currentNodeId === null ? undefined : state.atlas.nodes[currentNodeId];
      const owners = Object.values(state.atlas.nodes).filter((node) =>
        node.sites.some((site) => site.id === state.activeSiteId),
      );
      const preparation = offer.siteInsertionPreparation;

      expect(state.seed).toBe(seed);
      expect(state.screen).toEqual({
        type: "site",
        siteId: state.activeSiteId,
      });
      expect(state.currentDreamscape).toBe(currentNodeId);
      expect(owners.map((node) => node.id)).toEqual([currentNodeId]);
      expect(
        currentNode?.sites.some((site) => site.id === state.activeSiteId),
      ).toBe(true);
      expect(offer).toMatchObject({
        canonicalMechanicId: "add-site",
        selectionPolicyId: "fixed",
        selectionKey: actionId,
      });
      expect(preparation).toMatchObject({
        sourceSiteId: state.activeSiteId,
        sourceActionId: asExplorationActionId(actionId),
        targetNodeId: currentNodeId,
        insertionIndex: currentNode?.sites.length,
        siblingSiteIdsBefore: currentNode?.sites.map((site) => site.id),
        insertedSite: {
          id: asSiteId(
            `site-exploration-${state.activeSiteId ?? asSiteId("")}-${actionId}`,
          ),
          type: siteType,
          isEnhanced: false,
          isVisited: false,
        },
      });
      expect(preparation?.planSignature).toMatch(/^[0-9a-f]+$/u);
      expect(offer.selectionSignature).toBe(preparation?.planSignature);
    },
  );

  it("prepares three distinct routable alternatives for the T46 site chooser", () => {
    const actionId = "46c79bb8-2001-415e-82ae-98864e2c1e51";
    const { state, offer } = wave5bSiteTypeChoiceOffer({
      encounterCardId: asCardId("09332e5b-3b4e-458f-9df0-3fc0419f65c3"),
      actionId,
      seed: "4601",
    });
    const currentNodeId = state.atlas.currentNodeId;
    const currentNode =
      currentNodeId === null ? undefined : state.atlas.nodes[currentNodeId];
    const owners = Object.values(state.atlas.nodes).filter((node) =>
      node.sites.some((site) => site.id === state.activeSiteId),
    );
    const preparation = offer.siteTypeChoicePreparation;
    const choices = preparation?.choices ?? [];
    const choiceTypes = choices.map((choice) => choice.siteType);
    const allowedTypes = new Set([
      "Shop",
      "Purge",
      "Transfiguration",
      "Duplication",
    ]);

    expect(state.seed).toBe("4601");
    expect(state.screen).toEqual({
      type: "site",
      siteId: state.activeSiteId,
    });
    expect(state.currentDreamscape).toBe(currentNodeId);
    expect(owners.map((node) => node.id)).toEqual([currentNodeId]);
    expect(offer).toMatchObject({
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      selectionKey: actionId,
    });
    expect(offer.selectionTrace).toMatchObject({
      mechanicId: "add-site",
      policyId: "site-uniform",
      selectionKey: actionId,
      keyKind: "siteType",
      selectedKeys: choiceTypes,
    });
    expect(offer.offeredSiteType).toBeUndefined();
    expect(offer.siteInsertionPreparation).toBeUndefined();
    expect(preparation).toMatchObject({
      sourceSiteId: state.activeSiteId,
      sourceActionId: asExplorationActionId(actionId),
      targetNodeId: currentNodeId,
      insertionIndex: currentNode?.sites.length,
      siblingSiteIdsBefore: currentNode?.sites.map((site) => site.id),
    });
    expect(choices).toHaveLength(3);
    expect(new Set(choiceTypes).size).toBe(3);
    expect(choiceTypes.every((siteType) => allowedTypes.has(siteType))).toBe(
      true,
    );
    expect(choices).toEqual(
      choiceTypes.map((siteType) => ({
        siteType,
        insertedSite: {
          id: asSiteId(
            `site-exploration-${state.activeSiteId ?? asSiteId("")}-${actionId}`,
          ),
          type: siteType,
          isEnhanced: false,
          isVisited: false,
        },
      })),
    );
    expect(preparation?.selectorSignature).toMatch(/^[0-9a-f]+$/u);
    expect(preparation?.planSignature).toMatch(/^[0-9a-f]+$/u);
    expect(offer.selectionSignature).toBe(preparation?.planSignature);
  });

  it("retains authentic starter identities before appending predicate fixtures", () => {
    const { content, encounterCardId } = explorationContent();
    const starterCardNumbers = content.poolContext?.starterCardNumbers ?? [];

    const state = buildQaScene(asQaSceneId("exploration"), content, {
      explorationCardId: encounterCardId,
    });

    expect(state?.deck.slice(0, starterCardNumbers.length)).toEqual(
      starterCardNumbers.map((cardNumber, index) => ({
        entryId: asDeckEntryId(`deck-${String(index + 1)}`),
        cardNumber,
        transfiguration: null,
        isBane: false,
      })),
    );
    expect(
      state?.deck
        .slice(0, starterCardNumbers.length)
        .map((entry) => content.cardDatabase.get(entry.cardNumber)?.id),
    ).toEqual(STARTER_CARD_IDS);
    expect(
      state?.deck
        .slice(starterCardNumbers.length)
        .every((entry) => !starterCardNumbers.includes(entry.cardNumber)),
    ).toBe(true);
  });

  it("provides exact-count Wave 4b deck-entry eligibility without replacing authentic starters", () => {
    const { content, encounterCardId } = explorationContent();
    const starterCardNumbers = new Set(
      content.poolContext?.starterCardNumbers ?? [],
    );

    const state = buildQaScene(asQaSceneId("exploration"), content, {
      explorationCardId: encounterCardId,
    });
    const appendedCards = (state?.deck ?? []).flatMap((entry) => {
      if (starterCardNumbers.has(entry.cardNumber)) return [];
      const card = content.cardDatabase.get(entry.cardNumber);
      return card === undefined ? [] : [card];
    });

    expect(
      appendedCards.filter((card) => card.cardType === "Event").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      appendedCards.filter(
        (card) => card.cardType === "Character" && card.subtype === "Warrior",
      ),
    ).toHaveLength(2);
    expect(
      appendedCards.filter((card) => card.cardType === "Character").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      appendedCards.filter((card) => card.cardType !== "Event").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("prepares the final T8 encounter with two selectable Event replacements", () => {
    const actionId = "8eb89438-d367-4c52-be5b-abd76324cd80";
    const { content, state, offer } = wave4bOffer({
      encounterCardId: asCardId("3725379c-676d-4efd-81ee-7e45d80db6d0"),
      seed: "qa-wave4b-t8",
      action: {
        id: asExplorationActionId(actionId),
        label: "T8 fixture",
        effectText: "T8 fixture effect.",
        followupTitle: "T8 fixture",
        followupSubtitle: "T8 fixture follow-up.",
        effectKind: "replace-selected",
        canonicalMechanicId: "replace-deck-entry",
        selectionPolicyId: "card-fit-quality",
        predicate: "event",
        count: 2,
      },
    });
    const preparation = offer.multiCardReplacementPreparation;
    const entryById = new Map(
      state.deck.map((entry) => [entry.entryId, entry]),
    );
    const cardById = new Map<string, CardData>(
      [...content.cardDatabase.values()].map((card) => [card.id, card]),
    );

    expect(offer).toMatchObject({
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "card-fit-quality",
      offeredDeckEntryIds: [],
      replacementCardIdByEntryId: {},
    });
    expect(preparation).toMatchObject({
      kind: "chosen-replacement",
      predicate: "event",
      authoredMaximumCount: 2,
      selectionKey: actionId,
    });
    expect(preparation?.bindings.length).toBeGreaterThanOrEqual(2);
    expect(preparation?.unavailableReason).toBeUndefined();
    expect(preparation?.planSignature).toMatch(/^[0-9a-f]+$/u);
    expect(
      preparation?.bindings.every((binding) => {
        const sourceEntry = entryById.get(binding.sourceEntryId);
        return (
          sourceEntry !== undefined &&
          content.cardDatabase.get(sourceEntry.cardNumber)?.id ===
            binding.sourceCardId &&
          cardById.get(binding.sourceCardId)?.cardType === "Event" &&
          cardById.get(binding.replacementCardId)?.cardType === "Event" &&
          binding.replacementCardId !== binding.sourceCardId
        );
      }),
    ).toBe(true);
  });

  it("prepares the final T21 encounter for exactly two chosen Kindled Warriors", () => {
    const actionId = "3ac54fa8-0634-4feb-8930-2caf30f6cfc8";
    const { content, state, offer } = wave4bOffer({
      encounterCardId: asCardId("78673e2b-a6d1-43de-8850-3d3327de5cc6"),
      seed: "qa-wave4b-t21",
      action: {
        id: asExplorationActionId(actionId),
        label: "T21 fixture",
        effectText: "T21 fixture effect.",
        followupTitle: "T21 fixture",
        followupSubtitle: "T21 fixture follow-up.",
        effectKind: "transfigure-fixed-selected",
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "transfiguration-value",
        predicate: "warrior",
        transfiguration: "Kindled",
        deckTarget: "chosen",
        count: 2,
      },
    });
    const preparation = offer.multiCardTransfigurationPreparation;
    const entryById = new Map(
      state.deck.map((entry) => [entry.entryId, entry]),
    );

    expect(offer).toMatchObject({
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "transfiguration-value",
      offeredDeckEntryIds: [],
    });
    expect(preparation).toMatchObject({
      mode: "chosen-fixed",
      selectionKey: actionId,
      targets: [],
      selectorSignatures: [],
      selectorTraces: [],
    });
    expect(preparation?.eligibleCards).toHaveLength(2);
    expect(
      preparation?.eligibleCards.every((binding) => {
        const entry = entryById.get(binding.entryId);
        return (
          entry !== undefined &&
          content.cardDatabase.get(entry.cardNumber)?.id === binding.cardId &&
          content.cardDatabase.get(entry.cardNumber)?.subtype === "Warrior" &&
          binding.transfigurations.length === 1 &&
          binding.transfigurations[0] === "Kindled"
        );
      }),
    ).toBe(true);
    expect(preparation?.unavailableReason).toBeUndefined();
    expect(preparation?.planSignature).toMatch(/^[0-9a-f]+$/u);
  });

  it.each([
    {
      template: 52,
      encounterCardId: asCardId("0a19c54c-7a2e-4614-99c9-2c9142729ebb"),
      action: {
        id: asExplorationActionId("979618b2-de06-40fa-9910-488dee6b3c24"),
        label: "T52 fixture",
        effectText: "T52 fixture effect.",
        effectKind: "copy-random-cards",
        canonicalMechanicId: "duplicate-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "character",
        count: 2,
      } satisfies ExplorationActionContent,
      expectedMechanic: "duplicate-deck-entry" as const,
      expectedPredicate: "character" as const,
      expectedCardType: undefined,
    },
    {
      template: 54,
      encounterCardId: asCardId("12bb1efa-463b-4ac8-b9bd-e5bd135c3eb4"),
      action: {
        id: asExplorationActionId("f2a61678-17b0-4d50-b75c-f1de61fa0d5c"),
        label: "T54 fixture",
        effectText: "T54 fixture effect.",
        effectKind: "change-random-card-type",
        canonicalMechanicId: "change-entry-card-type",
        selectionPolicyId: "uniform",
        cardType: "Event",
        count: 2,
      } satisfies ExplorationActionContent,
      expectedMechanic: "change-entry-card-type" as const,
      expectedPredicate: undefined,
      expectedCardType: "Event" as const,
    },
  ])(
    "prepares the final T$template encounter with two concealed deterministic targets",
    ({
      template,
      encounterCardId,
      action,
      expectedMechanic,
      expectedPredicate,
      expectedCardType,
    }) => {
      const { content, state, offer } = wave4bOffer({
        encounterCardId,
        action,
        seed: `qa-wave4b-t${String(template)}`,
      });
      const preparation = offer.randomDeckTargetPreparation;
      const entryById = new Map(
        state.deck.map((entry) => [entry.entryId, entry]),
      );

      expect(offer).toMatchObject({
        canonicalMechanicId: expectedMechanic,
        selectionPolicyId: "uniform",
        offeredDeckEntryIds: [],
      });
      expect(preparation).toMatchObject({
        effectKind: action.effectKind,
        count: 2,
        selectionKey: `${action.id}:random-deck-targets`,
      });
      expect(preparation?.predicate).toBe(expectedPredicate);
      expect(preparation?.cardType).toBe(expectedCardType);
      expect(preparation?.targets).toHaveLength(2);
      expect(
        new Set(preparation?.targets.map((binding) => binding.entryId)).size,
      ).toBe(2);
      expect(
        preparation?.targets.every((binding) => {
          const entry = entryById.get(binding.entryId);
          const card =
            entry === undefined
              ? undefined
              : content.cardDatabase.get(entry.cardNumber);
          return (
            card?.id === binding.cardId &&
            (template === 52
              ? card.cardType === "Character"
              : card.cardType !== "Event")
          );
        }),
      ).toBe(true);
      expect(preparation?.unavailableReason).toBeUndefined();
      expect(preparation?.selectorSignature).toMatch(/^[0-9a-f]+$/u);
      expect(preparation?.planSignature).toMatch(/^[0-9a-f]+$/u);
    },
  );

  it("prepares and resolves T48 as one concealed signed target with one fixed replacement", () => {
    const actionId = "574dc85e-37a9-4888-80a2-afec6ee24209";
    const { content, state, sourceSite, runtime, offer } = wave7Offer({
      encounterCardId: asCardId("bc1ffcd7-36c3-43b7-871b-bc2e6b3d0034"),
      seed: "4801",
      action: {
        id: asExplorationActionId(actionId),
        label: "T48 fixture",
        effectText: "T48 fixture effect with {fixed_card}.",
        effectKind: "replace-random-with-card",
        canonicalMechanicId: "replace-deck-entry",
        selectionPolicyId: "uniform",
        predicate: "character",
        cardId: WAVE7_FIXED_REPLACEMENT_CARD_ID,
      },
    });
    const preparation = offer.randomDeckTargetPreparation;
    const target = preparation?.targets[0];
    if (target === undefined) {
      throw new Error("T48 QA fixture requires one prepared target.");
    }
    const sourceEntry = state.deck.find(
      (entry) => entry.entryId === target.entryId,
    );
    const sourceCard =
      sourceEntry === undefined
        ? undefined
        : content.cardDatabase.get(sourceEntry.cardNumber);

    expect(state.seed).toBe("4801");
    expect(offer).toMatchObject({
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "uniform",
      offeredDeckEntryIds: [],
      replacementCardIdByEntryId: {},
    });
    expect(preparation).toMatchObject({
      effectKind: "replace-random-with-card",
      count: 1,
      predicate: "character",
      replacementCardId: WAVE7_FIXED_REPLACEMENT_CARD_ID,
      selectionKey: `${actionId}:random-deck-targets`,
      targets: [target],
    });
    expect(preparation?.unavailableReason).toBeUndefined();
    expect(preparation?.selectorSignature).toMatch(/^[0-9a-f]+$/u);
    expect(preparation?.planSignature).toMatch(/^[0-9a-f]+$/u);
    expect(sourceCard?.id).toBe(target.cardId);
    expect(sourceCard?.cardType).toBe("Character");

    const resolved = resolveWave7Offer({
      content,
      state,
      sourceSite,
      runtime,
      actionId,
      selection: {},
      seq: 4801,
    });
    const resolution = explorationResolution(resolved, sourceSite.id);
    const replacement = resolution?.cardReplacements?.[0];
    const gainedEntry = resolved.deck.find(
      (entry) => entry.entryId === replacement?.replacementEntryId,
    );

    expect(
      resolved.deck.some((entry) => entry.entryId === target.entryId),
    ).toBe(false);
    expect(resolved.deck).toHaveLength(state.deck.length);
    expect(resolution).toMatchObject({
      actionId,
      selection: {},
      resolvedPredicate: "character",
      affectedEntryIds: [target.entryId],
      purgedEntryIds: [target.entryId],
      purgedCardIds: [target.cardId],
      gainedCardIds: [WAVE7_FIXED_REPLACEMENT_CARD_ID],
      cardReplacements: [
        {
          sourceEntryId: target.entryId,
          sourceCardId: target.cardId,
          replacementCardId: WAVE7_FIXED_REPLACEMENT_CARD_ID,
        },
      ],
    });
    expect(resolution?.purgedEntrySnapshots).toEqual([sourceEntry]);
    expect(resolution?.gainedEntryIds).toEqual([
      replacement?.replacementEntryId,
    ]);
    expect(gainedEntry?.cardNumber).toBe(
      [...content.cardDatabase.values()].find(
        (card) => card.id === WAVE7_FIXED_REPLACEMENT_CARD_ID,
      )?.cardNumber,
    );
  });

  it("prepares T53 with one disclosed concrete target and persists its exact automatic type change", () => {
    const actionId = "b59b7e6a-aa32-428a-9397-06766ebe9b7d";
    const { content, state, sourceSite, runtime, offer } = wave7Offer({
      encounterCardId: asCardId("4e3c04a9-1cdd-468a-b42a-40157ed9c9d6"),
      seed: "5301",
      action: {
        id: asExplorationActionId(actionId),
        label: "T53 fixture",
        effectText: "Change {deck_card} to become a {card_type}.",
        effectKind: "change-card-type-selected",
        canonicalMechanicId: "change-entry-card-type",
        selectionPolicyId: "deck-entry-centrality",
        cardType: "Character",
        deckTarget: "offered",
      },
    });
    const preparation = offer.disclosedDeckTargetPreparation;
    const target = preparation?.target;
    if (target === null || target === undefined) {
      throw new Error("T53 QA fixture requires one disclosed target.");
    }
    const targetEntryBefore = state.deck.find(
      (entry) => entry.entryId === target.entryId,
    );
    const targetCard =
      targetEntryBefore === undefined
        ? undefined
        : content.cardDatabase.get(targetEntryBefore.cardNumber);

    expect(state.seed).toBe("5301");
    expect(offer).toMatchObject({
      canonicalMechanicId: "change-entry-card-type",
      selectionPolicyId: "deck-entry-centrality",
      offeredDeckEntryIds: [target.entryId],
    });
    expect(preparation).toMatchObject({
      effectKind: "change-card-type-selected",
      cardType: "Character",
      selectionKey: `${actionId}:disclosed-deck-target`,
      target,
    });
    expect(preparation?.unavailableReason).toBeUndefined();
    expect(preparation?.selectorSignature).toMatch(/^[0-9a-f]+$/u);
    expect(preparation?.planSignature).toMatch(/^[0-9a-f]+$/u);
    expect(offer.selectionSignature).toBe(preparation?.planSignature);
    expect(targetCard?.id).toBe(target.cardId);
    expect(targetCard?.cardType).toBe("Event");

    const resolved = resolveWave7Offer({
      content,
      state,
      sourceSite,
      runtime,
      actionId,
      selection: { entryIds: [target.entryId] },
      seq: 5301,
    });
    const resolution = explorationResolution(resolved, sourceSite.id);
    const targetEntryAfter = resolved.deck.find(
      (entry) => entry.entryId === target.entryId,
    );

    expect(resolved.deck).toHaveLength(state.deck.length);
    expect(targetEntryAfter?.cardNumber).toBe(targetEntryBefore?.cardNumber);
    expect(targetEntryAfter?.typeChange?.cardType).toBe("Character");
    expect(resolution).toMatchObject({
      actionId,
      selection: { entryIds: [target.entryId] },
      affectedEntryIds: [target.entryId],
      resolvedCardType: "Character",
      cardTypeChanges: [
        {
          entryId: target.entryId,
          cardId: target.cardId,
          beforeCardType: "Event",
          afterCardType: "Character",
          beforeTypeChange: null,
          afterTypeChange: { cardType: "Character" },
        },
      ],
    });
  });

  it("prepares and resolves T72 as one exact UUID-backed Legendary gain", () => {
    const actionId = "fbd70c5d-9c4a-4af7-9ace-41f52ab00976";
    const { content, state, sourceSite, runtime, offer } = wave7Offer({
      encounterCardId: asCardId("455ef341-8a26-44e1-b287-19e53bdc6158"),
      seed: "7201",
      action: {
        id: asExplorationActionId(actionId),
        label: "T72 fixture",
        effectText: "Gain a random Legendary card.",
        effectKind: "gain-random-cards",
        canonicalMechanicId: "gain-card",
        selectionPolicyId: "card-bundle",
        predicate: "legendary",
        count: 1,
      },
    });
    const offeredCard = [...content.cardDatabase.values()].find(
      (card) => card.id === offer.offeredCardIds[0],
    );

    expect(state.seed).toBe("7201");
    expect(offer).toMatchObject({
      canonicalMechanicId: "gain-card",
      selectionPolicyId: "card-bundle",
      offeredCardIds: [WAVE7_LEGENDARY_CARD_ID],
    });
    expect(offeredCard?.rarity).toBe("Legendary");
    expect(
      state.deck.some((entry) => entry.cardNumber === offeredCard?.cardNumber),
    ).toBe(false);

    const resolved = resolveWave7Offer({
      content,
      state,
      sourceSite,
      runtime,
      actionId,
      selection: {},
      seq: 7201,
    });
    const resolution = explorationResolution(resolved, sourceSite.id);
    const gainedEntry = resolved.deck.find(
      (entry) => entry.entryId === resolution?.gainedEntryIds?.[0],
    );

    expect(resolved.deck).toHaveLength(state.deck.length + 1);
    expect(resolution).toMatchObject({
      actionId,
      gainedCardIds: [WAVE7_LEGENDARY_CARD_ID],
      gainedEntryIds: [expect.any(String)],
    });
    expect(gainedEntry?.cardNumber).toBe(offeredCard?.cardNumber);
    expect(
      gainedEntry === undefined
        ? undefined
        : content.cardDatabase.get(gainedEntry.cardNumber)?.rarity,
    ).toBe("Legendary");
  });

  it.each([0, 1, 4])(
    "retains exactly %i authentic starter entries when requested",
    (starterCount) => {
      const { content, encounterCardId } = explorationContent();
      const starterCardNumbers = content.poolContext?.starterCardNumbers ?? [];

      const state = buildQaScene(asQaSceneId("exploration"), content, {
        explorationCardId: encounterCardId,
        explorationStarterCount: starterCount,
      });

      const retainedStarterIds = state?.deck.flatMap((entry) => {
        if (!starterCardNumbers.includes(entry.cardNumber)) return [];
        const id = content.cardDatabase.get(entry.cardNumber)?.id;
        return id === undefined ? [] : [id];
      });
      expect(retainedStarterIds).toEqual(
        STARTER_CARD_IDS.slice(0, starterCount),
      );
    },
  );

  it.each([-1, 1.5, 11])(
    "rejects an impossible authentic starter count %s",
    (starterCount) => {
      const { content, encounterCardId } = explorationContent();
      expect(
        buildQaScene(asQaSceneId("exploration"), content, {
          explorationCardId: encounterCardId,
          explorationStarterCount: starterCount,
        }),
      ).toBeNull();
    },
  );

  it.each([
    ["purge-starter-card", 4, 1, 0, true],
    ["purge-random-starter-card", 4, 1, 0, false],
    ["purge-random-starter-and-gain-card", 1, 1, 1, false],
    ["replace-all-starter-cards", 4, 4, 4, false],
  ] as const)(
    "prepares %s against authentic starter identities",
    (
      effectKind,
      starterCount,
      purgedCount,
      replacementCount,
      disclosesTarget,
    ) => {
      const { content, encounterCardId } = explorationContent();
      const exploration = content.exploration;
      const encounter = exploration?.encounters[0];
      if (exploration === undefined || encounter === undefined) {
        throw new Error("Exploration QA fixture requires an encounter.");
      }
      content.exploration = {
        ...exploration,
        encounters: [{ ...encounter, actions: [starterAction(effectKind)] }],
      };

      const state = buildQaScene(asQaSceneId("exploration"), content, {
        explorationCardId: encounterCardId,
        explorationStarterCount: starterCount,
        journeySeed: `qa-${effectKind}`,
      });
      const runtime = Object.values(state?.siteRuntime ?? {}).find(
        (candidate) => candidate.kind === "exploration",
      );
      const offer =
        runtime?.kind === "exploration" ? runtime.actionOffers[0] : undefined;
      const preparation = offer?.starterCardPreparation;

      expect(preparation).toMatchObject({
        kind: effectKind,
        eligibleStarterCards: STARTER_CARD_IDS.slice(0, starterCount).map(
          (cardId, index) => ({
            entryId: asDeckEntryId(`deck-${String(index + 1)}`),
            cardId: asCardId(cardId),
          }),
        ),
      });
      expect(preparation?.purgedEntryIds).toHaveLength(purgedCount);
      expect(preparation?.purgedCardIds).toHaveLength(purgedCount);
      expect(
        Object.keys(preparation?.replacementCardIdByEntryId ?? {}),
      ).toHaveLength(replacementCount);
      expect(offer?.offeredDeckEntryIds ?? []).toEqual(
        disclosesTarget ? preparation?.purgedEntryIds : [],
      );
      expect(preparation?.planSignature).toMatch(/^[0-9a-f]+$/u);
      expect(preparation?.unavailableReason).toBeUndefined();
    },
  );

  it("keeps a signed unavailable starter action when the authentic starter count is zero", () => {
    const { content, encounterCardId } = explorationContent();
    const exploration = content.exploration;
    const encounter = exploration?.encounters[0];
    if (exploration === undefined || encounter === undefined) {
      throw new Error("Exploration QA fixture requires an encounter.");
    }
    content.exploration = {
      ...exploration,
      encounters: [
        {
          ...encounter,
          actions: [starterAction("purge-random-starter-card")],
        },
      ],
    };

    const state = buildQaScene(asQaSceneId("exploration"), content, {
      explorationCardId: encounterCardId,
      explorationStarterCount: 0,
      journeySeed: "qa-no-starters",
    });
    const runtime = Object.values(state?.siteRuntime ?? {}).find(
      (candidate) => candidate.kind === "exploration",
    );
    const preparation =
      runtime?.kind === "exploration"
        ? runtime.actionOffers[0]?.starterCardPreparation
        : undefined;

    expect(preparation).toMatchObject({
      kind: "purge-random-starter-card",
      eligibleStarterCards: [],
      purgedEntryIds: [],
      purgedCardIds: [],
      replacementCardIdByEntryId: {},
      unavailableReason: "requires-starter-card",
    });
    expect(preparation?.planSignature).toMatch(/^[0-9a-f]+$/u);
  });

  it("prepares deterministic Exploration offers with the live room seed", () => {
    const { content, encounterCardId } = explorationContent();
    const exploration = content.exploration;
    const encounter = exploration?.encounters[0];
    if (exploration === undefined || encounter === undefined) {
      throw new Error("Exploration QA fixture requires an encounter.");
    }
    const randomEssenceAction = {
      id: asExplorationActionId("random-essence-choice"),
      label: "Gather sparks",
      effectText: "Gain random Essence.",
      effectKind: "gain-random-essence" as const,
      minimumEssence: 50,
      maximumEssence: 150,
    };
    content.exploration = {
      ...exploration,
      encounters: [
        {
          ...encounter,
          actions: [randomEssenceAction, ...encounter.actions.slice(1)],
        },
      ],
    };

    const state = buildQaScene(asQaSceneId("exploration"), content, {
      explorationCardId: encounterCardId,
      journeySeed: "live-room-seed",
    });
    const runtime = Object.values(state?.siteRuntime ?? {}).find(
      (candidate) => candidate.kind === "exploration",
    );
    const offer =
      runtime?.kind === "exploration" ? runtime.actionOffers[0] : undefined;

    expect(state?.seed).toBe("live-room-seed");
    expect(offer?.essencePreparation?.saltParts[1]).toBe("live-room-seed");
  });

  it("makes every non-starter catalog card available to authored draft follow-ups", () => {
    const { content, encounterCardId } = explorationContent();
    const starterCardNumbers = new Set(
      content.poolContext?.starterCardNumbers ?? [],
    );

    const state = buildQaScene(asQaSceneId("exploration"), content, {
      explorationCardId: encounterCardId,
    });

    expect(state?.resolvedPackage?.draftPoolCopiesByCard).toEqual(
      Object.fromEntries(
        [...content.cardDatabase.values()]
          .filter((card) => !starterCardNumbers.has(card.cardNumber))
          .map((card) => [String(card.cardNumber), 1]),
      ),
    );
    expect(state?.draftState?.draftPoolCopiesByCard).toEqual(
      state?.resolvedPackage?.draftPoolCopiesByCard,
    );
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

    const state = buildQaScene(asQaSceneId("exploration-duplicates"), content, {
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

  it("holds a UUID-backed Dreamsign so purge follow-ups are exercisable", () => {
    const { content, encounterCardId } = explorationContent();
    const heldDreamsignId = "e0000000-0000-4000-8000-000000000001";
    content.dreamsignTemplates = [
      {
        id: asDreamsignId(heldDreamsignId),
        name: "Exploration QA Dreamsign",
        effectDescription: "A QA effect.",
      },
    ];
    content.poolContext = makeTestPoolContext([heldDreamsignId]);

    const state = buildQaScene(asQaSceneId("exploration"), content, {
      explorationCardId: encounterCardId,
    });

    expect(state?.dreamsigns.map((dreamsign) => dreamsign.id)).toEqual([
      heldDreamsignId,
    ]);
  });

  it("configures held Dreamsign count and capacity before preparing the encounter", () => {
    const { content, encounterCardId } = explorationContent();
    addDreamsignCatalog(content);

    const state = buildQaScene(asQaSceneId("exploration"), content, {
      explorationCardId: encounterCardId,
      explorationHeldDreamsignCount: 3,
      explorationMaxDreamsigns: 4,
      journeySeed: "live-room-seed",
    });

    expect(state?.seed).toBe("live-room-seed");
    expect(state?.maxDreamsigns).toBe(4);
    expect(state?.dreamsigns.map((dreamsign) => dreamsign.id)).toEqual(
      DREAMSIGN_IDS.slice(0, 3),
    );
    expect(state?.remainingDreamsignPool).toEqual(DREAMSIGN_IDS.slice(3));
  });

  it("rejects impossible held Dreamsign fixture configurations", () => {
    const { content, encounterCardId } = explorationContent();
    addDreamsignCatalog(content);

    expect(
      buildQaScene(asQaSceneId("exploration"), content, {
        explorationCardId: encounterCardId,
        explorationHeldDreamsignCount: 5,
        explorationMaxDreamsigns: 4,
      }),
    ).toBeNull();
  });

  it.each([
    ["gain-offered-dreamsign", "offered-gain", 1, 4, 0],
    ["replace-selected-dreamsign-with-offered", "offered-replacement", 3, 3, 0],
    ["replace-all-dreamsigns-random", "replace-all-random", 3, 3, 0],
    [
      "purge-selected-dreamsign-and-gain-random",
      "purge-and-gain-random",
      4,
      4,
      2,
    ],
  ] as const)(
    "prepares a forced %s encounter from the configured held/cap snapshot",
    (effectKind, preparationKind, heldCount, maxDreamsigns, overflowCount) => {
      const { content, encounterCardId } = explorationContent();
      addDreamsignCatalog(content);
      const exploration = content.exploration;
      const encounter = exploration?.encounters[0];
      if (exploration === undefined || encounter === undefined) {
        throw new Error("Exploration QA fixture requires an encounter.");
      }
      content.exploration = {
        ...exploration,
        encounters: [
          {
            ...encounter,
            actions: [dreamsignAction(effectKind)],
          },
        ],
      };

      const state = buildQaScene(asQaSceneId("exploration"), content, {
        explorationCardId: encounterCardId,
        explorationHeldDreamsignCount: heldCount,
        explorationMaxDreamsigns: maxDreamsigns,
        journeySeed: "live-room-seed",
      });
      const runtime = Object.values(state?.siteRuntime ?? {}).find(
        (candidate) => candidate.kind === "exploration",
      );
      const preparation =
        runtime?.kind === "exploration"
          ? runtime.actionOffers[0]?.dreamsignPreparation
          : undefined;
      const selectionTrace =
        runtime?.kind === "exploration"
          ? runtime.actionOffers[0]?.selectionTrace
          : undefined;

      expect(state?.seed).toBe("live-room-seed");
      expect(state?.dreamsigns).toHaveLength(heldCount);
      expect(state?.maxDreamsigns).toBe(maxDreamsigns);
      expect(preparation).toMatchObject({
        kind: preparationKind,
        heldIdsAtPreparation: DREAMSIGN_IDS.slice(0, heldCount),
        maxDreamsignsAtPreparation: maxDreamsigns,
        requiredOverflowReplacementCount: overflowCount,
      });
      expect(preparation?.preparedDreamsignIds).toHaveLength(3);
      expect(preparation?.poolBeforeIds).toEqual(
        DREAMSIGN_IDS.slice(heldCount),
      );
      expect(preparation?.planSignature).toMatch(/^[0-9a-f]+$/u);
      expect(selectionTrace?.saltParts).toContain("live-room-seed");
    },
  );

  it("fails to build when the requested UUID has no authored encounter", () => {
    const { content } = explorationContent();

    expect(
      buildQaScene(asQaSceneId("exploration"), content, {
        explorationCardId: asCardId("missing-exploration-card"),
      }),
    ).toBeNull();
  });
});

describe('the "dreamscape-with-essence" QA scene', () => {
  it("parks on the dreamscape overview with an unvisited Essence site", () => {
    const state = buildQaScene(
      asQaSceneId("dreamscape-with-essence"),
      makeJourneyContent(),
    );

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
    const state = buildQaScene(asQaSceneId("reward"), makeJourneyContent());

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
      id: asDreamsignId(`dreamsign-${String(index + 1)}`),
      name: `Dreamsign ${String(index + 1)}`,
      effectDescription: "A QA effect.",
    }));
    const state = buildQaScene(asQaSceneId("reward-at-cap"), content);

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
