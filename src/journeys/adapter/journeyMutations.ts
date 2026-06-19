// Adapter: `JourneyMutations` → `QuestMutations`.
//
// `JourneyMutations` is the effect-application API consumed by the per-
// template `apply` methods under `src/journeys/journey/shared/`. This file
// is the single conversion site between that API and the prototype's
// `QuestMutations` reducer surface. Production code constructs the adapter
// once in the dreamscape site router; tests substitute the recording double
// in `src/journeys/apply/testing/recordingMutations.ts`.
//
// Translation classes handled here:
//   - Passthrough: most methods share a name and signature with
//     `QuestMutations`; the adapter forwards the call unchanged.
//   - Transfiguration: `transfigureDeckEntry(entryId, type | null, source)`
//     calls `mutations.transfigureCard(entryId, type, source, {})`. The
//     null variant clears the entry's transfiguration field via the
//     underlying reducer's `TransfigurationType | null` signature.
//   - Site-type narrowing:
//     `JourneyMutations.removeSiteTypeFromNextDreamscapes` accepts any
//     `SiteType`, while the underlying mutation only handles `"Shop"`. The
//     adapter narrows at the boundary, logging a `console.warn` and no-op
//     for unsupported types.
//
// No `cardDatabase` argument is needed: `addCardById` /
// `addBaneCardById` / `pushTemporaryBaneGrant` all resolve their catalog
// lookups inside the QuestMutations reducer.

import type { QuestMutations } from "../../state/quest-context";
import type { JourneyMutations } from "../apply/JourneyMutations";

export function createJourneyMutations(
  mutations: QuestMutations,
): JourneyMutations {
  return {
    // ---- Resources -----------------------------------------------------
    changeEssence: (delta, source) => {
      mutations.changeEssence(delta, source);
    },
    changeOmens: (delta, source) => {
      // The single-currency economy routes omen rewards into essence: the
      // classic journey reducer still issues omen deltas, which are applied as
      // essence so the legacy path stays functional.
      mutations.changeEssence(delta, source);
    },
    setEssence: (value, source) => {
      mutations.setEssence(value, source);
    },
    changeMaxEssence: (delta, source) => {
      mutations.changeMaxEssence(delta, source);
    },

    // ---- Deck ----------------------------------------------------------
    addCardById: (cardId, source) => mutations.addCardById(cardId, source),
    addCardByIdWithTransfiguration: (cardId, type, source) =>
      mutations.addCardByIdWithTransfiguration(cardId, type, source),
    addBaneCardById: (cardId, source) => {
      mutations.addBaneCardById(cardId, source);
    },
    removeDeckEntry: (entryId, source) => {
      mutations.removeDeckEntry(entryId, source);
    },
    duplicateDeckEntry: (entryId, source) => {
      mutations.duplicateDeckEntry(entryId, source);
    },
    transfigureDeckEntry: (entryId, type, source) => {
      // `transfigureCard` takes a (description, details) pair the journey
      // layer does not produce. The adapter packs `source` into the
      // description slot — log readers already key on the source string —
      // and passes an empty details object. The `null` type is forwarded
      // verbatim; the underlying reducer clears the entry's transfiguration
      // field when it receives null.
      mutations.transfigureCard(entryId, type, source, {});
    },
    changeDeckEntryType: (entryId, typeChange, source) => {
      mutations.changeDeckEntryType(entryId, typeChange, source);
    },
    changeDeckEntryKeywords: (entryId, keywordModification, source) => {
      mutations.changeDeckEntryKeywords(entryId, keywordModification, source);
    },

    // ---- Dreamsigns ----------------------------------------------------
    addDreamsign: (dreamsign, source, purgeIndex) => {
      mutations.addDreamsign(dreamsign, source, purgeIndex);
    },
    removeDreamsign: (index, source) => {
      mutations.removeDreamsign(index, source);
    },

    // ---- Banes (cleanup) ----------------------------------------------
    purgeRandomBaneCards: (count, source) => {
      mutations.purgeRandomBaneCards(count, source);
    },
    purgeAllBaneCards: (source) => {
      mutations.purgeAllBaneCards(source);
    },

    // ---- Atlas / route -------------------------------------------------
    addSiteToDreamscape: (placement, siteType, source) => {
      mutations.addSiteToDreamscape(placement, siteType, source);
    },
    replaceSiteType: (from, to, source) => {
      mutations.replaceSiteType(from, to, source);
    },
    removeSiteTypeFromNextDreamscapes: (siteType, dreamscapes, source) => {
      // The underlying `QuestMutations` method is narrowed to the only site
      // kind whose hide-modifier semantics are defined. Other `SiteType`
      // values reach the adapter through the wider `JourneyMutations`
      // contract — log a warning and no-op rather than silently dropping the
      // call.
      if (siteType === "Shop") {
        mutations.removeSiteTypeFromNextDreamscapes(
          siteType,
          dreamscapes,
          source,
        );
        return;
      }
      console.warn(
        `[journey-adapter] removeSiteTypeFromNextDreamscapes: unsupported siteType '${siteType}' (source: ${source})`,
      );
    },

    // ---- Battle-window counters ---------------------------------------
    pushBattleRewardModifier: (kind, amount, battles, source) => {
      mutations.pushBattleRewardModifier(kind, amount, battles, source);
    },
    pushTemporaryBaneGrant: (baneName, count, battles, source) => {
      mutations.pushTemporaryBaneGrant(baneName, count, battles, source);
    },

    // ---- Shop modifiers ------------------------------------------------
    grantFreeShopRerolls: (count, source) => {
      mutations.grantFreeShopRerolls(count, source);
    },
    applyShopEssenceDiscount: (percent, source) => {
      mutations.applyShopEssenceDiscount(percent, source);
    },
    grantShopOmenDiscounts: (_count, _source) => {
      // Shop Dreamsigns are essence-priced; the classic journey's omen-discount
      // grant has no essence-economy equivalent and is intentionally a no-op.
    },

    // ---- Site boost ----------------------------------------------------
    boostSiteAppearance: (siteType, percent, dreamscapes, source) => {
      mutations.boostSiteAppearance(siteType, percent, dreamscapes, source);
    },
  };
}
