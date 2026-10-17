// The D97 dream catalog: every authored dream module, in catalog order
// (decision P18). A dream module names its map (`../maps/`), declares its
// topology and its residents (`./schema.ts`); `npm run d97:dialogue --
// validate` checks both against its map's anchors and the character and
// dialogue catalogs. The development dream (`./development.ts`) is not in the
// catalog, but the rules know it: anchor UUIDs are unique across every dream
// module, so a rule finds a dream by any of its topology's anchors.

import dream3229d6c7 from "./3229d6c7-0700-4f37-9b07-921e3dccb8b6";
import { DEVELOPMENT_DREAM } from "./development";
import type { D97DreamDefinition } from "./schema";
import type { D97DreamId, DreamAnchorId } from "../../../types/identifiers";

export const D97_DREAMS: readonly D97DreamDefinition[] = [dream3229d6c7];

/** Every dream module the rules read: the catalog, then the development dream. */
export const D97_DREAM_MODULES: readonly D97DreamDefinition[] = [...D97_DREAMS, DEVELOPMENT_DREAM];

/** The dream a run starts in by default: the catalog's first, or the development dream for an empty catalog. */
export const D97_FIRST_DREAM: D97DreamDefinition = D97_DREAMS[0] ?? DEVELOPMENT_DREAM;

/** The dream module `dreamId` names, or null. */
export function d97DreamById(
  dreamId: D97DreamId,
  dreams: readonly D97DreamDefinition[] = D97_DREAM_MODULES,
): D97DreamDefinition | null {
  return dreams.find((dream) => dream.id === dreamId) ?? null;
}

/** The dream among `dreams` whose topology names `anchorId`, or null. */
export function d97DreamByAnchor(
  anchorId: DreamAnchorId,
  dreams: readonly D97DreamDefinition[] = D97_DREAM_MODULES,
): D97DreamDefinition | null {
  return dreams.find((dream) => Object.values(dream.topology).includes(anchorId)) ?? null;
}
