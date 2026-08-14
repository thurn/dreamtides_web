/* eslint-disable max-lines -- this adapter keeps the full screen wiring together. */
// Adapter for the Cumulus Purge site. Wiring only: acquire live journey state,
// build the view-model, log the visit, and commit the selected deck entries.

import { useCallback, useEffect, useMemo } from "react";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import { PurgeSiteScreen } from "../../cumulus/screens/PurgeSiteScreen";
import { buildPurgeSiteView, resolvePurgeGuide } from "./purge-view-model";
import type { FirstVisitSiteTutorialView } from "../../cumulus/screens/site-tutorial-view";
import { useGuideDialogue } from "./guide-dialogue-view-model";
import type { SiteId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";

export function PurgeSiteScreenAdapter({ siteId }: { siteId: SiteId }) {
  const { state, mutations, journeyContent } = useJourney();
  const { cardDatabase, guides } = journeyContent;
  const tutorialPurge = journeyContent.tutorial?.purge;
  const node =
    state.currentDreamscape !== null
      ? (state.atlas.nodes[state.currentDreamscape] ?? null)
      : null;
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;
  const guide = resolvePurgeGuide(
    guides,
    site?.randomSite?.presentingGuideId,
  );
  const guideLine = useGuideDialogue(guide, "site");

  const view = useMemo(
    () =>
      site === null
        ? null
        : buildPurgeSiteView({
            state,
            sceneNode: node,
            site,
            cardDatabase,
            guide,
            guideLine,
            tutorialConfiguration: tutorialPurge,
            economyData: journeyContent.economyData,
            transfigurationData: journeyContent.transfigurationData,
            sitesData: journeyContent.sitesData,
          }),
    [
      state,
      node,
      site,
      cardDatabase,
      tutorialPurge,
      guide,
      guideLine,
      journeyContent.economyData,
      journeyContent.transfigurationData,
      journeyContent.sitesData,
    ],
  );

  const handleTutorialShown = useCallback(
    (tutorial: FirstVisitSiteTutorialView) => {
      logEventOnce(
        `first-visit-site-tutorial:${tutorial.id}`,
        "first_visit_site_tutorial_presented",
        {
          tutorialId: tutorial.id,
          siteId,
          siteType: "Purge",
          text: tutorial.model.text,
          delaySeconds: tutorial.delaySeconds ?? 0,
          horizontalOffset: tutorial.horizontalOffset,
          verticalOffset: tutorial.verticalOffset,
          bubbleWidth: tutorial.bubbleWidth,
        },
      );
    },
    [siteId],
  );

  useEffect(() => {
    if (site === null) return;
    logEventOnce(`purge:${site.id}:site-entered`, "site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      deckSize: state.deck.length,
    });
  }, [site?.id, site?.type, site?.isEnhanced, state.deck.length]);

  useEffect(() => {
    if (guide === null || site === null) return;
    logEventOnce(
      `purge:${site.id}:guide:${guide.id}`,
      "dream_guide_presented",
      {
        guideId: guide.id,
        siteType: site.type,
        isEnhanced: site.isEnhanced,
      },
    );
  }, [guide?.id, site?.id, site?.type, site?.isEnhanced]);

  const handleClose = useCallback(() => {
    if (site === null) return;
    logEvent("site_completed", {
      siteType: "Purge",
      outcome: "skipped",
    });
    mutations.completeSite(site.id, "purge_skipped");
  }, [mutations, site]);

  const handlePurge = useCallback(
    (entryIds: readonly DeckEntryId[], cost: number) => {
      if (site === null || entryIds.length === 0) return;
      const entryIdSet = new Set(entryIds);
      const purgedEntries = state.deck.filter((entry) =>
        entryIdSet.has(entry.entryId),
      );
      const purgedCardIds = purgedEntries
        .map((entry) => cardDatabase.get(entry.cardNumber)?.id)
        .filter((id): id is NonNullable<typeof id> => id !== undefined);

      logEvent("purge_completed", {
        purgedCardIds,
        purgedEntryIds: entryIds,
        count: purgedCardIds.length,
        totalCost: cost,
        nightmareCardsRemoved: purgedEntries.filter((entry) => entry.isBane)
          .length,
        isEnhanced: site.isEnhanced,
        essenceBefore: state.essence,
        essenceAfter: Math.max(0, state.essence - cost),
        completionLevel: state.completionLevel,
        currentDreamscape: state.currentDreamscape,
      });

      mutations.purgeDeckCards(site.id, entryIds, "purge");
    },
    [mutations, cardDatabase, site, state],
  );

  if (site === null || view === null) return null;
  return (
    <PurgeSiteScreen
      view={view}
      onClose={handleClose}
      onPurge={handlePurge}
      onTutorialShown={handleTutorialShown}
    />
  );
}
