import type { JourneyContent } from "../data/journey-content";
import type { JourneyState, SiteState, SiteType } from "../types/journey";
import type { SiteGenerationContext } from "../atlas/atlas-generator";
import { regenerateAtlasForProgress } from "../atlas/atlas-generator";
import { createDefaultState } from "../state/journey-context";
import { createDreamsign } from "../data/dreamsigns";
import { createQaJourneyFoundation } from "./qa-journey-foundation";
import { buildExplorationRuntime } from "../coop/providers/exploration-provider";
import { initializeDraftState } from "../draft/draft-engine";
import { eligibleTransfigurations } from "../transfiguration/transfiguration-logic";
import { asSiteId } from "../types/identifiers";
import { asBattleId } from "../types/identifiers";
import { asCardId, type CardId } from "../types/card-identity";
import { asDeckEntryId } from "../types/identifiers";
import { asQaSceneId, type QaSceneId } from "../types/identifiers";

export interface QaSceneBuildOptions {
  /** Exact authored encounter source-card UUID for Exploration QA scenes. */
  explorationCardId?: CardId | null;
  /** Number of catalog Dreamsigns held before an Exploration offer is prepared. */
  explorationHeldDreamsignCount?: number;
  /** Dreamsign capacity in the parked Exploration state. */
  explorationMaxDreamsigns?: number;
  /** Number of authentic foundation starter-card entries retained in the deck. */
  explorationStarterCount?: number;
  /** Live room seed used by deterministic runtime offers in a QA snapshot. */
  journeySeed?: string;
}

/**
 * Developer-only "QA scenes": named jump points to screens that are otherwise
 * reachable only by playing a journey forward through battles. Each scene builds a
 * complete, valid {@link JourneyState} from live journey content (the same
 * generators the real journey uses, never hand-faked fixtures) and parks the run
 * directly on the target screen, so a screen like the Dream Atlas can be opened
 * for browser QA from an empty room.
 *
 * Reached with `?goto=<id>` on the journey app (see `src/App.tsx`). To add a
 * scene, register a {@link QaScene} here; the URL handling and mutation are
 * generic and need no further changes.
 */
export interface QaScene {
  /** URL token, e.g. `?goto=atlas`. Lowercase, stable. */
  id: QaSceneId;
  /** Short human label for logs and tooling. */
  label: string;
  /** What the scene shows and why it is otherwise hard to reach. */
  description: string;
  /**
   * When true, this scene's destination is the DreamAvatar-selection
   * (`journeyStart`) screen the fresh room already opens on — i.e. its built
   * state keeps `dreamAvatar: null`. App must not hold the "Opening QA scene…"
   * loading gate for such a scene: that gate waits for a DreamAvatar to be
   * selected and would otherwise spin forever.
   */
  landsOnJourneyStart?: boolean;
  /** Loads a folded battle slice immediately instead of the pre-battle reveal. */
  loadsBattle?: boolean;
  /**
   * Builds the parked journey state from current journey content, or returns null
   * when required content is missing.
   */
  build: (
    journeyContent: JourneyContent,
    options?: QaSceneBuildOptions,
  ) => JourneyState | null;
}

/**
 * The DreamAvatar selection screen a run opens on. This is the fresh-room
 * `journeyStart` state ({@link createDefaultState}, `dreamAvatar: null`), which
 * the "Create Game" lobby button also lands on — parking a room directly on it
 * lets the choose-your-avatar UI be QA'd from a `?goto=` URL without
 * clicking through the lobby first.
 */
const DREAM_AVATAR_SELECT_SCENE: QaScene = {
  id: asQaSceneId("dream-avatar-select"),
  label: "Avatar Select",
  description:
    "The choose-your-avatar screen a run opens on, parked directly on " +
    "journeyStart for UI QA without creating a game from the lobby.",
  landsOnJourneyStart: true,
  build: (journeyContent) =>
    createDefaultState(journeyContent.economyData.journey),
};

/**
 * Tutorial DreamAvatar selection: the normal journey-start presentation and
 * start-journey action with one fixed, centered offer and no reroll control.
 */
const TUTORIAL_DREAM_AVATAR_SELECT_SCENE: QaScene = {
  id: asQaSceneId("tutorial-dream-avatar-select"),
  label: "Tutorial Avatar Select",
  description:
    "The tutorial DreamAvatar selection screen with its one fixed avatar.",
  landsOnJourneyStart: true,
  build: (journeyContent) => {
    const tutorialDreamAvatar = journeyContent.dreamAvatars.find(
      (dreamAvatar) =>
        dreamAvatar.id === journeyContent.tutorial?.battle.playerDreamAvatarId,
    );
    if (tutorialDreamAvatar === undefined) return null;
    return {
      ...createDefaultState(journeyContent.economyData.journey),
      screen: {
        type: "journeyStart",
        tutorialDreamAvatarId: tutorialDreamAvatar.id,
      },
    };
  },
};

/**
 * Builds the between-dreamscapes atlas resting screen at a given progress depth.
 *
 * `layer` is the 0-indexed atlas layer the player's available frontier should sit
 * on — i.e. the layer of the dreamscapes they are currently choosing between.
 * Reaching layer N means N dreamscapes have been completed (the starter at layer
 * 0 plus N-1 interior dreamscapes), so the scene is built by replaying N real
 * dreamscape completions through {@link regenerateAtlasForProgress}: the same
 * generate-then-`advanceAtlas` code path a battle victory drives, never a
 * hand-faked layout. The run is then parked on the authoritative post-victory
 * resting state — `screen: atlas`,
 * `currentDreamscape: null`, and `completionLevel` matching the depth.
 *
 * Because the atlas is advanced for real, the frontier always shows one layer
 * ahead (the reveal-two-layers-ahead rule fires on each advance), so the scene
 * never reproduces the impossible layer-0 resting view where the next layer is
 * still unrevealed. Layer 0 is deliberately not offered: the player is always
 * inside the starter dreamscape at that depth and never rests on the atlas there.
 */
