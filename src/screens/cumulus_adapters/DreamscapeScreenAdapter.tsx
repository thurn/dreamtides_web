// Adapter bridging live quest state to the pure Cumulus dreamscape screen
// (`src/cumulus/screens/DreamscapeScreen`). Adapters are wiring only: this one
// owns `useQuest()`, builds the view-model, wires site selection to navigation
// or in-place reward collection, and emits the reconstruction logging. All
// mapping from domain data to the screen's view types lives in the pure builder
// (`dreamscape-view-model.ts`); the Cumulus screen itself stays pure.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuest } from "../../state/quest-context";
import { logEvent } from "../../logging";
import { DreamscapeScreen } from "../../cumulus/screens/DreamscapeScreen";
import {
  buildDreamscapeView,
  dreamscapeLayoutSeed,
} from "./dreamscape-view-model";
import { buildInlineRewardCompletionLog } from "./inline-reward-view-model";

/**
 * Live dreamscape screen: resolves the current dreamscape node, builds its
 * view-model (seeded scatter + bottom-HUD data), handles site selection, and
 * logs the presented overview once per dreamscape for reconstruction.
 */
export function DreamscapeScreenAdapter() {
  const { state, mutations } = useQuest();
  const { currentDreamscape, completionLevel } = state;
  const node =
    currentDreamscape !== null ? state.atlas.nodes[currentDreamscape] : undefined;

  const view = useMemo(
    () => (node !== undefined ? buildDreamscapeView(node, state) : null),
    [node, state],
  );

  // Reconstruction log: which dreamscape was presented, its guardian-unlock
  // state, and the exact seeded layout of every node shown. Re-logs only when
  // the presented dreamscape changes, guarded against StrictMode double-fire.
  const loggedNodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (node === undefined || view === null) {
      return;
    }
    if (loggedNodeRef.current === node.id) {
      return;
    }
    loggedNodeRef.current = node.id;
    logEvent("dreamscape_overview_presented", {
      nodeId: node.id,
      dreamscapeId: node.dreamscapeId,
      biomeName: node.biomeName,
      completionLevel,
      layoutSeed: dreamscapeLayoutSeed(node),
      uiVariant: "cumulus",
      sites: view.sites.map((model) => ({
        siteId: model.site.id,
        type: model.site.type,
        isEnhanced: model.site.isEnhanced,
        isVisited: model.site.isVisited,
        isLocked: model.isLocked,
        pos: model.pos,
      })),
    });
  }, [node, view, completionLevel]);

  const handleSelectSite = useCallback(
    (siteId: string) => {
      if (node === undefined) {
        return;
      }
      const site = node.sites.find((candidate) => candidate.id === siteId);
      if (site === undefined) {
        return;
      }
      logEvent("site_entered", {
        siteType: site.type,
        dreamscapeId: node.id,
        siteId: site.id,
        isEnhanced: site.isEnhanced,
        essenceBefore: state.essence,
        ui: "cumulus",
      });
      if (site.type === "Essence") {
        mutations.ensureEssenceSiteRuntime(site.id, site.isEnhanced);
        return;
      }
      if (site.type === "Reward") {
        mutations.ensureRewardSiteRuntime(site.id);
        return;
      }
      mutations.setScreen({ type: "site", siteId });
    },
    [node, mutations, state.essence],
  );

  const handleInlineRewardAnimationComplete = useCallback(
    (siteId: string) => {
      if (node === undefined) return;
      const site = node.sites.find((candidate) => candidate.id === siteId);
      const runtime = state.siteRuntime[siteId];
      const completion = buildInlineRewardCompletionLog(site, runtime, state);
      if (completion === null) return;
      // An at-cap Dreamsign needs the replacement/decline choice from the
      // Reward site. Do not log or submit an inline collection here: the
      // reducer correctly rejects a cap-hit acceptance without `purgeIndex`.
      if (
        runtime?.kind === "reward" &&
        runtime.reward.rewardType === "dreamsign" &&
        state.dreamsigns.length >= state.maxDreamsigns
      ) {
        mutations.setScreen({ type: "site", siteId });
        return;
      }
      logEvent("site_completed", completion.fields);
      if (completion.kind === "essence") {
        mutations.acceptEssenceSite(siteId);
        return;
      }
      mutations.acceptRewardSite(siteId);
    },
    [
      node,
      mutations,
      state.essence,
      state.essenceCap,
      state.dreamsigns.length,
      state.maxDreamsigns,
      state.siteRuntime,
    ],
  );

  if (view === null) {
    return null;
  }

  return (
    <DreamscapeScreen
      view={view}
      onSelectSite={handleSelectSite}
      onInlineRewardAnimationComplete={
        handleInlineRewardAnimationComplete
      }
    />
  );
}
