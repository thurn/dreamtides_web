import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import type {
  DreamscapeNode,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { testJourneyState } from "../../testing/journey-genesis";
import { MINIMAL_SITES_DATA } from "../../testing/atlas-fixtures";
import {
  buildDreamscapeHudView,
  buildDreamscapeGuideDialogue,
  buildDreamscapeView as buildDreamscapeViewImpl,
  buildSiteModels as buildSiteModelsImpl,
  dreamscapeSceneRef,
} from "./dreamscape-view-model";
import { artRef } from "../../cumulus/primitives/art";
import type { DreamscapeArtCatalog } from "../../data/dreamscapes";
import {
  parseAtlasNodeId,
  parseDeckEntryId,
  parseSiteId,
  parseBattleEntryKey,
  parseOpponentId,
} from "../../types/identifiers";
import type { SiteId } from "../../types/identifiers";
import {
  testCardId,
  testDreamsignId,
  testExplorationActionId,
  testDreamscapeArtKey,
  testDreamscapeId,
} from "../../types/test-identities";
import { createTestBattleInit } from "../../testing/create-battle-init";
import {
  makeBattleTestCardDatabase,
  makeBattleTestAvatars,
  makeBattleTestSite,
  makeBattleTestState,
} from "../../battle/test-support";
import { buildBattleStartView } from "./battle-start-view-model";

const ART_CATALOG: DreamscapeArtCatalog = {
  dreamscapes: [
    {
      id: testDreamscapeId("test_dreamscape"),
      artKey: testDreamscapeArtKey("test_dreamscape"),
    },
  ],
  atlasData: {
    boss: {
      dreamscapeId: testDreamscapeId("fixture-boss"),
      sceneArtKey: testDreamscapeArtKey("fixture_boss_scene"),
    },
  },
};

describe("dreamscape-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  const buildSiteModels = (
    dreamscapeNode: DreamscapeNode,
    completionLevel: number,
    sitesData = MINIMAL_SITES_DATA,
  ) => buildSiteModelsImpl(dreamscapeNode, completionLevel, sitesData, 5);

  const buildDreamscapeView = (
    dreamscapeNode: DreamscapeNode,
    state: JourneyState,
    sitesData = MINIMAL_SITES_DATA,
    replacementSiteId: SiteId | null = null,
  ) =>
    buildDreamscapeViewImpl(
      dreamscapeNode,
      "Fixture Dreamscape",
      null,
      state,
      sitesData,
      5,
      replacementSiteId,
      undefined,
    );

  function site(
    overrides: Partial<SiteState> & Pick<SiteState, "id" | "type">,
  ): SiteState {
    return { isEnhanced: false, isVisited: false, ...overrides };
  }

  function node(overrides: Partial<DreamscapeNode> = {}): DreamscapeNode {
    return {
      id: parseAtlasNodeId("node-1"),
      layer: 0,
      indexInLayer: 0,
      dreamscapeId: testDreamscapeId("ember_wood"),
      sites: [
        site({ id: parseSiteId("s-purge"), type: "Purge" }),
        site({ id: parseSiteId("s-draft"), type: "Draft" }),
        site({ id: parseSiteId("s-battle"), type: "Battle" }),
      ],
      position: { x: 0, y: 0 },
      state: "revealed",
      enhancedSiteType: null,
      forwardIds: [],
      backwardIds: [],
      knownDreamsignId: null,
      ...overrides,
    } as DreamscapeNode;
  }

  describe("buildSiteModels", () => {
    it("locks the guardian battle until every non-battle site is visited", () => {
      const locked = buildSiteModels(node(), 0).find((m) => m.isBattle);
      expect(locked?.isLocked).toBe(true);
      expect(locked?.isInteractive).toBe(false);

      const visitedNonBattle = node({
        sites: [
          site({ id: parseSiteId("s-purge"), type: "Purge", isVisited: true }),
          site({ id: parseSiteId("s-draft"), type: "Draft", isVisited: true }),
          site({ id: parseSiteId("s-battle"), type: "Battle" }),
        ],
      });
      const unlocked = buildSiteModels(visitedNonBattle, 0).find(
        (m) => m.isBattle,
      );
      expect(unlocked?.isLocked).toBe(false);
      expect(unlocked?.isInteractive).toBe(true);
    });
  });

  describe("buildDreamscapeView", () => {
    it("builds first-dream guidance only after the tutorial deck modal closes", () => {
      const configuration = {
        speechBubble: {
          speaker: "mira" as const,
          delay: 2,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "Visit [purple]Dream Sites[/purple].",
        },
      };
      const tutorialState = {
        isTutorialJourney: true,
        completionLevel: 0,
        hasSeenStartingDeckPopup: false,
      } as JourneyState;
      expect(
        buildDreamscapeGuideDialogue(node(), tutorialState, configuration),
      ).toBeUndefined();
      expect(
        buildDreamscapeGuideDialogue(
          node(),
          { ...tutorialState, hasSeenStartingDeckPopup: true },
          configuration,
        ),
      ).toMatchObject({
        delaySeconds: 2,
        bubbleWidth: 700,
        model: {
          speakerName: "Mira",
          text: "Visit [purple]Dream Sites[/purple].",
        },
      });
      expect(
        buildDreamscapeGuideDialogue(
          node(),
          {
            ...tutorialState,
            completionLevel: 1,
            hasSeenStartingDeckPopup: true,
          },
          configuration,
        ),
      ).toBeUndefined();
    });

    it("assembles the scene, placed sites, and bottom-HUD data", () => {
      const state = {
        essence: 240,
        deck: [{}, {}, {}],
        avatar: null,
        dreamsigns: [],
        completionLevel: 2,
      } as unknown as JourneyState;
      const view = buildDreamscapeView(node(), state, MINIMAL_SITES_DATA);
      expect(view.title).toBe("Fixture Dreamscape");
      expect(view.sites).toHaveLength(3);
      expect(view.inlineRewards).toEqual({});
    });

    it("maps generated Reward site results by site id for in-place collection", () => {
      const rewardNode = node({
        sites: [site({ id: parseSiteId("s-reward"), type: "Reward" })],
      });
      const dreamsign = {
        id: testDreamsignId("dreamsign-uuid"),
        name: "Lantern in the Rain",
        effectDescription: "Your first dream each dawn costs 1 less.",
        imageName: "lantern-in-the-rain.webp",
      };
      const state = {
        essence: 240,
        deck: [],
        avatar: null,
        dreamsigns: [],
        completionLevel: 2,
        siteRuntime: {
          "s-reward": {
            kind: "reward",
            reward: { rewardType: "dreamsign", dreamsign },
            remainingDreamsignPoolIds: [],
            accepted: false,
          },
        },
      } as unknown as JourneyState;

      expect(
        buildDreamscapeView(rewardNode, state, MINIMAL_SITES_DATA)
          .inlineRewards,
      ).toMatchObject({
        "s-reward": {
          kind: "dreamsign",
          dreamsign,
          requiresReplacement: false,
        },
      });
    });

    it("builds an at-cap Dreamsign replacement view from a Reward runtime", () => {
      const rewardNode = node({
        sites: [site({ id: parseSiteId("s-reward"), type: "Reward" })],
      });
      const pendingDreamsign = {
        id: testDreamsignId("pending-dreamsign"),
        name: "Pending",
        effectDescription: "Pending effect.",
      };
      const heldDreamsign = {
        id: testDreamsignId("held-dreamsign"),
        name: "Held",
        effectDescription: "Held effect.",
      };
      const state = {
        dreamsigns: [heldDreamsign],
        maxDreamsigns: 1,
        completionLevel: 2,
        siteRuntime: {
          "s-reward": {
            kind: "reward",
            reward: { rewardType: "dreamsign", dreamsign: pendingDreamsign },
            accepted: false,
          },
        },
      } as unknown as JourneyState;

      const view = buildDreamscapeView(
        rewardNode,
        state,
        MINIMAL_SITES_DATA,
        parseSiteId("s-reward"),
      );
      expect(view.inlineRewards["s-reward"]).toMatchObject({
        kind: "dreamsign",
        requiresReplacement: true,
      });
      expect(view.replacement).toMatchObject({
        incoming: { id: pendingDreamsign.id },
        held: [{ id: heldDreamsign.id }],
        capacity: 1,
      });
    });
  });

  describe("buildDreamscapeHudView", () => {
    it("reads essence, deck size, avatar, and dreamsigns from live state", () => {
      const state = {
        ...testJourneyState(),
        essence: 10,
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
        avatar: null,
        dreamsigns: [],
      } satisfies JourneyState;
      const hud = buildDreamscapeHudView(state);
      expect(hud.essence).toBe(10);
      expect(hud.deck).toBe(2);
      expect(hud.dreamsigns).toEqual([]);
    });

    it("holds an Exploration Essence reward out of the HUD until the site presentation completes", () => {
      const state = {
        ...testJourneyState(),
        essence: 290,
        screen: {
          type: "site" as const,
          siteId: parseSiteId("exploration-site"),
        },
        siteRuntime: {
          "exploration-site": {
            kind: "exploration" as const,
            encounterCardId: testCardId("encounter-card-id"),
            actionOffers: [],
            resolution: {
              actionId: testExplorationActionId("gain-essence"),
              gainedCardIds: [],
              gainedDreamsignIds: [],
              purgedCardIds: [],
              affectedEntryIds: [parseDeckEntryId("spirit-animal-entry")],
              essenceGained: 90,
            },
          },
        },
      };

      expect(buildDreamscapeHudView(state).essence).toBe(200);
      expect(
        buildDreamscapeHudView({
          ...state,
          screen: { type: "dreamscape" as const },
        }).essence,
      ).toBe(290);
    });
  });
});