function atlasLayerSceneState(layer: number): QaScene["build"] {
  return (journeyContent) => {
    const foundation = createQaJourneyFoundation(journeyContent);
    if (foundation === null) {
      return null;
    }

    // No dreamscape modifiers are active on a QA jump-in, so the site-generation
    // context is empty — matching a fresh run's atlas generation.
    const context: SiteGenerationContext = {
      draftPickCount: journeyContent.draftData.offers.picksPerSite,
    };
    const atlas = regenerateAtlasForProgress(
      layer,
      context,
      {
        dreamscapes: journeyContent.dreamscapes,
        atlasData: journeyContent.atlasData,
        sitesData: journeyContent.sitesData,
        gambleData: journeyContent.gambleData,
        dreamsignPoolIds: foundation.state.remainingDreamsignPool,
        apollyonIncarnations: journeyContent.apollyonIncarnations,
      },
      { logEvents: true },
    );

    return {
      ...foundation.state,
      atlas,
      completionLevel: layer,
      currentDreamscape: null,
      screen: { type: "atlas" },
      activeSiteId: null,
    };
  };
}

/**
 * The Dream Atlas resting screen at the first real frontier, reached after
 * completing the starter dreamscape. The atlas UI labels this "Layer II" (the
 * column-II dreamscapes are the choices), and it is the same screen as
 * `?goto=atlas2`. Shows the layer-II dreamscape choices, the layer-III nodes
 * revealed ahead, and the boss node with its per-run Apollyon incarnation —
 * hovering the boss node shows the incarnation preview card. This is a genuinely
 * reachable resting state (the player has seen one layer ahead), unlike a
 * layer-I view. Deeper frontiers are reachable via `atlas3`…`atlas7`.
 */
const ATLAS_SCENE: QaScene = {
  id: asQaSceneId("atlas"),
  label: "Dream Atlas",
  description:
    "The between-dreamscapes atlas at the first frontier the UI labels " +
    '"Layer II" (after the starter dreamscape), with the boss node and Apollyon ' +
    "incarnation, for atlas UI and boss-preview QA.",
  build: atlasLayerSceneState(1),
};

/** The first Atlas frontier with Random Site's home dreamscape available. */
const RANDOM_SITE_ATLAS_SCENE: QaScene = {
  id: asQaSceneId("random-site-atlas"),
  label: "Dream Atlas (Random Site Home)",
  description:
    "The first Atlas frontier with Random Site's authored home available, " +
    "including its badge and reveal cards.",
  build: (journeyContent) => {
    const state = ATLAS_SCENE.build(journeyContent);
    const dreamscape = journeyContent.dreamscapes.find(
      (candidate) => candidate.signatureSite === "RandomSite",
    );
    if (state === null || dreamscape === undefined) return null;

    const target = Object.values(state.atlas.nodes).find(
      (node) =>
        node.state === "available" && node.id !== state.atlas.bossNodeId,
    );
    if (target === undefined) return null;

    const signatureIndex = target.sites.findIndex(
      (site) =>
        site.isEnhanced && site.type !== "Battle" && site.type !== "Draft",
    );
    if (signatureIndex < 0) return null;

    const sites = [...target.sites];
    sites[signatureIndex] = {
      id: sites[signatureIndex].id,
      type: "RandomSite",
      isEnhanced: true,
      isVisited: false,
      randomSite: {
        mode: "homeChoice",
        candidateSiteTypes: [
          ...journeyContent.sitesData.randomSite.destinations,
        ],
      },
    };
    const node = {
      ...target,
      dreamscapeId: dreamscape.id,
      sites,
      enhancedSiteType: "RandomSite" as const,
      knownDreamsignId: null,
    };
    return {
      ...state,
      atlas: {
        ...state.atlas,
        nodes: { ...state.atlas.nodes, [node.id]: node },
        knownDreamsignCarrierIds: state.atlas.knownDreamsignCarrierIds.filter(
          (nodeId) => nodeId !== node.id,
        ),
      },
    };
  },
};

/** The first Atlas frontier in the authored tutorial journey. */
const TUTORIAL_ATLAS_SCENE: QaScene = {
  id: asQaSceneId("tutorial-atlas"),
  label: "Tutorial Dream Atlas",
  description:
    "The tutorial journey's first Atlas visit after completing the starter dream.",
  build: (journeyContent) => {
    const state = ATLAS_SCENE.build(journeyContent);
    return state === null ? null : { ...state, isTutorialJourney: true };
  },
};

/**
 * Registers a `?goto=atlasN` scene parked on the atlas resting screen the UI
 * labels "Layer N". The UI numbers its seven columns I–VII (1-indexed), so the
 * displayed "Layer N" is the 0-indexed frontier `N - 1`. Layer I (the starter)
 * is never a resting frontier, so the numbered scenes start at `atlas2`.
 */
function atlasLayerScene(displayLayer: number): QaScene {
  return {
    id: asQaSceneId(`atlas${String(displayLayer)}`),
    label: `Dream Atlas (Layer ${String(displayLayer)})`,
    description:
      `The between-dreamscapes atlas the UI labels "Layer ${String(displayLayer)}", ` +
      `with the available frontier on that column, built by replaying real ` +
      `dreamscape completions for atlas UI QA at that depth.`,
    build: atlasLayerSceneState(displayLayer - 1),
  };
}

