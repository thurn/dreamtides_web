import type { QuestContent } from "../data/quest-content";
import type { QuestState, SiteState, SiteType } from "../types/quest";
import type { SiteGenerationContext } from "../atlas/atlas-generator";
import { regenerateAtlasForProgress } from "../atlas/atlas-generator";
import { createDefaultState } from "../state/quest-context";
import { createDreamsign } from "../data/dreamsigns";
import { createQaQuestFoundation } from "./qa-quest-foundation";

/**
 * Developer-only "QA scenes": named jump points to screens that are otherwise
 * reachable only by playing a quest forward through battles. Each scene builds a
 * complete, valid {@link QuestState} from live quest content (the same
 * generators the real quest uses, never hand-faked fixtures) and parks the run
 * directly on the target screen, so a screen like the Dream Atlas can be opened
 * for browser QA from an empty room.
 *
 * Reached with `?goto=<id>` on the quest app (see `src/App.tsx`). To add a
 * scene, register a {@link QaScene} here; the URL handling and mutation are
 * generic and need no further changes.
 */
export interface QaScene {
  /** URL token, e.g. `?goto=atlas`. Lowercase, stable. */
  id: string;
  /** Short human label for logs and tooling. */
  label: string;
  /** What the scene shows and why it is otherwise hard to reach. */
  description: string;
  /**
   * When true, this scene's destination is the Dreamcaller-selection
   * (`questStart`) screen the fresh room already opens on — i.e. its built
   * state keeps `dreamcaller: null`. App must not hold the "Opening QA scene…"
   * loading gate for such a scene: that gate waits for a Dreamcaller to be
   * selected and would otherwise spin forever.
   */
  landsOnQuestStart?: boolean;
  /**
   * Builds the parked quest state from current quest content, or returns null
   * when required content is missing.
   */
  build: (questContent: QuestContent) => QuestState | null;
}

/**
 * The Dreamcaller selection screen a run opens on. This is the fresh-room
 * `questStart` state ({@link createDefaultState}, `dreamcaller: null`), which
 * the "Create Game" lobby button also lands on — parking a room directly on it
 * lets the choose-your-Dreamcaller UI be QA'd from a `?goto=` URL without
 * clicking through the lobby first.
 */
