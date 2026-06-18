import type { QuestContent } from "../data/quest-content";
import type { QuestState } from "../types/quest";
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

/** All registered QA scenes, keyed by `id`. */
export const QA_SCENES: readonly QaScene[] = [ATLAS_SCENE];

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