/**
 * Builds the Battle site inside the UI's one-indexed atlas Layer N. The journey's
 * `completionLevel` is zero-indexed, so Layer N uses completion level N - 1 —
 * the same mapping as `atlasN`. Replaying N - 1 real completions produces the
 * reachable frontier for that layer; the scene enters its topmost available
 * dreamscape, marks every non-Battle site visited, and parks on the keeper
 * battle exactly before the opposing-Avatar preview.
 */
function battleLayerSceneState(displayLayer: number): QaScene["build"] {
  return (journeyContent) => {
    const foundation = createQaJourneyFoundation(journeyContent);
    if (foundation === null) {
      return null;
    }

    const completionLevel = displayLayer - 1;
    const atlas =
      completionLevel === 0
        ? foundation.atlas
        : regenerateAtlasForProgress(
            completionLevel,
            { draftPickCount: journeyContent.draftData.offers.picksPerSite },
            {
              dreamscapes: journeyContent.dreamscapes,
              atlasData: journeyContent.atlasData,
              sitesData: journeyContent.sitesData,
              gambleData: journeyContent.gambleData,
              dreamsignPoolIds: foundation.state.remainingDreamsignPool,
              apollyonIncarnations: journeyContent.apollyonIncarnations,
            },
            { logEvents: true },
          );
    const layerNodeIds = atlas.layers[completionLevel] ?? [];
    const node = layerNodeIds
      .map((nodeId) => atlas.nodes[nodeId])
      .find((candidate) => candidate?.state === "available");
    if (node === undefined) {
      return null;
    }
    const battleSite = node.sites.find((site) => site.type === "Battle");
    if (battleSite === undefined) {
      return null;
    }

    const visitedSites = node.sites
      .filter((site) => site.type !== "Battle")
      .map((site) => site.id);
    const battleReadyNode = {
      ...node,
      sites: node.sites.map((site) =>
        site.type === "Battle" ? site : { ...site, isVisited: true },
      ),
    };

    return {
      ...foundation.state,
      atlas: {
        ...atlas,
        nodes: { ...atlas.nodes, [node.id]: battleReadyNode },
      },
      completionLevel,
      currentDreamscape: node.id,
      visitedSites,
      screen: { type: "site", siteId: battleSite.id },
      activeSiteId: battleSite.id,
    };
  };
}

/** Registers a `?goto=battleN` scene for the battle in UI Layer N. */
function battleLayerScene(displayLayer: number): QaScene {
  return {
    id: asQaSceneId(`battle${String(displayLayer)}`),
    label: `Battle (Layer ${String(displayLayer)})`,
    description:
      `The Layer ${String(displayLayer)} keeper battle, parked on the opposing ` +
      `Avatar preview with opponent strength tuned for that run depth.`,
    build: battleLayerSceneState(displayLayer),
  };
}

/** The first keeper battle, retained as the concise default battle scene id. */
const BATTLE_SCENE: QaScene = {
  id: asQaSceneId("battle"),
  label: "Battle (Layer 1)",
  description:
    "The Layer 1 keeper battle, parked on the opposing Avatar preview.",
  build: battleLayerSceneState(1),
};

/** A tutorial-journey keeper-battle preview with authored guidance. */
function tutorialBattleScene(displayLayer: 1 | 2): QaScene {
  return {
    id: asQaSceneId(`tutorial-battle${String(displayLayer)}`),
    label: `Tutorial Battle (Layer ${String(displayLayer)})`,
    description: `The tutorial journey's Layer ${String(displayLayer)} keeper battle, parked on the opposing Avatar preview.`,
    build: (journeyContent) => {
      const state = battleLayerSceneState(displayLayer)(journeyContent);
      return state === null ? null : { ...state, isTutorialJourney: true };
    },
  };
}

/** Developer entry point that mounts the Layer 1 playable battle board. */
export const PLAYABLE_BATTLE_SCENE_ID = asQaSceneId("battle-playable");
const PLAYABLE_BATTLE_SCENE: QaScene = {
  id: PLAYABLE_BATTLE_SCENE_ID,
  label: "Playable Battle (Layer 1)",
  description:
    "The Layer 1 keeper battle, mounted directly on the playable board with owned Dreamsigns for UI QA.",
  loadsBattle: true,
  build: (journeyContent) => {
    const state = battleLayerSceneState(1)(journeyContent);
    if (state === null) {
      return null;
    }
    return {
      ...state,
      dreamsigns: journeyContent.dreamsignTemplates
        .slice(0, 3)
        .map((template) => createDreamsign(template)),
    };
  },
};

/**
 * Builds the inside-a-dreamscape overview parked on the starter dreamscape,
 * seeded with `dreamsignCount` owned dreamsigns so the JourneyStatusBar's docked
 * dreamsign strip is exercised (inline up to four, an overflow stack beyond).
 */
function dreamscapeSceneState(dreamsignCount: number): QaScene["build"] {
  return (journeyContent) => {
    const foundation = createQaJourneyFoundation(journeyContent);
    if (foundation === null) {
      return null;
    }
    const dreamsigns = journeyContent.dreamsignTemplates
      .slice(0, dreamsignCount)
      .map((template) => createDreamsign(template));
    return {
      ...foundation.state,
      currentDreamscape: foundation.starterNode.id,
      screen: { type: "dreamscape" },
      dreamsigns,
    };
  };
}

