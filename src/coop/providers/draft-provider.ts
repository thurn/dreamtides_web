// Real DraftContentProvider: resolves `PICK_DRAFT_CARD` against the loaded
// content and supplies the deck-fit deps the draft engine needs to reveal the
// next offer. The engine draws from the reducer-supplied `ctx.rng` (threaded by
// `src/rules/journey/draft.ts`), so this adapter contributes only pure,
// deterministic lookups.

import type { JourneyContent } from "../../data/journey-content";
import { buildIdIndex } from "../../data/cards-v2-database";
import type { OfferDeps } from "../../draft/draft-engine";
import type { DraftConfig, DraftState } from "../../types/draft";
import type { CardData } from "../../types/cards";
import type { DraftContentProvider } from "../../rules/journey/draft";
import { offeredTransfigurationForms } from "../../transfiguration/transfiguration-logic";
import { draftSitePickCount } from "../../draft/draft-site-config";
import type { SiteState } from "../../types/journey";

export function createDraftContentProvider(
  content: JourneyContent,
): DraftContentProvider {
  const idIndex = buildIdIndex(content.cardDatabase);
  const allCardNumbers = [...content.cardDatabase.keys()];

  return {
    resolveCardNumber: (cardId) => idIndex.get(cardId.toLowerCase()) ?? null,
    cardDatabase: (): Map<number, CardData> => content.cardDatabase,
    offerDepsFor: (
      draftState: DraftState,
      deckCardNumbers: readonly number[],
    ): OfferDeps | undefined => {
      // Only the deck-fit modes need per-offer deps, and only when a fit model
      // loaded. Pool mode (and a run with no fit model) reveals its next offer
      // straight from the multiset, so it returns `undefined`.
      const fitModel = content.fitModel;
      if (fitModel === undefined) return undefined;
      if (draftState.mode === "replay") {
        return {
          deckCardNumbers,
          fitModel,
          offerSize: content.draftData.offers.cardsPerOffer,
        };
      }
      if (draftState.mode === "fresh20") {
        return {
          deckCardNumbers,
          fitModel,
          offerSize: content.draftData.offers.cardsPerOffer,
          allCardNumbers,
        };
      }
      return undefined;
    },
    // SEAM (Task 27): the affiliation reweighting the legacy pick path applied is
    // keyed on the CURRENT dreamscape node, while this seam receives only the
    // persisted site data. The TOML-authored rules are deterministic here;
    // affiliation-steered draft offers remain a separate follow-up.
    draftConfigFor: (
      _draftState: DraftState,
      site: Pick<SiteState, "data">,
    ): DraftConfig => ({
      packSize: content.draftData.offers.cardsPerOffer,
      sitePickCount: draftSitePickCount(
        site,
        content.draftData.offers.picksPerSite,
      ),
      rarityCaps: content.draftData.rarityCaps,
    }),
    transfigurationForCard: (cardNumber, rng) => {
      const card = content.cardDatabase.get(cardNumber);
      if (card === undefined) return null;
      const forms = offeredTransfigurationForms(
        content.transfigurationData,
        card,
        null,
      );
      if (forms.length === 0) return null;
      return forms[Math.floor(rng() * forms.length)]?.type ?? null;
    },
  };
}
