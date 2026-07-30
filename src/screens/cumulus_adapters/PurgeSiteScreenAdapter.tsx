// Adapter for the Cumulus Purge site. Wiring only: acquire live journey state,
// build the view-model, log the visit, and commit the selected deck entries.

import { useCallback, useEffect, useMemo } from "react";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import { PurgeSiteScreen } from "../../cumulus/screens/PurgeSiteScreen";
import { buildPurgeSiteView, resolvePurgeGuide } from "./purge-view-model";

export function PurgeSiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, mutations, journeyContent } = useJourney();
  const node =
    state.currentDreamscape !== null
      ? (state.atlas.nodes[state.currentDreamscape] ?? null)
      : null;
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;
  const guide = resolvePurgeGuide(journeyContent.guides);
  const guideLine = useMemo(() => {
    if (guide === null || guide.dialog.length === 0) return null;
    return guide.dialog[Math.floor(Math.random() * guide.dialog.length)];
  }, [guide]);

  const view = useMemo(
    () =>
      site === null
        ? null
        : buildPurgeSiteView({
            state,
            sceneNode: node,
            site,
            cardDatabase: journeyContent.cardDatabase,
            guide,
            guideLine,
          }),
    [state, node, site, journeyContent.cardDatabase, guide, guideLine],
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
    (entryIds: readonly string[], cost: number) => {
      if (site === null || entryIds.length === 0) return;
      const entryIdSet = new Set(entryIds);
      const purgedEntries = state.deck.filter((entry) =>
        entryIdSet.has(entry.entryId),
      );
      const purgedCardIds = purgedEntries
        .map((entry) => journeyContent.cardDatabase.get(entry.cardNumber)?.id)
        .filter((id): id is NonNullable<typeof id> => id !== undefined);

      logEvent("purge_completed", {
        purgedCardIds,
        purgedEntryIds: entryIds,
        count: purgedCardIds.length,
        totalCost: cost,
        baneCardsRemoved: purgedEntries.filter((entry) => entry.isBane).length,
        isEnhanced: site.isEnhanced,
        essenceBefore: state.essence,
        essenceAfter: Math.max(0, state.essence - cost),
        completionLevel: state.completionLevel,
        currentDreamscape: state.currentDreamscape,
      });

      mutations.purgeDeckCards(site.id, entryIds, "purge");
    },
    [mutations, journeyContent.cardDatabase, site, state],
  );

  if (site === null || view === null) return null;
  return (
    <PurgeSiteScreen view={view} onClose={handleClose} onPurge={handlePurge} />
  );
}
