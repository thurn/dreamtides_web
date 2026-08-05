// Wiring-only adapter for the standard desktop Cumulus Transfiguration site.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import type { TransfigurationType } from "../../types/journey";
import { TransfigurationSiteScreen } from "../../cumulus/screens/TransfigurationSiteScreen";
import {
  buildTransfigurationSiteView,
  resolveTransfigurationGuide,
} from "./transfiguration-view-model";

export function TransfigurationSiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, mutations, journeyContent } = useJourney();
  const node =
    state.currentDreamscape === null
      ? null
      : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;
  const persistedRuntime = state.siteRuntime[siteId];
  const runtime =
    persistedRuntime?.kind === "cardChoice" &&
    persistedRuntime.choiceKind === "transfiguration"
      ? persistedRuntime
      : null;
  const guide = resolveTransfigurationGuide(journeyContent.guides, site?.guideIdOverride);
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
        : buildTransfigurationSiteView({
            state,
            sceneNode: node,
            site,
            runtime,
            cardDatabase: journeyContent.cardDatabase,
            guide,
            guideLine: guideLineRef.current ?? null,
          }),
    [state, node, site, runtime, journeyContent.cardDatabase, guide],
  );

  useEffect(() => {
    if (site !== null && persistedRuntime === undefined) {
      mutations.ensureCardChoiceRuntime(site.id, "transfiguration");
    }
  }, [mutations, persistedRuntime, site]);

  useEffect(() => {
    if (site === null) return;
    logEventOnce(`transfiguration:${site.id}:site-entered`, "site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      deckSize: state.deck.length,
    });
  }, [site, state.deck.length]);

  const handleClose = useCallback(() => {
    if (site === null) return;
    logEvent("site_completed", {
      siteType: "Transfiguration",
      outcome:
        runtime === null || runtime.entryIds.length === 0
          ? "no_candidates"
          : "skipped",
    });
    mutations.completeSite(site.id, "transfiguration_skipped");
  }, [mutations, runtime, site]);

  const handleTransfigure = useCallback(
    (
      entryId: string,
      type: TransfigurationType,
      effectDescription: string,
      effectDetails: Record<string, unknown>,
      essenceCost: number,
    ) => {
      if (site === null || runtime === null) return;
      const entry = state.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
      if (entry === undefined) return;
      logEvent("transfiguration_completed", {
        siteId: site.id,
        entryId,
        cardId: journeyContent.cardDatabase.get(entry.cardNumber)?.id ?? null,
        transfigurationType: type,
        effectDescription,
        effectDetails,
        essenceCost,
        essenceBefore: state.essence,
        essenceAfter: Math.max(0, state.essence - essenceCost),
        offeredForms: runtime.transfigurationOffers
          .filter((offer) => offer.entryId === entryId)
          .map((offer) => offer.type),
        isEnhanced: site.isEnhanced,
        currentDreamscape: state.currentDreamscape,
        completionLevel: state.completionLevel,
      });
      mutations.acceptTransfigurationChoice(
        site.id, entryId, type, effectDescription, effectDetails,
      );
    },
    [mutations, journeyContent.cardDatabase, runtime, site, state],
  );

  if (site === null || view === null) return null;
  return (
    <TransfigurationSiteScreen
      view={view}
      onClose={handleClose}
      onTransfigure={handleTransfigure}
    />
  );
}
