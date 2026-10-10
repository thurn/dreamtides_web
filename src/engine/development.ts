/**
 * The engine's development-only tooling (P7): the lab's synthetic
 * definitions, which the prompt-lab and card-lab QA scenes play, and the
 * engine debug actions (D4). A development build loads them here, before
 * any module that imports this one runs; a production build compiles the
 * import out, so its bundle holds neither (the `devOnlyModules` build check
 * in `vite.config.ts`). Plain Node (tsx scripts) has no `import.meta.env`
 * and loads neither.
 *
 * Nothing the loaded modules import may import this module back: a cycle
 * through a top-level await never settles.
 */
import type { EmblemDefinitions, EngineCardDefinition, EngineFigmentDefinition } from "./catalog";
import type * as DebugActions from "./debug/debug-actions";

/** Synthetic definitions a development build adds to every battle catalog. */
export interface LabDefinitions {
  readonly cards: readonly EngineCardDefinition[];
  readonly emblems: EmblemDefinitions;
  readonly figments: readonly EngineFigmentDefinition[];
}

const NO_DEFINITIONS: LabDefinitions = { cards: [], emblems: {}, figments: [] };

const tools =
  import.meta.env?.DEV === true
    ? {
        lab: (await import("./testing/prompt-lab")).PROMPT_LAB_DEFINITIONS,
        debug: await import("./debug/debug-actions"),
      }
    : null;

/**
 * The lab definitions in a development build, and none in a production
 * build, whose catalogs hold content only. Every fold of one build sees the
 * same answer, as provider registration requires.
 */
export function developmentLabDefinitions(): LabDefinitions {
  return tools?.lab ?? NO_DEFINITIONS;
}

/** The engine debug actions in a development build; `null` in a production build. */
export function engineDebugActions(): typeof DebugActions | null {
  return tools?.debug ?? null;
}
