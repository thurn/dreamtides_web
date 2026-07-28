// Real DraftContentProvider: resolves `PICK_DRAFT_CARD` against the loaded
// content and supplies the deck-fit deps the draft engine needs to reveal the
// next offer. The engine draws from the reducer-supplied `ctx.rng` (threaded by
// `src/rules/journey/draft.ts`), so this adapter contributes only pure,
// deterministic lookups.

import type { JourneyContent } from "../../data/journey-content";
import { buildIdIndex } from "../../data/cards-v2-database";
import { DEFAULT_DRAFT_CONFIG, type OfferDeps } from "../../draft/draft-engine";
import type { DraftConfig, DraftState } from "../../types/draft";
import type { CardData } from "../../types/cards";
import type { DraftContentProvider } from "../../rules/journey/draft";

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
          offerSize: DEFAULT_DRAFT_CONFIG.packSize,
        };
      }
      if (draftState.mode === "fresh20") {
        return {
          deckCardNumbers,
          fitModel,
          offerSize: DEFAULT_DRAFT_CONFIG.packSize,
          allCardNumbers,
        };
      }
      return undefined;
    },
    // SEAM (Task 27): the affiliation reweighting the legacy pick path applied is
    // keyed on the CURRENT dreamscape node, which is not reachable from
    // `draftState` alone (the interface hands only the draft state). Until the
    // seam carries the node, the draft config stays neutral (engine default), so
    // it is deterministic; affiliation-steered draft offers are a follow-up.
    draftConfigFor: (): DraftConfig | undefined => undefined,
  };
}