/**
 * The inside-a-dreamscape overview, parked on the starter dreamscape with its
 * scatter of sites and a few docked dreamsigns. Otherwise reached only by
 * winning the keeper battle and choosing a dreamscape; parking here lets the
 * Cumulus dreamscape redesign (the scene, the site nodes, and the JourneyStatusBar
 * HUD) be QA'd from a URL.
 */
const DREAMSCAPE_SCENE: QaScene = {
  id: asQaSceneId("dreamscape"),
  label: "Dreamscape",
  description:
    "The inside-a-dreamscape overview with its floating site nodes and the " +
    "persistent JourneyStatusBar, parked on the dreamscape screen for UI QA.",
  build: dreamscapeSceneState(3),
};

/**
 * The starter dreamscape overview with one non-battle site retyped to Essence.
 * The run starts at 450 essence so collecting the site visibly demonstrates
 * that gains can exceed 500. Keeping the run on the overview lets QA exercise
 * the in-place Essence gain animation and the visited site's removal.
 */
const DREAMSCAPE_WITH_ESSENCE_SCENE: QaScene = {
  id: asQaSceneId("dreamscape-with-essence"),
  label: "Dreamscape with Essence",
  description:
    "The starter dreamscape overview with an Essence site ready to enter, " +
    "parked before its in-place collection animation for QA.",
  build: (journeyContent) => {
    const foundation = createQaJourneyFoundation(journeyContent);
    if (foundation === null) {
      return null;
    }

    const node = foundation.starterNode;
    const slot = node.sites.find((site) => site.type !== "Battle");
    if (slot === undefined) {
      return null;
    }

    const sites = node.sites.map((site) =>
      site.id === slot.id ? { ...site, type: "Essence" as const } : site,
    );
    const atlas = {
      ...foundation.atlas,
      nodes: {
        ...foundation.atlas.nodes,
        [node.id]: { ...node, sites },
      },
    };

    return {
      ...foundation.state,
      essence: 450,
      atlas,
      currentDreamscape: node.id,
      screen: { type: "dreamscape" },
      activeSiteId: null,
    };
  },
};

/**
 * The starter dreamscape overview with one non-battle site retyped to Reward.
 * The run stays on the overview so QA exercises the persisted reward reveal,
 * object-reveal animation, and grant without entering a site route.
 */
const REWARD_SCENE: QaScene = {
  id: asQaSceneId("reward"),
  label: "Reward",
  description:
    "The starter dreamscape overview with a Reward site ready to collect " +
    "in place, without navigating away from the dreamscape.",
  build: (journeyContent) => {
    const foundation = createQaJourneyFoundation(journeyContent);
    if (foundation === null) {
      return null;
    }

    const node = foundation.starterNode;
    const slot = node.sites.find((site) => site.type !== "Battle");
    if (slot === undefined) {
      return null;
    }

    const sites = node.sites.map((site) =>
      site.id === slot.id ? { ...site, type: "Reward" as const } : site,
    );
    const atlas = {
      ...foundation.atlas,
      nodes: {
        ...foundation.atlas.nodes,
        [node.id]: { ...node, sites },
      },
    };

    return {
      ...foundation.state,
      atlas,
      currentDreamscape: node.id,
      screen: { type: "dreamscape" },
      activeSiteId: null,
    };
  },
};

/** A Reward interaction with a full collection and a pending Dreamsign. */
const REWARD_AT_CAP_SCENE: QaScene = {
  id: asQaSceneId("reward-at-cap"),
  label: "Reward at Dreamsign Cap",
  description:
    "The starter dreamscape with a Reward site whose Dreamsign opens the " +
    "replacement dialog after its in-place reveal.",
  build: (journeyContent) => {
    const state = REWARD_SCENE.build(journeyContent);
    if (state === null || state.currentDreamscape === null) return null;
    const site = state.atlas.nodes[state.currentDreamscape]?.sites.find(
      (candidate) => candidate.type === "Reward",
    );
    const heldTemplates = journeyContent.dreamsignTemplates.slice(
      0,
      state.maxDreamsigns,
    );
    const pendingTemplate =
      journeyContent.dreamsignTemplates[state.maxDreamsigns];
    if (site === undefined || pendingTemplate === undefined) return null;
    const pendingDreamsign = createDreamsign(pendingTemplate);
    return {
      ...state,
      dreamsigns: heldTemplates.map((template) => createDreamsign(template)),
      siteRuntime: {
        ...state.siteRuntime,
        [site.id]: {
          kind: "reward",
          reward: { rewardType: "dreamsign", dreamsign: pendingDreamsign },
          remainingDreamsignPoolIds: state.remainingDreamsignPool.filter(
            (id) => id !== pendingDreamsign.id,
          ),
          accepted: false,
        },
      },
    };
  },
};

/**
 * The scene id that opens the deck-viewer overlay. The overlay is App-local
 * state (not a `Screen`), so parking on it takes two steps: this scene builds
 * the underlying dreamscape state (giving the run a full deck to show), and
 * `JourneyApp` opens the overlay when it sees this scene id. Exported so App and
 * this registry name it from one place rather than duplicating the string.
 */
export const DECK_VIEWER_SCENE_ID = asQaSceneId("deckviewer");

/** App-local Pool Viewer overlay scene, parked over a populated dreamscape. */
export const POOL_VIEWER_SCENE_ID = asQaSceneId("poolviewer");

/**
 * The deck-viewer overlay, parked on the starter dreamscape so the run carries
 * a full deck. Otherwise reached only by tapping the HUD deck sprite; parking
 * here lets the mobile deck grid and its press-and-hold zoom be QA'd (and
 * device-framed) from a URL.
 */
