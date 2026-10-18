// Developer QA scenes for Dreamtides 97 (`?goto=<id>`), loaded only by
// development builds through src/runtime/qa-scene-entry.ts. A D97 scene
// creates a D97 game; a scene that starts a run records the real
// `D97_START_RUN` intent with the roster's first Avatar, so the parked game
// is an ordinary saved run. The run-starting scenes request the development
// dream through the intent's `dreamId`, so the run records it and plays its
// fixture residents on every reload; Avatar select leads to the catalog
// dream. Each catalog dream also has a scene, `?goto=d97-dream-<dream-uuid>`,
// whose run starts in that dream, for browser QA of any dream in the catalog.

import { D97_DREAMS } from "../content/d97/dreams";
import { parseQaSceneId, type D97DreamId, type QaSceneId } from "../types/identifiers";

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
  /** Start the run in the development dream instead of the first catalog dream. */
  readonly startsInDevelopmentDream: boolean;
  /** Start the run in this catalog dream instead of the first. */
  readonly catalogDreamId?: D97DreamId;
}

const D97_QA_SCENES: readonly D97QaScene[] = [
  {
    id: parseQaSceneId("d97"),
    label: "D97 Avatar Select",
    description: "A new Dreamtides 97 game on Avatar select.",
    startsRun: false,
    opensDeckEditor: false,
    startsInDevelopmentDream: false,
  },
  {
    id: parseQaSceneId("d97-overworld"),
    label: "D97 Overworld",
    description:
      "A new Dreamtides 97 run started with the roster's first Avatar, on " +
      "the development dream's overworld.",
    startsRun: true,
    opensDeckEditor: false,
    startsInDevelopmentDream: true,
  },
  {
    id: parseQaSceneId("d97-deck"),
    label: "D97 Deck Editor",
    description:
      "A new Dreamtides 97 run started with the roster's first Avatar, with " +
      "the deck editor open over the overworld.",
    startsRun: true,
    opensDeckEditor: true,
    startsInDevelopmentDream: true,
  },
  ...D97_DREAMS.map(
    (dream): D97QaScene => ({
      id: parseQaSceneId(`d97-dream-${dream.id}`),
      label: `D97 Dream ${dream.id}`,
      description: "A new Dreamtides 97 run started with the roster's first Avatar, at this catalog dream's town door.",
      startsRun: true,
      opensDeckEditor: false,
      startsInDevelopmentDream: false,
      catalogDreamId: dream.id,
    }),
  ),
];

/** The D97 QA scene `id` names, or null. */
export function findD97QaScene(id: QaSceneId): D97QaScene | null {
  const normalized = id.trim().toLowerCase();
  return D97_QA_SCENES.find((scene) => scene.id === normalized) ?? null;
}
