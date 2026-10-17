// Developer QA scenes for Dreamtides 97 (`?goto=<id>`), loaded only by
// development builds through src/runtime/qa-scene-entry.ts. A D97 scene
// creates a D97 game; a scene that starts a run records the real
// `D97_START_RUN` intent with the roster's first Avatar, so the parked game
// is an ordinary saved run. The run-starting scenes play the development
// dream and its fixture residents; Avatar select leads to the catalog dream.

import { parseQaSceneId, type QaSceneId } from "../types/identifiers";

export interface D97QaScene {
  /** URL token, e.g. `?goto=d97-overworld`. Lowercase, stable. */
  readonly id: QaSceneId;
  /** Short human label for logs and tooling. */
  readonly label: string;
  /** What the scene shows. */
  readonly description: string;
  /** Start the run before the first render instead of showing Avatar select. */
  readonly startsRun: boolean;
  /** Open the overworld's deck editor on the first render. */
  readonly opensDeckEditor: boolean;
  /** Play the development dream instead of the run's catalog dream. */
  readonly playsDevelopmentDream: boolean;
}

const D97_QA_SCENES: readonly D97QaScene[] = [
  {
    id: parseQaSceneId("d97"),
    label: "D97 Avatar Select",
    description: "A new Dreamtides 97 game on Avatar select.",
    startsRun: false,
    opensDeckEditor: false,
    playsDevelopmentDream: false,
  },
  {
    id: parseQaSceneId("d97-overworld"),
    label: "D97 Overworld",
    description:
      "A new Dreamtides 97 run started with the roster's first Avatar, on " +
      "the development dream's overworld.",
    startsRun: true,
    opensDeckEditor: false,
    playsDevelopmentDream: true,
  },
  {
    id: parseQaSceneId("d97-deck"),
    label: "D97 Deck Editor",
    description:
      "A new Dreamtides 97 run started with the roster's first Avatar, with " +
      "the deck editor open over the overworld.",
    startsRun: true,
    opensDeckEditor: true,
    playsDevelopmentDream: true,
  },
];

/** The D97 QA scene `id` names, or null. */
export function findD97QaScene(id: QaSceneId): D97QaScene | null {
  const normalized = id.trim().toLowerCase();
  return D97_QA_SCENES.find((scene) => scene.id === normalized) ?? null;
}