const DREAMCALLER_SELECT_SCENE: QaScene = {
  id: "dreamcaller-select",
  label: "Dreamcaller Select",
  description:
    "The choose-your-Dreamcaller screen a run opens on, parked directly on " +
    "questStart for UI QA without creating a game from the lobby.",
  landsOnQuestStart: true,
  build: () => createDefaultState(),
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
 * hand-faked layout. The run is then parked on the resting atlas state exactly as
 * `battle-completion-bridge` leaves it after a win — `screen: atlas`,
 * `currentDreamscape: null`, and `completionLevel` matching the depth.
 *
 * Because the atlas is advanced for real, the frontier always shows one layer
 * ahead (the reveal-two-layers-ahead rule fires on each advance), so the scene
 * never reproduces the impossible layer-0 resting view where the next layer is
 * still unrevealed. Layer 0 is deliberately not offered: the player is always
 * inside the starter dreamscape at that depth and never rests on the atlas there.
 */
function atlasLayerSceneState(layer: number): QaScene["build"] {
  return (questContent) => {
    const foundation = createQaQuestFoundation(questContent);
    if (foundation === null) {
      return null;
    }

    // No dreamscape modifiers are active on a QA jump-in, so the site-generation
    // context is empty — matching a fresh run's atlas generation.
    const context: SiteGenerationContext = {};
    const atlas = regenerateAtlasForProgress(
      layer,
      context,
      {
        dreamscapes: questContent.dreamscapes,
        atlasConfig: questContent.atlasConfig,
        dreamsignPoolIds: foundation.state.remainingDreamsignPool,
        apollyonIncarnations: questContent.apollyonIncarnations,
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
  id: "atlas",
  label: "Dream Atlas",
  description:
    "The between-dreamscapes atlas at the first frontier the UI labels " +
    '"Layer II" (after the starter dreamscape), with the boss node and Apollyon ' +
    "incarnation, for atlas UI and boss-preview QA.",
  build: atlasLayerSceneState(1),
};

/**
 * Registers a `?goto=atlasN` scene parked on the atlas resting screen the UI
 * labels "Layer N". The UI numbers its seven columns I–VII (1-indexed), so the
 * displayed "Layer N" is the 0-indexed frontier `N - 1`. Layer I (the starter)
 * is never a resting frontier, so the numbered scenes start at `atlas2`.
 */
function atlasLayerScene(displayLayer: number): QaScene {
  return {
    id: `atlas${String(displayLayer)}`,
    label: `Dream Atlas (Layer ${String(displayLayer)})`,
    description:
      `The between-dreamscapes atlas the UI labels "Layer ${String(displayLayer)}", ` +
      `with the available frontier on that column, built by replaying real ` +
      `dreamscape completions for atlas UI QA at that depth.`,
    build: atlasLayerSceneState(displayLayer - 1),
  };
}

/**
 * Builds the Battle site inside the UI's one-indexed atlas Layer N. The quest's
 * `completionLevel` is zero-indexed, so Layer N uses completion level N - 1 —
 * the same mapping as `atlasN`. Replaying N - 1 real completions produces the
 * reachable frontier for that layer; the scene enters its topmost available
 * dreamscape, marks every non-Battle site visited, and parks on the keeper
 * battle exactly before the opposing-Dreamcaller preview.
 */
function battleLayerSceneState(displayLayer: number): QaScene["build"] {
  return (questContent) => {
    const foundation = createQaQuestFoundation(questContent);
    if (foundation === null) {
      return null;
    }

    const completionLevel = displayLayer - 1;
    const atlas = completionLevel === 0
      ? foundation.atlas
      : regenerateAtlasForProgress(
          completionLevel,
          {},
          {
            dreamscapes: questContent.dreamscapes,
            atlasConfig: questContent.atlasConfig,
            dreamsignPoolIds: foundation.state.remainingDreamsignPool,
            apollyonIncarnations: questContent.apollyonIncarnations,
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
    id: `battle${String(displayLayer)}`,
    label: `Battle (Layer ${String(displayLayer)})`,
    description:
      `The Layer ${String(displayLayer)} keeper battle, parked on the opposing ` +
      `Dreamcaller preview with opponent strength tuned for that run depth.`,
    build: battleLayerSceneState(displayLayer),
  };
}

/** The first keeper battle, retained as the concise default battle scene id. */
const BATTLE_SCENE: QaScene = {
  id: "battle",
  label: "Battle (Layer 1)",
  description:
    "The Layer 1 keeper battle, parked on the opposing Dreamcaller preview.",
  build: battleLayerSceneState(1),
};

/** Developer entry point that mounts the Layer 1 playable battle board. */
export const PLAYABLE_BATTLE_SCENE_ID = "battle-playable";
const PLAYABLE_BATTLE_SCENE: QaScene = {
  id: PLAYABLE_BATTLE_SCENE_ID,
  label: "Playable Battle (Layer 1)",
  description:
    "The Layer 1 keeper battle, mounted directly on the playable board for UI QA.",
  build: battleLayerSceneState(1),
};

/**
 * Builds the inside-a-dreamscape overview parked on the starter dreamscape,
 * seeded with `dreamsignCount` owned dreamsigns so the QuestStatusBar's docked
 * dreamsign strip is exercised (inline up to four, an overflow stack beyond).
 */
function dreamscapeSceneState(
  dreamsignCount: number,
): QaScene["build"] {
  return (questContent) => {
    const foundation = createQaQuestFoundation(questContent);
    if (foundation === null) {
      return null;
    }
    const dreamsigns = questContent.dreamsignTemplates
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
 * Tango dreamscape redesign (the scene, the site nodes, and the QuestStatusBar
 * HUD) be QA'd from a URL.
 */
const DREAMSCAPE_SCENE: QaScene = {
  id: "dreamscape",
  label: "Dreamscape",
  description:
    "The inside-a-dreamscape overview with its floating site nodes and the " +
    "persistent QuestStatusBar, parked on the dreamscape screen for UI QA.",
  build: dreamscapeSceneState(3),
};

/**
 * The starter dreamscape overview with one non-battle site retyped to Essence.
 * Keeping the run on the overview lets QA exercise the normal site-entry
 * transition and Essence-screen enter animation instead of booting inside it.
 */
const DREAMSCAPE_WITH_ESSENCE_SCENE: QaScene = {
  id: "dreamscape-with-essence",
  label: "Dreamscape with Essence",
  description:
    "The starter dreamscape overview with an Essence site ready to enter, " +
    "parked before the site-entry transition for animation QA.",
  build: (questContent) => {
    const foundation = createQaQuestFoundation(questContent);
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
      atlas,
      currentDreamscape: node.id,
      screen: { type: "dreamscape" },
      activeSiteId: null,
    };
  },
};

/**
 * The scene id that opens the deck-viewer overlay. The overlay is App-local
 * state (not a `Screen`), so parking on it takes two steps: this scene builds
 * the underlying dreamscape state (giving the run a full deck to show), and
 * `QuestApp` opens the overlay when it sees this scene id. Exported so App and
 * this registry name it from one place rather than duplicating the string.
 */
export const DECK_VIEWER_SCENE_ID = "deckviewer";

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

/**
 * The starting-deck reveal popup over the starter dreamscape. The popup is
 * driven by persisted state — it shows the first time a run has a Dreamcaller
 * and has not yet seen it — so this scene builds the starter dreamscape and
 * clears `hasSeenStartingDeckPopup`, and `QuestApp` reveals the popup on its
 * own. Otherwise reached only on the very first entry into a fresh dreamscape;
 * parking here lets the popup's frosted-glass chrome be QA'd from a URL.
 */
const STARTING_DECK_SCENE: QaScene = {
  id: "startingdeck",
  label: "Starting Deck",
  description:
    "The starting-deck reveal popup over the starter dreamscape, shown on " +
    "boot so its frosted-glass chrome can be QA'd from a URL.",
  build: (questContent) => {
    const state = dreamscapeSceneState(3)(questContent);
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
function parkOnSite(
  siteType: SiteType,
  isEnhanced: boolean,
): QaScene["build"] {
  return (questContent) => {
    const foundation = createQaQuestFoundation(questContent);
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
 * The quest victory end screen, shown after the final boss is defeated. Built
 * by parking the run on the `questComplete` screen with a full completion count,
 * so the summary stats and final-deck reveal can be QA'd without playing seven
 * battles forward.
 */
const QUEST_COMPLETE_SCENE: QaScene = {
  id: "questcomplete",
  label: "Quest Complete",
  description:
    "The victory end screen with completion stats and the final-deck reveal, " +
    "parked on the questComplete screen for UI QA.",
  build: (questContent) => {
    const foundation = createQaQuestFoundation(questContent);
    if (foundation === null) {
      return null;
    }
    return {
      ...foundation.state,
      completionLevel: 7,
      screen: { type: "questComplete" },
    };
  },
};

/**
 * The quest defeat end screen, shown after a lost battle. Built with a frozen
 * failure summary describing a defeat, so the result title, reason badge, and
 * summary grid can be QA'd without losing a real battle.
 */
const QUEST_FAILED_SCENE: QaScene = {
  id: "questfailed",
  label: "Quest Failed",
  description:
    "The defeat end screen with its failure summary, parked on the " +
    "questFailed screen for UI QA.",
  build: (questContent) => {
    const foundation = createQaQuestFoundation(questContent);
    if (foundation === null) {
      return null;
    }
    const node = foundation.starterNode;
    const battleSite = node.sites.find((site) => site.type === "Battle");
    const siteId = battleSite?.id ?? node.sites[0]?.id ?? "qa-site";
    return {
      ...foundation.state,
      completionLevel: 2,
      currentDreamscape: node.id,
      screen: { type: "questFailed" },
      failureSummary: {
        battleId: "qa-battle",
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
    id,
    label,
    description: `The ${label} site screen, parked directly on the site for UI QA.`,
    build: parkOnSite(siteType, isEnhanced),
  };
}

/** All registered QA scenes, keyed by `id`. */
export const QA_SCENES: readonly QaScene[] = [
  DREAMCALLER_SELECT_SCENE,
  ATLAS_SCENE,
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
  DECK_VIEWER_SCENE,
  STARTING_DECK_SCENE,
  siteScene("draft", "Draft", "Draft"),
  siteScene("essence", "Essence", "Essence"),
  siteScene("transfiguration", "Transfiguration", "Transfiguration"),
  siteScene(
    "transfiguration-enhanced",
    "Transfiguration (Enhanced)",
    "Transfiguration",
    true,
  ),
  siteScene("duplication", "Duplication", "Duplication"),
  siteScene("duplication-enhanced", "Duplication (Enhanced)", "Duplication", true),
  siteScene("purge", "Purge", "Purge"),
  siteScene("purge-enhanced", "Purge (Enhanced)", "Purge", true),
  siteScene("shop", "Shop", "Shop"),
  siteScene("shop-enhanced", "Shop (Enhanced)", "Shop", true),
  siteScene("dreamsignmarket", "Dreamsign Market", "DreamsignMarket"),
  siteScene(
    "dreamsignmarket-enhanced",
    "Dreamsign Market (Enhanced)",
    "DreamsignMarket",
    true,
  ),
  siteScene("dreamaugury", "Dream Augury", "DreamAugury"),
  siteScene("dreamaugury-enhanced", "Dream Augury (Enhanced)", "DreamAugury", true),
  siteScene("reward", "Reward", "Reward"),
  siteScene("tempting", "Offer", "TemptingOffer"),
  siteScene("tempting-enhanced", "Offer (Enhanced)", "TemptingOffer", true),
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
  QUEST_COMPLETE_SCENE,
  QUEST_FAILED_SCENE,
];

/** Returns the QA scene for `id`, or null when `id` is not registered. */
export function findQaScene(id: string): QaScene | null {
  const normalized = id.trim().toLowerCase();
  return QA_SCENES.find((scene) => scene.id === normalized) ?? null;
}

/**
 * Builds the parked quest state for `id`, or null when the id is unknown or the
 * scene cannot be built from the current quest content.
 */
export function buildQaScene(
  id: string,
  questContent: QuestContent,
): QuestState | null {
  return findQaScene(id)?.build(questContent) ?? null;
}
