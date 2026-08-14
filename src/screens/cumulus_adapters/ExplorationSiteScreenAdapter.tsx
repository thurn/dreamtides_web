import { useCallback, useEffect, useMemo } from "react";
import { ExplorationSiteScreen } from "../../cumulus/screens/ExplorationSiteScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import { selectCurrentSite } from "../../state/journey-selectors";
import { buildExplorationSiteView, resolveExplorationGuide } from "./exploration-view-model";
import {
  buildExplorationActionLog,
  buildExplorationCompletionLog,
  buildExplorationEntryLog,
  buildExplorationResolutionLog,
} from "./exploration-logging-view-model";
import { useGuideDialogue } from "./guide-dialogue-view-model";

export function ExplorationSiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, journeyContent, mutations } = useJourney();
  const current = selectCurrentSite(state, siteId, "Exploration");
  const node = current?.node ?? null;
  const site = current?.site ?? null;
  const guide = resolveExplorationGuide(
    journeyContent.guides,
    site?.randomSite?.presentingGuideId,
  );
  const guideLine = useGuideDialogue(guide, "site");
  const runtime = state.siteRuntime[siteId];
  const explorationRuntime = runtime?.kind === "exploration" ? runtime : null;

  useEffect(() => {
    if (site !== null && runtime === undefined) {
      mutations.ensureExplorationSiteRuntime(site.id);
    }
  }, [mutations, runtime, site]);

  const view = useMemo(
    () =>
      site === null || explorationRuntime === null
        ? null
        : buildExplorationSiteView({
            sceneNode: node,
            site,
            guide,
            guideLine,
            runtime: explorationRuntime,
            state,
            content: journeyContent,
          }),
    [explorationRuntime, guide, journeyContent, node, site, state],
  );

  useEffect(() => {
    if (site === null || explorationRuntime === null || view === null) return;
    logEventOnce(`exploration:${site.id}:site-entered`, "site_entered", {
      siteId: site.id,
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      ...buildExplorationEntryLog(view, explorationRuntime),
    });
    logEventOnce(`exploration:${site.id}:guide:${guide.id}`, "dream_guide_presented", {
      guideId: guide.id,
      siteType: site.type,
      isEnhanced: site.isEnhanced,
    });
  }, [explorationRuntime, guide, site, view]);

  useEffect(() => {
    const resolution = explorationRuntime?.resolution;
    if (site === null || explorationRuntime === null || resolution == null || view === null) return;
    const log = buildExplorationResolutionLog(view, explorationRuntime);
    if (log === null) return;
    logEventOnce(`exploration:${site.id}:resolved:${resolution.actionId}`, "exploration_choice_resolved", {
      siteId: site.id,
      ...log,
    });
  }, [explorationRuntime, site, view]);

  const handleChannel = useCallback(() => {
    if (site === null || explorationRuntime === null || view === null) return;
    logEvent("exploration_frame_break_started", {
      siteId: site.id,
      cardId: explorationRuntime.encounterCardId,
      highResolutionImageNumber: view.fullArt.kind === "exploration-card" ? view.fullArt.imageNumber : null,
      isEnhanced: site.isEnhanced,
    });
  }, [explorationRuntime, site, view]);

  const handleResolve = useCallback(
    (actionId: string, selection?: unknown) => {
      if (site === null || explorationRuntime === null || view === null) return;
      logEvent("exploration_choice_requested", {
        siteId: site.id,
        ...buildExplorationActionLog(
          view,
          explorationRuntime,
          actionId,
          selection,
        ),
      });
      mutations.resolveExplorationChoice(site.id, actionId, selection);
    },
    [explorationRuntime, mutations, site, view],
  );

  const handleExit = useCallback(() => {
    if (site === null || explorationRuntime?.resolution == null || view === null) return;
    const completionLog = buildExplorationCompletionLog(view, explorationRuntime);
    if (completionLog === null) return;
    logEvent("exploration_completed", {
      siteId: site.id,
      ...completionLog,
      isEnhanced: site.isEnhanced,
    });
    mutations.completeSite(site.id, "exploration_completed");
  }, [explorationRuntime, mutations, site, view]);

  if (site === null || view === null) return null;
  return <ExplorationSiteScreen view={view} onChannel={handleChannel} onResolve={handleResolve} onExit={handleExit} />;
}
