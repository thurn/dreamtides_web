// Real DraftContentProvider: resolves `PICK_DRAFT_CARD` against the loaded
// content. The engine draws from the reducer-supplied `ctx.rng` (threaded by
// `src/rules/journey/draft.ts`), so this adapter contributes only pure,
// deterministic lookups.

import type { JourneyContent } from "../../data/journey-content";
import { buildIdIndex } from "../../data/cards-v2-database";
import type { DraftConfig, DraftState } from "../../types/draft";
import type { CardData } from "../../types/cards";
import type { DraftContentProvider } from "../../rules/journey/draft";
import { offeredTransfigurationForms } from "../../transfiguration/transfiguration-logic";
import { draftSitePickCount } from "../../draft/draft-site-config";
import type { SiteState } from "../../types/journey";
import { parseCardId } from "../../types/card-identity";

export function createDraftContentProvider(
  content: JourneyContent,
): DraftContentProvider {
  const idIndex = buildIdIndex(content.cardDatabase);
  return {
    resolveCardNumber: (cardId) =>
      idIndex.get(parseCardId(cardId.toLowerCase())) ?? null,
    cardDatabase: (): Map<number, CardData> => content.cardDatabase,
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
