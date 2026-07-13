// Debug atlas regeneration, shared by the app-shell quest menu so the atlas can
// be rebuilt with the current generation logic without starting a new quest.
// Extracted from the atlas screen so any chrome that hosts the "Regenerate
// Atlas" action (the Cumulus dreamscape/atlas hamburger menu) can trigger it
// without owning the generation + logging orchestration.

import { logEvent } from "../logging";
import type { QuestContent } from "../data/quest-content";
import type { DreamAtlas, QuestState } from "../types/quest";
import {
  regenerateAtlasForProgress,
  type SiteGenerationContext,
} from "./atlas-generator";

/** The state slices and mutation hooks the regeneration needs. */
export interface RegenerateAtlasParams {
  state: QuestState;
  questContent: QuestContent;
  updateAtlas: (atlas: DreamAtlas) => void;
  setCurrentDreamscape: (nodeId: string | null) => void;
}

/**
 * Discards the persisted atlas and rebuilds one with the current generation
 * logic, replaying the live progression up to the player's present progress
 * depth so atlas generation can be iterated live. Starting from a fresh
 * Completion Level 0 atlas, one expansion is applied per completed dreamscape
 * (`state.completionLevel` total), reproducing the player's current layer
 * experience. Every node id is reissued; the player is placed back at the
 * regenerated frontier (`currentDreamscape` cleared once any dreamscape has been
 * completed, matching the post-victory atlas state).
 */
export function regenerateAtlasInPlace({
  state,
  questContent,
  updateAtlas,
  setCurrentDreamscape,
}: RegenerateAtlasParams): void {
  const context: SiteGenerationContext = {
    ...(state.dreamscapeModifiers.length > 0
      ? { dreamscapeModifiers: state.dreamscapeModifiers }
      : {}),
  };
  const regenerated = regenerateAtlasForProgress(
    state.completionLevel,
    context,
    {
      dreamscapes: questContent.dreamscapes,
      atlasConfig: questContent.atlasConfig,
      dreamsignPoolIds: state.remainingDreamsignPool,
      apollyonIncarnations: questContent.apollyonIncarnations,
    },
    { logEvents: true },
  );
  const completedCount = Object.values(regenerated.nodes).filter(
    (node) => node.state === "completed",
  ).length;
  logEvent("debug_atlas_regenerated", {
    source: "atlas_menu_refresh",
    completionLevel: state.completionLevel,
    replayedCompletions: completedCount,
    dreamscapeModifierCount: state.dreamscapeModifiers.length,
    regeneratedNodeCount: Object.keys(regenerated.nodes).length,
    startingNodeId: regenerated.startingNodeId,
    bossNodeId: regenerated.bossNodeId,
    bossIncarnationId: regenerated.bossIncarnationId ?? null,
  });
  updateAtlas(regenerated);
  // After completing a dreamscape the player stands at the atlas frontier with
  // no dreamscape entered; a zero-depth replay leaves them at the freshly
  // generated starter, as a new quest does.
  setCurrentDreamscape(
    state.completionLevel > 0 ? null : regenerated.startingNodeId,
  );
}
