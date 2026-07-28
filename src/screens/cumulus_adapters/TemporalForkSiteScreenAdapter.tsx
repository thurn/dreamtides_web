// Wiring-only adapter for the Temporal Fork prototype encounter.

import { useCallback, useEffect, useMemo } from "react";
import { TemporalForkSiteScreen } from "../../cumulus/screens/TemporalForkSiteScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import {
  buildTemporalForkSiteView,
  resolveTemporalForkGuide,
  resolveTemporalForkCardPool,
  selectTemporalForkCard,
} from "./temporal-fork-view-model";

export function TemporalForkSiteScreenAdapter({
  siteId,
}: {
  siteId: string;
}) {
  const { state, mutations, journeyContent } = useJourney();
  const node =
    state.currentDreamscape === null
      ? null
      : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const candidate = node?.sites.find((site) => site.id === siteId) ?? null;
  const site =
    candidate?.type === "TemporalFork"
      ? { ...candidate, type: candidate.type }
      : null;
  const guide = resolveTemporalForkGuide(journeyContent.guides);
  const card = useMemo(
    () =>
      site === null
        ? null
        : selectTemporalForkCard({
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
        : buildTemporalForkSiteView({
            sceneNode: node,
            site,
            guide,
            card,
          }),
    [card, guide, node, site],
  );

  useEffect(() => {
    if (site === null || card === null) return;
    logEventOnce(
      `temporal-fork:${site.id}:site-entered`,
      "site_entered",
      {
        siteType: site.type,
        isEnhanced: site.isEnhanced,
        presentedCardId: card.id,
        prototypePoolSize: resolveTemporalForkCardPool(
          journeyContent.cardDatabase,
        ).length,
      },
    );
    if (guide !== null) {
      logEventOnce(
        `temporal-fork:${site.id}:guide:${guide.id}`,
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
    logEvent("temporal_fork_channeled", {
      siteId: site.id,
      cardId: card.id,
      isEnhanced: site.isEnhanced,
    });
    mutations.completeSite(site.id, "temporal_fork_channel");
  }, [card, mutations, site]);

  if (site === null || view === null) return null;
  return <TemporalForkSiteScreen view={view} onChannel={handleChannel} />;
}