const DECK_VIEWER_SCENE: QaScene = {
  id: DECK_VIEWER_SCENE_ID,
  label: "Deck Viewer",
  description:
    "The deck viewer overlay over the starter dreamscape, opened on boot so " +
    "the card grid and press-and-hold zoom can be QA'd from a URL.",
  build: dreamscapeSceneState(3),
};

const POOL_VIEWER_SCENE: QaScene = {
  id: POOL_VIEWER_SCENE_ID,
  label: "Pool Viewer",
  description:
    "The run-pool browser overlay over the starter dreamscape, opened on boot " +
    "so its Cumulus controls, gallery, and responsive frame can be QA'd from a URL.",
  build: dreamscapeSceneState(3),
};

/**
 * The starting-deck reveal popup over the starter dreamscape. The popup is
 * driven by persisted state — it shows the first time a run has a DreamAvatar
 * and has not yet seen it — so this scene builds the starter dreamscape and
 * clears `hasSeenStartingDeckPopup`, and `JourneyApp` reveals the popup on its
 * own. Otherwise reached only on the very first entry into a fresh dreamscape;
 * parking here lets the popup's frosted-glass chrome be QA'd from a URL.
 */
const STARTING_DECK_SCENE: QaScene = {
  id: asQaSceneId("startingdeck"),
  label: "Starting Deck",
  description:
    "The starting-deck reveal popup over the starter dreamscape, shown on " +
    "boot so its frosted-glass chrome can be QA'd from a URL.",
  build: (journeyContent) => {
    const state = dreamscapeSceneState(3)(journeyContent);
    if (state === null) {
      return null;
    }
    return { ...state, hasSeenStartingDeckPopup: false };
  },
};

/**
 * Builds a scene parked directly on a site screen of `siteType`. Most site
 * screens are otherwise reachable only after winning the keeper battle and
 * choosing the dreamscape whose resident guide tends that site type, so this
 * retypes one of the starter dreamscape's non-battle sites to the target type
 * and parks the run on it. The site's per-screen runtime (e.g. transfiguration
 * offers) is created on entry by the screen itself, exactly as in normal play.
 */
function parkOnSite(siteType: SiteType, isEnhanced: boolean): QaScene["build"] {
  return (journeyContent) => {
    const foundation = createQaJourneyFoundation(journeyContent);
    if (foundation === null) {
      return null;
    }

    const node = foundation.starterNode;
    const slot = node.sites.find((site) => site.type !== "Battle");
    if (slot === undefined) {
      return null;
    }

    const site: SiteState = { ...slot, type: siteType, isEnhanced };
    const sites = node.sites.map((existing) =>
      existing.id === site.id ? site : existing,
    );
    const nextNode = { ...node, sites };
    const atlas = {
      ...foundation.atlas,
      nodes: { ...foundation.atlas.nodes, [node.id]: nextNode },
    };

    return {
      ...foundation.state,
      atlas,
      currentDreamscape: node.id,
      screen: { type: "site", siteId: site.id },
      activeSiteId: site.id,
    };
  };
}

/**
 * Gives a parked Exploration scene an ordinary Shop and Dreamsign Bazaar in the
 * same Dreamscape. The active Exploration site stays unchanged; one sibling is
 * repurposed as the Shop and the Bazaar is inserted immediately before Battle.
 * This leaves the player one interaction before the purchase-modifier action and
 * supports the authentic Exploration -> Dreamscape -> Shop/Bazaar workflow.
 */
function addExplorationPurchasePath(state: JourneyState): JourneyState | null {
  if (state.currentDreamscape === null || state.activeSiteId === null) {
    return null;
  }
  const node = state.atlas.nodes[state.currentDreamscape];
  if (node === undefined) return null;
  const shopSlot = node.sites.find(
    (site) => site.id !== state.activeSiteId && site.type !== "Battle",
  );
  if (shopSlot === undefined) return null;

  const bazaarId = `${state.activeSiteId}-qa-dreamsign-bazaar`;
  if (
    Object.values(state.atlas.nodes).some((candidate) =>
      candidate.sites.some((site) => site.id === bazaarId),
    )
  ) {
    return null;
  }

  const sites = node.sites.flatMap((site) => {
    if (site.id === shopSlot.id) {
      return [
        {
          id: site.id,
          type: "Shop" as const,
          isEnhanced: false,
          isVisited: false,
        },
      ];
    }
    if (site.type === "Battle") {
      return [
        {
          id: asSiteId(bazaarId),
          type: "DreamsignBazaar" as const,
          isEnhanced: false,
          isVisited: false,
        },
        site,
      ];
    }
    return [site];
  });

  return {
    ...state,
    // Odd Essence makes T82's floor-spent/ceil-retained contract observable.
    essence: 101,
    atlas: {
      ...state.atlas,
      nodes: {
        ...state.atlas.nodes,
        [node.id]: { ...node, sites },
      },
    },
  };
}

