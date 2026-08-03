import { useCallback, useEffect, useMemo } from "react";
import { ExplorationSiteScreen } from "../../cumulus/screens/ExplorationSiteScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import {
  buildExplorationSiteView,
  resolveExplorationGuide,
} from "./exploration-view-model";

export function ExplorationSiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, journeyContent, mutations } = useJourney();
  const node =
    state.currentDreamscape === null
      ? null
      : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const candidate = node?.sites.find((site) => site.id === siteId) ?? null;
  const site =
    candidate?.type === "Exploration"
      ? { ...candidate, type: candidate.type }
      : null;
  const guide = resolveExplorationGuide(journeyContent.guides);
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
            runtime: explorationRuntime,
            state,
            content: journeyContent,
          }),
    [explorationRuntime, guide, journeyContent, node, site, state],
  );

  useEffect(() => {
    if (site === null || explorationRuntime === null || view === null) return;
    logEventOnce(`exploration:${site.id}:site-entered`, "site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      presentedCardId: explorationRuntime.encounterCardId,
      actionIds: explorationRuntime.actionOffers.map((offer) => offer.actionId),
      offers: explorationRuntime.actionOffers.map((offer) => ({
        actionId: offer.actionId,
        offeredCardIds: offer.offeredCardIds,
        packCardIds: offer.packCardIds,
        replacementCardIdByEntryId: offer.replacementCardIdByEntryId,
        transfigurationByEntryId: offer.transfigurationByEntryId,
      })),
    });
    if (guide !== null) {
      logEventOnce(
        `exploration:${site.id}:guide:${guide.id}`,
        "dream_guide_presented",
        {
          guideId: guide.id,
          siteType: site.type,
          isEnhanced: site.isEnhanced,
        },
      );
    }
  }, [explorationRuntime, guide, site, view]);

  useEffect(() => {
    const resolution = explorationRuntime?.resolution;
    if (site === null || explorationRuntime === null || resolution == null) return;
    logEventOnce(
      `exploration:${site.id}:resolved:${resolution.actionId}`,
      "exploration_choice_resolved",
      {
        siteId: site.id,
        presentedCardId: explorationRuntime.encounterCardId,
        ...resolution,
      },
    );
  }, [explorationRuntime, site]);

  const handleChannel = useCallback(() => {
    if (site === null || explorationRuntime === null || view === null) return;
    logEvent("exploration_frame_break_started", {
      siteId: site.id,
      cardId: explorationRuntime.encounterCardId,
      highResolutionImageNumber:
        view.fullArt.kind === "exploration-card"
          ? view.fullArt.imageNumber
          : null,
      isEnhanced: site.isEnhanced,
    });
  }, [explorationRuntime, site, view]);

  const handleResolve = useCallback(
    (actionId: string, selection?: unknown) => {
      if (site === null || explorationRuntime === null) return;
      logEvent("exploration_choice_requested", {
        siteId: site.id,
        presentedCardId: explorationRuntime.encounterCardId,
        actionId,
        selection,
      });
      mutations.resolveExplorationChoice(site.id, actionId, selection);
    },
    [explorationRuntime, mutations, site],
  );

  const handleExit = useCallback(() => {
    if (site === null || explorationRuntime?.resolution == null) return;
    logEvent("exploration_completed", {
      siteId: site.id,
      presentedCardId: explorationRuntime.encounterCardId,
      actionId: explorationRuntime.resolution.actionId,
      isEnhanced: site.isEnhanced,
    });
    mutations.completeSite(site.id, "exploration_completed");
  }, [explorationRuntime, mutations, site]);

  if (site === null || view === null) return null;
  return <ExplorationSiteScreen view={view} onChannel={handleChannel} onResolve={handleResolve} onExit={handleExit} />;
}
