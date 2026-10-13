import { journeySites } from "../../rules/journey/journey-sites";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { makeTestAtlasNode } from "../../testing/atlas-fixtures";
import { createJourneyModifierRegistry } from "../../rules/journey/modifier-registry";
import { journeyEssence } from "../../rules/journey/journey-essence";
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
import {
  parseAtlasNodeId,
  parseDeckEntryId,
  parseSiteId,
} from "../../types/identifiers";
import type { SiteId } from "../../types/identifiers";
import {
  testCardId,
  testDreamsignId,
  testExplorationActionId,
  testDreamscapeArtKey,
  testDreamscapeId,
} from "../../types/test-identities";
import { ART_CATALOG } from "./dreamscape-view-model.fixtures";

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


it("uses live Essence multipliers and a persisted Pearl reward in the existing inline model", () => {
  const source = testDreamsignId("synthetic-quote-source");
  const incoming = testDreamsignId("synthetic-pearl-offer");
  const held = { id: source, name: "Same name", effectDescription: "Synthetic", imageName: "synthetic" };
  const essenceSite: SiteState = { id: parseSiteId("essence-quote"), type: "Essence", isVisited: false, isEnhanced: false };
  const node = makeTestAtlasNode(parseAtlasNodeId("quote-node"), [essenceSite]);
  const state = { ...testJourneyState(), dreamsigns: [held], maxDreamsigns: 1 };
  state.siteRuntime[essenceSite.id] = { kind: "essence", amount: 7, accepted: false };
  const registry = createJourneyModifierRegistry([journeyEssence(source, { kind: "multiplyEssenceSiteGain", factor: 3 })]);
  const view = () => buildDreamscapeViewImpl(node, "Synthetic", null, state, MINIMAL_SITES_DATA, 2, null, undefined, registry);
  expect(view().inlineRewards[essenceSite.id]).toEqual({ kind: "essence", amount: 21 });
  state.siteRuntime[essenceSite.id] = { kind: "reward", reward: { rewardType: "dreamsign", dreamsign: { ...held, id: incoming } }, remainingDreamsignPoolIds: [], accepted: false, journeyEssenceSource: source };
  expect(view().inlineRewards[essenceSite.id]).toMatchObject({ kind: "dreamsign", dreamsign: { id: incoming }, requiresReplacement: true });
  state.dreamsigns = [];
  expect(view().inlineRewards[essenceSite.id]).toMatchObject({ kind: "dreamsign", dreamsign: { id: incoming }, requiresReplacement: false });
});


it("projects a durable enhanced offer after reload without the first reward animation", () => {
  const site: SiteState = { id: parseSiteId("enhanced-quote"), type: "Reward", isVisited: false, isEnhanced: false };
  const first = { id: testDreamsignId("quote-first"), name: "Same name", effectDescription: "" };
  const second = { ...first, id: testDreamsignId("quote-second") };
  const node = makeTestAtlasNode(parseAtlasNodeId("enhanced-quote-node"), [site]);
  const state = { ...testJourneyState(), currentDreamscape: node.id, maxDreamsigns: 1, dreamsigns: [first] };
  state.siteRuntime[site.id] = { kind: "reward", reward: { rewardType: "dreamsign", dreamsign: first }, accepted: false,
    remainingDreamsignPoolIds: [], enhancedDreamsignOffer: { standardDreamsignId: first.id, offeredDreamsigns: [first, second],
      requestedCount: 3, selectionRulesVersion: SELECTION_RULES_VERSION } };
  const view = (selected: typeof first.id | null = null) => buildDreamscapeViewImpl(node, "Synthetic", null,
    JSON.parse(JSON.stringify(state)) as typeof state, MINIMAL_SITES_DATA, 2, null, undefined, undefined,
    selected === null ? null : { siteId: site.id, dreamsignId: selected });
  expect(view().rewardChoice?.options.map((option) => option.id)).toEqual([first.id, second.id]);
  expect(view().inlineRewards[site.id]).toBeUndefined();
  expect(view(second.id).rewardChoice?.replacement).toMatchObject({ incoming: { id: second.id }, held: [{ id: first.id }] });
  expect(view(testDreamsignId("absent-option")).rewardChoice?.replacement).toBeNull();
  const foreign = buildDreamscapeViewImpl(node, "Synthetic", null, state, MINIMAL_SITES_DATA, 2,
    null, undefined, undefined, { siteId: parseSiteId("prior-reward-site"), dreamsignId: second.id });
  expect(foreign.rewardChoice?.replacement).toBeNull();
  const runtime = state.siteRuntime[site.id];
  if (runtime?.kind !== "reward") throw new Error("expected Reward");
  runtime.accepted = true;
  expect(view().rewardChoice).toBeUndefined();
});


it("presents a held targeted enhancement like a natural mode while keeping prepared ordinary sites fixed", () => {
  const source = testDreamsignId("view-targeted"), siteId = parseSiteId("view-targeted-site");
  const registry = createJourneyModifierRegistry([journeySites(source, {
    kind: "enhanceSiteTypes", siteTypes: ["Reward", "DreamsignRevelation"],
  })]);
  const node = makeTestAtlasNode(parseAtlasNodeId("view-targeted-node"), [{ id: siteId,
    type: "DreamsignRevelation", isVisited: false, isEnhanced: false }]);
  const state = { ...testJourneyState(), dreamsigns: [{ id: source, name: "Fixture", effectDescription: "" }] };
  const view = (n: DreamscapeNode, s: JourneyState) => buildDreamscapeViewImpl(n, "Fixture", null, s,
    MINIMAL_SITES_DATA, 5, null, undefined, registry);
  const natural = { ...node, sites: node.sites.map((site) => ({ ...site, isEnhanced: true })) };
  expect(view(node, state).sites).toEqual(view(natural, state).sites);
  expect(node.sites[0].isEnhanced).toBe(false);
  const lost = { ...state, dreamsigns: [] };
  const prepared = { ...state, siteRuntime: { [siteId]: { kind: "dreamsignOffer" as const,
    offeredDreamsigns: [], remainingDreamsignPool: [], accepted: false } } };
  expect(view(node, prepared).sites).toEqual(view(node, lost).sites);
});