/** Exploration scene with enough eligible cards to exercise every follow-up. */
function explorationScene(
  isEnhanced: boolean,
  preset: "unique" | "duplicates" | "purchases" = "unique",
): QaScene {
  const hasDuplicates = preset === "duplicates";
  const hasPurchasePath = preset === "purchases";
  return {
    id: asQaSceneId(
      hasDuplicates
        ? "exploration-duplicates"
        : hasPurchasePath
          ? "exploration-purchases"
          : isEnhanced
            ? "exploration-enhanced"
            : "exploration",
    ),
    label: hasDuplicates
      ? "Exploration (Duplicate Deck)"
      : hasPurchasePath
        ? "Exploration (Purchase Path)"
        : isEnhanced
          ? "Exploration (Enhanced)"
          : "Exploration",
    description:
      "The Exploration site with Event, Survivor, Warrior, cheap Character, and Spirit Animal cards available for interaction QA" +
      (hasDuplicates
        ? ", including two duplicated card UUIDs."
        : hasPurchasePath
          ? ", with an ordinary Shop and Dreamsign Bazaar ready afterward."
          : "."),
    build: (journeyContent, options) => {
      const parkedState = parkOnSite("Exploration", isEnhanced)(journeyContent);
      const state =
        parkedState === null || !hasPurchasePath
          ? parkedState
          : addExplorationPurchasePath(parkedState);
      if (state === null) return null;
      const cards = [...journeyContent.cardDatabase.values()];
      const authenticStarterCardNumbers = new Set(
        journeyContent.poolContext?.starterCardNumbers ?? [],
      );
      const selected = new Map<number, (typeof cards)[number]>();
      const add = (
        matches: (card: (typeof cards)[number]) => boolean,
        count: number,
      ): void => {
        for (const card of cards) {
          if (
            authenticStarterCardNumbers.has(card.cardNumber) ||
            !matches(card) ||
            selected.has(card.cardNumber)
          ) {
            continue;
          }
          selected.set(card.cardNumber, card);
          if ([...selected.values()].filter(matches).length >= count) return;
        }
      };
      add((card) => card.cardType === "Event", 2);
      add(
        (card) => card.cardType === "Character" && card.subtype === "Survivor",
        2,
      );
      add(
        (card) => card.cardType === "Character" && card.subtype === "Warrior",
        2,
      );
      add(
        (card) =>
          card.cardType === "Character" &&
          card.energyCost !== null &&
          card.energyCost <=
            journeyContent.rewardSelectionData.tuning.costBands
              .cheapCharacterMaximum,
        4,
      );
      add(
        (card) =>
          card.cardType === "Character" && card.subtype === "Spirit Animal",
        6,
      );
      const dreamsignTemplatesById = new Map(
        journeyContent.dreamsignTemplates.map((template) => [
          template.id.toLowerCase(),
          template,
        ]),
      );
      const heldDreamsignTemplates = state.remainingDreamsignPool.flatMap(
        (dreamsignId) => {
          const template = dreamsignTemplatesById.get(
            dreamsignId.toLowerCase(),
          );
          return template === undefined ? [] : [template];
        },
      );
      const heldDreamsignCount =
        options?.explorationHeldDreamsignCount ??
        (heldDreamsignTemplates.length > 0 ? 1 : 0);
      const maxDreamsigns =
        options?.explorationMaxDreamsigns ?? state.maxDreamsigns;
      if (
        !Number.isInteger(heldDreamsignCount) ||
        heldDreamsignCount < 0 ||
        heldDreamsignCount > heldDreamsignTemplates.length ||
        !Number.isInteger(maxDreamsigns) ||
        maxDreamsigns < 0 ||
        heldDreamsignCount > maxDreamsigns
      ) {
        return null;
      }
      const heldDreamsigns = heldDreamsignTemplates
        .slice(0, heldDreamsignCount)
        .map((template) => createDreamsign(template));
      const heldDreamsignIds = new Set(
        heldDreamsignTemplates
          .slice(0, heldDreamsignCount)
          .map((template) => template.id.toLowerCase()),
      );
      let seededFastEvent = false;
      const uniqueDeck = [...selected.values()].map((card, index) => {
        const startsFast = card.cardType === "Event" && !seededFastEvent;
        if (startsFast) seededFastEvent = true;
        return {
          entryId: asDeckEntryId(`exploration-qa-${String(index + 1)}`),
          cardNumber: card.cardNumber,
          transfiguration: null,
          isBane: false,
          ...(startsFast ? { keywordModification: { fast: true } } : {}),
        };
      });
      const attunedEligibleEntries = uniqueDeck.filter((entry) => {
        const card = journeyContent.cardDatabase.get(entry.cardNumber);
        return (
          card !== undefined &&
          eligibleTransfigurations(
            journeyContent.transfigurationData,
            card,
          ).includes("Attuned")
        );
      });
      const duplicateSources =
        attunedEligibleEntries.length >= 2
          ? attunedEligibleEntries.slice(0, 2)
          : uniqueDeck.slice(0, 2);
      const duplicateEntries = hasDuplicates
        ? duplicateSources.map((entry, index) => ({
            ...entry,
            entryId: asDeckEntryId(
              `exploration-qa-duplicate-${String(index + 1)}`,
            ),
          }))
        : [];
      const authenticStarterDeck = state.deck.filter((entry) =>
        authenticStarterCardNumbers.has(entry.cardNumber),
      );
      const starterCount =
        options?.explorationStarterCount ?? authenticStarterDeck.length;
      if (
        !Number.isInteger(starterCount) ||
        starterCount < 0 ||
        starterCount > authenticStarterDeck.length
      ) {
        return null;
      }
      const qaDraftPoolCards = cards.filter(
        (card) => !authenticStarterCardNumbers.has(card.cardNumber),
      );
      const qaDraftPoolCopiesByCard = Object.fromEntries(
        qaDraftPoolCards.map((card) => [String(card.cardNumber), 1]),
      );
      const qaResolvedPackage =
        state.resolvedPackage === null
          ? null
          : {
              ...state.resolvedPackage,
              draftPoolCopiesByCard: qaDraftPoolCopiesByCard,
              draftPoolSize: qaDraftPoolCards.length,
            };
      const qaState: JourneyState = {
        ...state,
        ...(options?.journeySeed === undefined
          ? {}
          : { seed: options.journeySeed }),
        maxDreamsigns,
        deck: [
          ...authenticStarterDeck.slice(0, starterCount),
          ...uniqueDeck,
          ...duplicateEntries,
        ],
        resolvedPackage: qaResolvedPackage,
        draftState:
          qaResolvedPackage === null
            ? state.draftState
            : initializeDraftState(
                journeyContent.cardDatabase,
                qaResolvedPackage,
              ),
        dreamsigns: heldDreamsigns,
        remainingDreamsignPool: state.remainingDreamsignPool.filter(
          (dreamsignId) => !heldDreamsignIds.has(dreamsignId.toLowerCase()),
        ),
      };
      const requestedCardId = options?.explorationCardId ?? null;
      if (requestedCardId === null) return qaState;

      const currentNodeId = qaState.atlas.currentNodeId;
      if (
        currentNodeId === null ||
        qaState.currentDreamscape !== currentNodeId
      ) {
        return null;
      }
      const node = qaState.atlas.nodes[currentNodeId];
      const siteOwners = Object.values(qaState.atlas.nodes).filter(
        (candidate) =>
          candidate.sites.some((site) => site.id === qaState.activeSiteId),
      );
      if (
        node === undefined ||
        siteOwners.length !== 1 ||
        siteOwners[0] !== node
      ) {
        return null;
      }
      const site = node.sites.find(
        (candidate) => candidate.id === qaState.activeSiteId,
      );
      if (site === undefined) return null;
      const runtime = buildExplorationRuntime(
        qaState,
        site,
        journeyContent,
        () => 0.37,
        asCardId(requestedCardId),
      );
      if (runtime === null) return null;
      return {
        ...qaState,
        siteRuntime: {
          ...qaState.siteRuntime,
          [site.id]: runtime,
        },
      };
    },
  };
}

