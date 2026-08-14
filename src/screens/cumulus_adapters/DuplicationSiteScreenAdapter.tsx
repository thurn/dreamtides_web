// Wiring-only adapter for the Cumulus Duplication site.

import { useCallback, useEffect } from "react";
import { DuplicationSiteScreen } from "../../cumulus/screens/DuplicationSiteScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import {
  buildDuplicationSiteView,
  buildDuplicationOfferLog,
  resolveDuplicationGuide,
} from "./duplication-view-model";
import { useGuideDialogue } from "./guide-dialogue-view-model";
import { useGuidePresentedLog } from "../../state/guide-logging";

export function DuplicationSiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, mutations, journeyContent } = useJourney();
  const node =
    state.currentDreamscape === null
      ? null
      : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;
  const persistedRuntime = state.siteRuntime[siteId];
  const runtime =
    persistedRuntime?.kind === "cardChoice" &&
    persistedRuntime.choiceKind === "duplication"
      ? persistedRuntime
      : null;
  const guide = resolveDuplicationGuide(
    journeyContent.guides,
    site?.randomSite?.presentingGuideId,
  );
  const guideLine = useGuideDialogue(guide, "site");
  useGuidePresentedLog({
    enabled: site !== null,
    key: `duplication:${siteId}:guide:${guide.id}`,
    guideId: guide.id,
    siteType: site?.type ?? "Duplication",
    isEnhanced: site?.isEnhanced ?? false,
  });

  const view =
    site === null
      ? null
      : buildDuplicationSiteView({
          state,
          sceneNode: node,
          site,
          runtime,
          cardDatabase: journeyContent.cardDatabase,
          guide,
          guideLine,
          transfigurationData: journeyContent.transfigurationData,
        });

  useEffect(() => {
    if (site !== null && persistedRuntime === undefined) {
      mutations.ensureCardChoiceRuntime(site.id, "duplication");
    }
  }, [mutations, persistedRuntime, site]);

  useEffect(() => {
    if (site === null || runtime === null) return;
    const offeredEntries = buildDuplicationOfferLog(
      state,
      runtime,
      journeyContent.cardDatabase,
    );
    logEventOnce(`duplication:${site.id}:site-entered`, "site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      deckSize: state.deck.length,
      candidateCount: runtime.entryIds.length,
      offeredEntries,
    });
  }, [journeyContent.cardDatabase, runtime, site, state]);

  const handleClose = () => {
    if (site === null) return;
    logEvent("site_completed", {
      siteType: "Duplication",
      outcome:
        runtime === null || runtime.entryIds.length === 0
          ? "no_candidates"
          : "skipped",
    });
    mutations.completeSite(site.id, "duplication_skipped");
  };

  const handleDuplicate = useCallback(
    (entryId: string) => {
      if (
        site === null ||
        runtime === null ||
        runtime.acceptedEntryIds.length > 0
      )
        return;
      const entry = state.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
      if (entry === undefined || !runtime.entryIds.includes(entryId)) return;
      logEvent("duplication_completed", {
        siteId: site.id,
        entryId,
        cardId: journeyContent.cardDatabase.get(entry.cardNumber)?.id ?? null,
        copyCount: 1,
        isEnhanced: site.isEnhanced,
        deckSizeBefore: state.deck.length,
        deckSizeAfter: state.deck.length + 1,
        currentDreamscape: state.currentDreamscape,
        completionLevel: state.completionLevel,
      });
      mutations.acceptDuplicationChoice(site.id, entryId);
    },
    [mutations, journeyContent.cardDatabase, runtime, site, state],
  );

  if (site === null || view === null) return null;
  return (
    <DuplicationSiteScreen
      view={view}
      onClose={handleClose}
      onDuplicate={handleDuplicate}
    />
  );
}
