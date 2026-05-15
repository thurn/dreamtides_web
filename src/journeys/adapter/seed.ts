import { sha256 } from "js-sha256";

import type { QuestState, SiteState } from "../../types/quest";

/**
 * Derive the deterministic generation seed for a Dream Journey at the given
 * site.
 *
 * The seed is the first 16 hex digits of `sha256(startingNodeId + ":" + siteId)`.
 * The startingNodeId axis varies the seed across distinct quest runs; the
 * siteId axis varies it across distinct sites within the same run. Calling
 * this with the same inputs always returns the same string, so the journey
 * manifest is byte-identical across page reloads.
 */
export function journeySeedForSite(
  site: SiteState,
  questState: QuestState,
): string {
  return sha256(`${questState.atlas.startingNodeId}:${site.id}`).slice(0, 16);
}