/**
 * The journey victory end screen, shown after the final boss is defeated. Built
 * by parking the run on the `journeyComplete` screen with a full completion count,
 * so the summary stats and final-deck reveal can be QA'd without playing seven
 * battles forward.
 */
const JOURNEY_COMPLETE_SCENE: QaScene = {
  id: asQaSceneId("journeycomplete"),
  label: "Journey Complete",
  description:
    "The victory end screen with completion stats and the final-deck reveal, " +
    "parked on the journeyComplete screen for UI QA.",
  build: (journeyContent) => {
    const foundation = createQaJourneyFoundation(journeyContent);
    if (foundation === null) {
      return null;
    }
    const atlas = regenerateAtlasForProgress(
      6,
      { draftPickCount: journeyContent.draftData.offers.picksPerSite },
      {
        dreamscapes: journeyContent.dreamscapes,
        atlasData: journeyContent.atlasData,
        sitesData: journeyContent.sitesData,
        gambleData: journeyContent.gambleData,
        dreamsignPoolIds: foundation.state.remainingDreamsignPool,
        apollyonIncarnations: journeyContent.apollyonIncarnations,
      },
      { logEvents: true },
    );
    const boss = atlas.nodes[atlas.bossNodeId];
    if (boss === undefined) {
      return null;
    }
    const dreamsigns = journeyContent.dreamsignTemplates
      .slice(0, 4)
      .map((template) => createDreamsign(template));
    return {
      ...foundation.state,
      atlas: {
        ...atlas,
        nodes: {
          ...atlas.nodes,
          [boss.id]: { ...boss, state: "completed" },
        },
      },
      completionLevel: 7,
      currentDreamscape: boss.id,
      dreamsigns,
      screen: { type: "journeyComplete" },
    };
  },
};

/**
 * The journey defeat end screen, shown after a lost battle. Built with a frozen
 * failure summary describing a defeat, so the result title, reason badge, and
 * summary grid can be QA'd without losing a real battle.
 */
const JOURNEY_FAILED_SCENE: QaScene = {
  id: asQaSceneId("journeyfailed"),
  label: "Journey Failed",
  description:
    "The defeat end screen with its failure summary, parked on the " +
    "journeyFailed screen for UI QA.",
  build: (journeyContent) => {
    const foundation = createQaJourneyFoundation(journeyContent);
    if (foundation === null) {
      return null;
    }
    const node = foundation.starterNode;
    const battleSite = node.sites.find((site) => site.type === "Battle");
    const siteId = battleSite?.id ?? node.sites[0]?.id ?? asSiteId("qa-site");
    return {
      ...foundation.state,
      completionLevel: 2,
      currentDreamscape: node.id,
      screen: { type: "journeyFailed" },
      failureSummary: {
        battleId: asBattleId("qa-battle"),
        result: "defeat",
        reason: "score_target_reached",
        siteId,
        siteLabel: "Battle",
        dreamscapeIdOrNone: node.id,
        turnNumber: 6,
        playerScore: 4,
        enemyScore: 10,
      },
    };
  },
};

/** Registers a `?goto=` site scene for the given site type. */
function siteScene(
  id: string,
  label: string,
  siteType: SiteType,
  isEnhanced = false,
): QaScene {
  return {
    id: asQaSceneId(id),
    label,
    description: `The ${label} site screen, parked directly on the site for UI QA.`,
    build: parkOnSite(siteType, isEnhanced),
  };
}

