/**
 * The entry to the developer QA scenes (`qa-scenes.ts`) for the app (P7). A
 * development build loads the scene registry here, before any importer
 * runs; a production build compiles the import out, so its bundle holds no
 * scene, lab, or fixture code, every lookup finds nothing, and `?goto=` is
 * ignored (`parseRuntimeConfig`). Nothing `qa-scenes.ts` imports may import
 * this module back: a cycle through a top-level await never settles.
 */
import type * as Scenes from "./qa-scenes";
import type { QaScene } from "./qa-scenes";
import type { QaSceneId } from "../types/identifiers";

const scenes: typeof Scenes | null = import.meta.env.DEV ? await import("./qa-scenes") : null;

/** The registered QA scene `id` names, or `null` (always `null` in a production build). */
export function findQaScene(id: QaSceneId): QaScene | null {
  return scenes?.findQaScene(id) ?? null;
}

/** The parked journey state of scene `id` (`qa-scenes.ts` `buildQaScene`). */
export function buildQaScene(...args: Parameters<typeof Scenes.buildQaScene>): ReturnType<typeof Scenes.buildQaScene> {
  return scenes?.buildQaScene(...args) ?? null;
}

/** The battle `LOAD_STATE` loads with scene `id` (`qa-scenes.ts` `buildQaSceneBattle`). */
export function buildQaSceneBattle(
  ...args: Parameters<typeof Scenes.buildQaSceneBattle>
): ReturnType<typeof Scenes.buildQaSceneBattle> {
  return scenes?.buildQaSceneBattle(...args) ?? null;
}
