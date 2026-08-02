// Wiring-only adapter for the Exploration prototype encounter.

import { useCallback, useEffect, useMemo } from "react";
import { ExplorationSiteScreen } from "../../cumulus/screens/ExplorationSiteScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import {
  buildExplorationSiteView,
  resolveExplorationGuide,
  resolveExplorationCardPool,
  selectExplorationCard,
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
  const card = useMemo(
    () =>
      site === null
        ? null
        : selectExplorationCard({
            cardDatabase: journeyContent.cardDatabase,
            journeySeed: state.seed,
            siteId: site.id,
          }),
    [journeyContent.cardDatabase, site, state.seed],
  );
  const view = useMemo(
    () =>
      site === null || card === null
        ? null
        : buildExplorationSiteView({
            sceneNode: node,
            site,
            guide,
            card,
          }),
    [card, guide, node, site],
  );

  useEffect(() => {
    if (site === null || card === null) return;
    logEventOnce(`exploration:${site.id}:site-entered`, "site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      presentedCardId: card.id,
      prototypePoolSize: resolveExplorationCardPool(
        journeyContent.cardDatabase,
      ).length,
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
  }, [card, guide, journeyContent.cardDatabase, site]);

  const handleChannel = useCallback(() => {
    if (site === null || card === null) return;
    logEvent("exploration_frame_break_started", {
      siteId: site.id,
      cardId: card.id,
      highResolutionImageNumber: card.imageNumber,
      isEnhanced: site.isEnhanced,
    });
  }, [card, site]);

  const handleExit = useCallback(() => {
    if (site === null || card === null) return;
    logEvent("exploration_left", {
      siteId: site.id,
      cardId: card.id,
      highResolutionImageNumber: card.imageNumber,
      isEnhanced: site.isEnhanced,
    });
    mutations.completeSite(site.id, "exploration_left");
  }, [card, mutations, site]);

  if (site === null || view === null) return null;
  return (
    <ExplorationSiteScreen
      view={view}
      onChannel={handleChannel}
      onExit={handleExit}
    />
  );
}
