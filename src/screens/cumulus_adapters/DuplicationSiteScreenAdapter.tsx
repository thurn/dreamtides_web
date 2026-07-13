// Wiring-only adapter for the Cumulus Duplication site.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { DuplicationSiteScreen } from "../../cumulus/screens/DuplicationSiteScreen";
import { logEvent, logEventOnce } from "../../logging";
import { useQuest } from "../../state/quest-context";
import {
  buildDuplicationSiteView,
  resolveDuplicationGuide,
} from "./duplication-view-model";

export function DuplicationSiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, mutations, questContent } = useQuest();
  const node = state.currentDreamscape === null
    ? null
    : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;
  const persistedRuntime = state.siteRuntime[siteId];
  const runtime =
    persistedRuntime?.kind === "cardChoice" &&
    persistedRuntime.choiceKind === "duplication"
      ? persistedRuntime
      : null;
  const guide = resolveDuplicationGuide(questContent.guides);
  const guideLineRef = useRef<string | null | undefined>(undefined);
  if (guideLineRef.current === undefined) {
    guideLineRef.current =
      guide === null || guide.dialog.length === 0
        ? null
        : guide.dialog[Math.floor(Math.random() * guide.dialog.length)];
  }

  const view = useMemo(
    () =>
      site === null
        ? null
        : buildDuplicationSiteView({
            state,
            sceneNode: node,
            site,
            runtime,
            cardDatabase: questContent.cardDatabase,
            guide,
            guideLine: guideLineRef.current ?? null,
          }),
    [state, node, site, runtime, questContent.cardDatabase, guide],
  );

  useEffect(() => {
    if (site !== null && persistedRuntime === undefined) {
      mutations.ensureCardChoiceRuntime(site.id, "duplication");
    }
  }, [mutations, persistedRuntime, site]);

  useEffect(() => {
    if (site === null) return;
    logEventOnce(`duplication:${site.id}:site-entered`, "site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      deckSize: state.deck.length,
      candidateCount: runtime?.entryIds.length ?? 0,
      ui: "cumulus",
    });
    if (guide !== null) {
      logEventOnce(
        `duplication:${site.id}:guide:${guide.id}`,
        "dream_guide_presented",
        { guideId: guide.id, siteType: site.type, isEnhanced: site.isEnhanced, ui: "cumulus" },
      );
    }
  }, [guide, runtime, site, state.deck.length]);

  const handleClose = useCallback(() => {
    if (site === null) return;
    logEvent("site_completed", {
      siteType: "Duplication",
      outcome: runtime === null || runtime.entryIds.length === 0 ? "no_candidates" : "skipped",
      ui: "cumulus",
    });
    mutations.completeSite(site.id, "duplication_skipped");
  }, [mutations, runtime, site]);

  const handleDuplicate = useCallback((entryId: string) => {
    if (site === null || runtime === null || runtime.acceptedEntryIds.length > 0) return;
    const entry = state.deck.find((candidate) => candidate.entryId === entryId);
    if (entry === undefined || !runtime.entryIds.includes(entryId)) return;
    logEvent("duplication_completed", {
      siteId: site.id,
      entryId,
      cardId: questContent.cardDatabase.get(entry.cardNumber)?.id ?? null,
      copyCount: 1,
      isEnhanced: site.isEnhanced,
      deckSizeBefore: state.deck.length,
      deckSizeAfter: state.deck.length + 1,
      currentDreamscape: state.currentDreamscape,
      completionLevel: state.completionLevel,
      ui: "cumulus",
    });
    mutations.acceptDuplicationChoice(site.id, entryId);
  }, [mutations, questContent.cardDatabase, runtime, site, state]);

  if (site === null || view === null) return null;
  return <DuplicationSiteScreen view={view} onClose={handleClose} onDuplicate={handleDuplicate} />;
}
