import type { QuestContent } from "../data/quest-content";
import type { QuestState, SiteState, SiteType } from "../types/quest";
import { createQaQuestFoundation } from "./start-in-battle-state";

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
   * Builds the parked quest state from current quest content, or returns null
   * when required content is missing (mirrors `createStartInBattleState`).
   */
  build: (questContent: QuestContent) => QuestState | null;
}

/**
 * The Dream Atlas resting screen, generated with a real boss node and its
 * per-run Apollyon incarnation. Hovering the boss node shows the incarnation
 * preview card — the screen that is otherwise only reachable after completing
 * the starter dreamscape's full battle.
 */
const ATLAS_SCENE: QaScene = {
  id: "atlas",
  label: "Dream Atlas",
  description:
    "The between-dreamscapes atlas with a generated boss node and Apollyon " +
    "incarnation, parked on the atlas screen for boss-preview QA.",
  build: (questContent) => createQaQuestFoundation(questContent)?.state ?? null,
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
  ATLAS_SCENE,
  siteScene("transfiguration", "Transfiguration", "Transfiguration"),
  siteScene(
    "transfiguration-enhanced",
    "Transfiguration (Enhanced)",
    "Transfiguration",
    true,
  ),
  siteScene("duplication", "Duplication", "Duplication"),
  siteScene("purge", "Purge", "Purge"),
  siteScene("shop", "Shop", "Shop"),
  siteScene("dreamaugury", "Dream Augury", "DreamAugury"),
  siteScene("tempting", "Offer", "TemptingOffer"),
  siteScene(
    "dreamsign-revelation",
    "Dreamsign Revelation",
    "DreamsignRevelation",
  ),
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
