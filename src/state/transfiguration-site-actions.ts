import { useCallback, useEffect } from "react";
import { transfigurationForm } from "../data/transfiguration-data";
import { logEvent, logEventOnce } from "../logging";
import { transfigurationMechanic } from "../transfiguration/transfiguration-logic";
import { useJourney } from "./journey-context";
import type {
  CardChoiceSiteRuntime,
  SiteState,
  TransfigurationType,
} from "../types/journey";

type Runtime = Extract<
  CardChoiceSiteRuntime,
  { choiceKind: "transfiguration" }
>;

export function useTransfigurationSiteActions(input: {
  site: SiteState | null;
  runtime: Runtime | null;
  needsRuntime: boolean;
}): {
  close: () => void;
  transfigure: (
    entryId: string,
    type: TransfigurationType,
    effectDescription: string,
    effectDetails: Record<string, unknown>,
    essenceCost: number,
  ) => void;
} {
  const { site, runtime, needsRuntime } = input;
  const { state, mutations, journeyContent } = useJourney();
  const { transfigurationData } = journeyContent;

  useEffect(() => {
    if (site !== null && needsRuntime)
      mutations.ensureCardChoiceRuntime(site.id, "transfiguration");
  }, [mutations, needsRuntime, site]);

  useEffect(() => {
    if (site === null) return;
    logEventOnce(`transfiguration:${site.id}:site-entered`, "site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      deckSize: state.deck.length,
    });
  }, [site, state.deck.length]);

  useEffect(() => {
    if (site === null || runtime === null) return;
    logEventOnce(
      `transfiguration:${site.id}:offers:${runtime.entryIds.join(",")}`,
      "transfiguration_offers_prepared",
      {
        siteId: site.id,
        transfigurationFoldHash: transfigurationData.foldHash,
        offers: runtime.transfigurationOffers.map((offer) => {
          const form = transfigurationForm(transfigurationData, offer.type);
          const mechanic = transfigurationMechanic(offer.type);
          return {
            entryId: offer.entryId,
            formId: offer.type,
            predicate: mechanic.eligibility,
            predicateSatisfied: true,
            operation: mechanic.operation,
            pricing: form.pricing,
            essenceCost: offer.essenceCost,
            result: offer.effectDetails,
          };
        }),
      },
    );
  }, [runtime, site, transfigurationData]);

  const close = useCallback(() => {
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

  const transfigure = useCallback(
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
      const form = transfigurationForm(transfigurationData, type);
      logEvent("transfiguration_completed", {
        siteId: site.id,
        entryId,
        cardId: journeyContent.cardDatabase.get(entry.cardNumber)?.id ?? null,
        transfigurationType: type,
        transfigurationFoldHash: transfigurationData.foldHash,
        predicate: transfigurationMechanic(type).eligibility,
        predicateSatisfied: true,
        operation: transfigurationMechanic(type).operation,
        pricing: form.pricing,
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
        site.id,
        entryId,
        type,
        effectDescription,
        effectDetails,
      );
    },
    [
      journeyContent.cardDatabase,
      mutations,
      runtime,
      site,
      state,
      transfigurationData,
    ],
  );

  return { close, transfigure };
}
