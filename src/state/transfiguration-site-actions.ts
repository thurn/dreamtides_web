import { useCallback, useEffect } from "react";
import { transfigurationForm } from "../data/transfiguration-data";
import { logEventOnce } from "../logging";
import { transfigurationMechanic } from "../transfiguration/transfiguration-logic";
import { useJourney } from "./journey-context";
import type {
  CardChoiceSiteRuntime,
  SiteState,
  TransfigurationType,
} from "../types/journey";
import type { DeckEntryId } from "../types/identifiers";

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
    entryId: DeckEntryId,
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
    mutations.completeSite(site.id, "transfiguration_skipped");
  }, [mutations, runtime, site]);

  const transfigure = useCallback(
    (
      entryId: DeckEntryId,
      type: TransfigurationType,
      effectDescription: string,
      effectDetails: Record<string, unknown>,
      _essenceCost: number,
    ) => {
      if (site === null || runtime === null) return;
      const entry = state.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
      if (entry === undefined) return;
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
