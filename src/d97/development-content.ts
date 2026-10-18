// The development fixtures of Dreamtides 97: the development dream, its
// synthetic map, its fixture dialogue and the development character
// recipes. A development build loads this module through
// src/runtime/qa-scene-entry.ts and registers the dream with the D97 content
// provider beside the catalog; a production build compiles the import out,
// so its bundle holds none of it (`DEV_ONLY_MODULES` in vite.config.ts).

import type { CharacterSprite } from "../content/d97/characters/schema";
import { DEV_KNIGHT, DEV_VILLAGER } from "../content/d97/characters/development";
import type { D97DialogueContent } from "../content/d97/dialogue/schema";
import { DEVELOPMENT_DREAM } from "../content/d97/dreams/development";
import type { D97DreamDefinition } from "../content/d97/dreams/schema";
import type { CompiledDreamMap } from "./map/compiled";
import type { DreamMapDefinition } from "./map/definition";
import { DEV_DIALOGUE_CONTENT } from "./overworld/dev-dialogue";
import { compileDevMap, DEV_MAP_DEFINITION } from "./overworld/dev-map";

/** What a development build registers beside the dream catalog. */
export interface D97DevelopmentContent {
  readonly dream: D97DreamDefinition;
  /** The dream's map definition, whose anchors saves reconcile against. */
  readonly map: DreamMapDefinition;
  /** The dream's compiled map, built in code rather than fetched. */
  readonly compileMap: () => CompiledDreamMap;
  readonly dialogue: D97DialogueContent;
  readonly characterSprites: readonly CharacterSprite[];
}

export const D97_DEVELOPMENT_CONTENT: D97DevelopmentContent = {
  dream: DEVELOPMENT_DREAM,
  map: DEV_MAP_DEFINITION,
  compileMap: compileDevMap,
  dialogue: DEV_DIALOGUE_CONTENT,
  characterSprites: [DEV_KNIGHT, DEV_VILLAGER],
};