function randomSiteScene(mode: "single" | "homeChoice"): QaScene {
  return {
    id: asQaSceneId(mode === "single" ? "random-site" : "random-site-home"),
    label:
      mode === "single"
        ? "Random Site (Hosted Shop)"
        : "Random Site (Home Choice)",
    description:
      mode === "single"
        ? "A configured enhanced destination hosted by Random Site's presenting guide."
        : "Random Site's home choice with configured persisted destinations ready to be offered.",
    build: (journeyContent) => {
      const destination = journeyContent.sitesData.randomSite.destinations[0];
      const guideId = journeyContent.sitesData.randomSite.guideId;
      if (destination === undefined || typeof guideId !== "string") return null;
      const state = parkOnSite(
        mode === "single" ? destination : "RandomSite",
        true,
      )(journeyContent);
      if (
        state === null ||
        state.currentDreamscape === null ||
        state.activeSiteId === null
      )
        return null;
      const node = state.atlas.nodes[state.currentDreamscape];
      const sites = node.sites.map((site) =>
        site.id !== state.activeSiteId
          ? site
          : mode === "single"
            ? {
                ...site,
                type: destination,
                randomSite: {
                  mode: "single" as const,
                  presentingGuideId: guideId,
                  candidateSiteTypes: [destination],
                  destinationSiteType: destination,
                  materialized: true,
                },
              }
            : {
                ...site,
                type: "RandomSite" as const,
                randomSite: {
                  mode: "homeChoice" as const,
                  candidateSiteTypes: [
                    ...journeyContent.sitesData.randomSite.destinations,
                  ],
                },
              },
      );
      return {
        ...state,
        atlas: {
          ...state.atlas,
          nodes: { ...state.atlas.nodes, [node.id]: { ...node, sites } },
        },
      };
    },
  };
}

/** All registered QA scenes, keyed by `id`. */
export const QA_SCENES: readonly QaScene[] = [
  DREAM_AVATAR_SELECT_SCENE,
  TUTORIAL_DREAM_AVATAR_SELECT_SCENE,
  ATLAS_SCENE,
  RANDOM_SITE_ATLAS_SCENE,
  TUTORIAL_ATLAS_SCENE,
  // Atlas resting screen at each reachable frontier, numbered by the UI's
  // "Layer N" column label (columns I–VII). Column I is the starter you begin
  // in and is never a resting frontier, so the numbered scenes run Layer II
  // through Layer VII (VII is the boss-only frontier).
  atlasLayerScene(2),
  atlasLayerScene(3),
  atlasLayerScene(4),
  atlasLayerScene(5),
  atlasLayerScene(6),
  atlasLayerScene(7),
  BATTLE_SCENE,
  tutorialBattleScene(1),
  tutorialBattleScene(2),
  PLAYABLE_BATTLE_SCENE,
  battleLayerScene(1),
  battleLayerScene(2),
  battleLayerScene(3),
  battleLayerScene(4),
  battleLayerScene(5),
  battleLayerScene(6),
  battleLayerScene(7),
  DREAMSCAPE_SCENE,
  DREAMSCAPE_WITH_ESSENCE_SCENE,
  REWARD_SCENE,
  REWARD_AT_CAP_SCENE,
  DECK_VIEWER_SCENE,
  POOL_VIEWER_SCENE,
  STARTING_DECK_SCENE,
  siteScene("draft", "Draft", "Draft"),
  siteScene("transfiguration", "Transfiguration", "Transfiguration"),
  siteScene(
    "transfiguration-enhanced",
    "Transfiguration (Enhanced)",
    "Transfiguration",
    true,
  ),
  siteScene("duplication", "Duplication", "Duplication"),
  siteScene(
    "duplication-enhanced",
    "Duplication (Enhanced)",
    "Duplication",
    true,
  ),
  siteScene("purge", "Purge", "Purge"),
  siteScene("purge-enhanced", "Purge (Enhanced)", "Purge", true),
  siteScene("shop", "Shop", "Shop"),
  siteScene("shop-enhanced", "Shop (Enhanced)", "Shop", true),
  siteScene("dreamsignbazaar", "Dreamsign Bazaar", "DreamsignBazaar"),
  siteScene(
    "dreamsignbazaar-enhanced",
    "Dreamsign Bazaar (Enhanced)",
    "DreamsignBazaar",
    true,
  ),
  siteScene("augury", "Augury", "Augury"),
  siteScene("augury-enhanced", "Augury (Enhanced)", "Augury", true),
  randomSiteScene("single"),
  randomSiteScene("homeChoice"),
  siteScene("gamble", "Gamble", "Gamble"),
  siteScene("gamble-enhanced", "Gamble (Farpoint)", "Gamble", true),
  explorationScene(false),
  explorationScene(true),
  explorationScene(false, "duplicates"),
  explorationScene(false, "purchases"),
  siteScene(
    "dreamsign-revelation",
    "Dreamsign Revelation",
    "DreamsignRevelation",
  ),
  siteScene(
    "dreamsign-revelation-enhanced",
    "Dreamsign Revelation (Enhanced)",
    "DreamsignRevelation",
    true,
  ),
  JOURNEY_COMPLETE_SCENE,
  JOURNEY_FAILED_SCENE,
];

/** Returns the QA scene for `id`, or null when `id` is not registered. */
export function findQaScene(id: QaSceneId): QaScene | null {
  const normalized = id.trim().toLowerCase();
  return QA_SCENES.find((scene) => scene.id === normalized) ?? null;
}

/** Whether `id` intentionally bootstraps directly into active battle state. */
export function qaSceneLoadsBattle(id: QaSceneId): boolean {
  return findQaScene(id)?.loadsBattle === true;
}

/**
 * Builds the parked journey state for `id`, or null when the id is unknown or the
 * scene cannot be built from the current journey content.
 */
export function buildQaScene(
  id: QaSceneId,
  journeyContent: JourneyContent,
  options: QaSceneBuildOptions = {},
): JourneyState | null {
  return findQaScene(id)?.build(journeyContent, options) ?? null;
}
