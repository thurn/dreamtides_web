/**
 * The entry to the developer QA scenes (`qa-scenes.ts`) and the Dreamtides 97
 * development fixtures (`src/d97/development-content.ts`) for the app (P7). A
 * development build loads them here, before any importer runs; a production
 * build compiles the imports out, so its bundle holds no scene, lab, or
 * fixture code, every lookup finds nothing, and `?goto=` is ignored
 * (`parseRuntimeConfig`). Nothing these modules import may import this module
 * back: a cycle through a top-level await never settles.
 */
import type * as Scenes from "./qa-scenes";
import type { QaScene } from "./qa-scenes";
import type * as D97Scenes from "../d97/qa-scenes";
import type { D97QaScene } from "../d97/qa-scenes";
import type * as D97Development from "../d97/development-content";
import type { D97DevelopmentContent } from "../d97/development-content";
import type { QaSceneId } from "../types/identifiers";

const scenes: typeof Scenes | null = import.meta.env.DEV ? await import("./qa-scenes") : null;
const d97Scenes: typeof D97Scenes | null = import.meta.env.DEV ? await import("../d97/qa-scenes") : null;
const d97Development: typeof D97Development | null = import.meta.env.DEV ? await import("../d97/development-content") : null;

/** The Dreamtides 97 QA scene `id` names, or `null` (always in production). */
export function findD97QaScene(id: QaSceneId): D97QaScene | null {
  return d97Scenes?.findD97QaScene(id) ?? null;
}

/** The Dreamtides 97 development fixtures, or `null` (always in production). */
export function d97DevelopmentContent(): D97DevelopmentContent | null {
  return d97Development?.D97_DEVELOPMENT_CONTENT ?? null;
}

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