describe("dreamscapeSceneRef", () => {
  it("resolves catalog dreamscapes and the Atlas boss to their scene art keys", () => {
    expect(
      dreamscapeSceneRef(
        { dreamscapeId: testDreamscapeId("test_dreamscape") },
        ART_CATALOG,
      ),
    ).toEqual(artRef.dreamscapeScene(testDreamscapeArtKey("test_dreamscape")));
    expect(
      dreamscapeSceneRef(
        { dreamscapeId: testDreamscapeId("fixture-boss") },
        ART_CATALOG,
      ),
    ).toEqual(
      artRef.dreamscapeScene(testDreamscapeArtKey("fixture_boss_scene")),
    );
  });

  it("returns null without a node, while unrevealed, or for an unknown id", () => {
    expect(dreamscapeSceneRef(null, ART_CATALOG)).toBeNull();
    expect(dreamscapeSceneRef({ dreamscapeId: null }, ART_CATALOG)).toBeNull();
    expect(
      dreamscapeSceneRef(
        { dreamscapeId: testDreamscapeId("unknown_dreamscape") },
        ART_CATALOG,
      ),
    ).toBeNull();
  });
});

describe("battle-start-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  function makeInit() {
    const cardDatabase = makeBattleTestCardDatabase();
    const base = createTestBattleInit({
      battleEntryKey: parseBattleEntryKey("battle-entry"),
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase,
      avatars: makeBattleTestAvatars(),
      dreamwellCards: [],
      seedOverride: 1234,
    });
    const signature = [...cardDatabase.values()].slice(0, 2);
    return {
      cardDatabase,
      init: {
        ...base,
        scoreToWin: 15,
        essenceReward: 90,
        enemyDescriptor: {
          ...base.enemyDescriptor,
          id: parseOpponentId("opponent-uuid"),
          name: "The Long-Named Opponent",
          subtitle: "Keeper of the Last Horizon",
          abilityText: "Whenever you score, foresee 1.",
          dreamsigns: [
            {
              id: testDreamsignId("dreamsign-catalog-uuid"),
              name: "A Test Sign",
              effectDescription: "A stable test effect.",
              imageName: "test.webp",
              imageAlt: "A test Dreamsign",
            },
          ],
          signatureCards: signature.map((card) => ({
            cardId: card.id,
            cardNumber: card.cardNumber,
            name: card.name,
          })),
        },
      },
    };
  }

  describe("buildBattleStartView", () => {
    it("maps opponent identity, scene, signature UUIDs, dreamsign ids, and stakes", () => {
      const { init, cardDatabase } = makeInit();
      const view = buildBattleStartView(init, cardDatabase, ART_CATALOG);

      expect(view.scene).toEqual({
        kind: "dreamscape-scene",
        artKey: testDreamscapeArtKey("test_dreamscape"),
      });
      expect(view.avatar).toMatchObject({
        id: "opponent-uuid",
        name: "The Long-Named Opponent",
        title: "Keeper of the Last Horizon",
        ability: "Whenever you score, foresee 1.",
        abilityActive: true,
      });
      expect(view.signatureCards.map((card) => card.cardId)).toEqual(
        init.enemyDescriptor.signatureCards.map((card) => card.cardId),
      );
      expect(view.dreamsigns[0]).toMatchObject({
        id: init.enemyDescriptor.dreamsigns[0]?.id,
        imageName: "test.webp",
      });
      expect(view.dreamsigns[0]?.imageAlt).toEqual(expect.any(String));
      expect(view.pointsToWin).toBe(15);
      expect(view.essenceReward).toBe(90);
    });

    it("maps authored Mira guidance for the first two tutorial-journey battles", () => {
      const { init, cardDatabase } = makeInit();
      const configuration = {
        firstBattle: {
          speechBubble: {
            speaker: "mira" as const,
            delay: 1,
            horizontalOffset: -4,
            verticalOffset: 6,
            bubbleWidth: 650,
            text: "Review the first opponent.",
          },
        },
        secondBattle: {
          speechBubble: {
            speaker: "mira" as const,
            delay: 1,
            horizontalOffset: 12,
            verticalOffset: -8,
            bubbleWidth: 700,
            text: "Prepare for the second battle.",
          },
        },
      };
      const firstBattle = { ...init, completionLevelAtStart: 0 };
      const secondBattle = { ...init, completionLevelAtStart: 1 };

      expect(
        buildBattleStartView(firstBattle, cardDatabase, ART_CATALOG, {
          isTutorialJourney: true,
          configuration,
        }).guideDialogue,
      ).toEqual({
        id: `${init.battleId}:first-battle-start-guidance`,
        model: {
          portrait: { kind: "character-portrait", characterId: "mira" },
          portraitAlt: "Mira",
          speakerName: "Mira",
          text: "Review the first opponent.",
        },
        delaySeconds: 1,
        horizontalOffset: -4,
        verticalOffset: 6,
        bubbleWidth: 650,
      });
      expect(
        buildBattleStartView(secondBattle, cardDatabase, ART_CATALOG, {
          isTutorialJourney: true,
          configuration,
        }).guideDialogue,
      ).toEqual({
        id: `${init.battleId}:second-battle-start-guidance`,
        model: {
          portrait: { kind: "character-portrait", characterId: "mira" },
          portraitAlt: "Mira",
          speakerName: "Mira",
          text: "Prepare for the second battle.",
        },
        delaySeconds: 1,
        horizontalOffset: 12,
        verticalOffset: -8,
        bubbleWidth: 700,
      });
      expect(
        buildBattleStartView(secondBattle, cardDatabase, ART_CATALOG, {
          isTutorialJourney: false,
          configuration,
        }).guideDialogue,
      ).toBeUndefined();
      expect(
        buildBattleStartView(
          { ...init, completionLevelAtStart: 2 },
          cardDatabase,
          ART_CATALOG,
          { isTutorialJourney: true, configuration },
        ).guideDialogue,
      ).toBeUndefined();
    });
  });
});
