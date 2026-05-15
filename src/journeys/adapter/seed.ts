import { sha256 } from "js-sha256";

import type { QuestState, SiteState } from "../../types/quest";

/**
 * Derive the deterministic generation seed for a Dream Journey at the given
 * site.
 *
 * The seed is the first 16 hex digits of
 * `sha256(questState.seed + ":" + startingNodeId + ":" + siteId)`. The
 * `questState.seed` axis varies the seed across distinct quest runs (the
 * field is generated once at quest start via `startQuestFromDreamcaller`);
 * the `startingNodeId` axis further varies it across distinct runs that
 * happen to share a seed in tests, and the `siteId` axis varies it across
 * distinct sites within the same run. Calling this with the same inputs
 * always returns the same string, so the journey manifest is byte-identical
 * across page reloads of the same quest.
 */
export function journeySeedForSite(
  site: SiteState,
  questState: QuestState,
): string {
  return sha256(
    `${questState.seed}:${questState.atlas.startingNodeId}:${site.id}`,
  ).slice(0, 16);
}
