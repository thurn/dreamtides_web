// The effect-application API used by Cost/Reward template `apply` methods.
//
// This module imports type-only declarations from `src/types/quest.ts`.
// The spec's isolation contract technically excludes `src/types/` from
// `src/journeys/apply/`; these are pure type imports with no runtime
// dependency, so the import is permitted by plan-level decision (Task 2,
// Step 1). The module MUST NOT import from `src/state/`.
//
// An adapter in `src/journeys/adapter/` implements this interface on top
// of `QuestMutations`.

import type { Dreamsign, SiteType, TransfigurationType } from "../../types/quest";

export interface JourneyMutations {
  // ---- Resources ---------------------------------------------------------
  /** Add `delta` to current essence (negative shrinks). Clamps at 0 and maxEssence. */
  changeEssence(delta: number, source: string): void;

  /** Add `delta` to omens (negative shrinks). Clamps at 0. */
  changeOmens(delta: number, source: string): void;

  /** Set essence to `value`, clamped to [0, maxEssence]. */
  setEssence(value: number, source: string): void;

  /** Add `delta` to maxEssence; current essence clamps to the new max. */
  changeMaxEssence(delta: number, source: string): void;

  // ---- Deck (mechanical card movement; rules-text edits are not in scope) -
  /** Add a card by catalog id to the deck and return the new deck entry id. */
  addCardById(cardId: string, source: string): string;

  /** Add a card by catalog id flagged as a bane card. */
  addBaneCardById(cardId: string, source: string): void;

  /** Remove the deck entry with the given entryId. */
  removeDeckEntry(entryId: string, source: string): void;

  /** Add a duplicate of the deck entry with the given entryId. */
  duplicateDeckEntry(entryId: string, source: string): void;

  /** Apply a transfiguration to the deck entry, or pass `null` to clear an
   *  existing transfiguration (the "remove transfiguration" reward variant).
   *  Delegates to the underlying `transfigureCard` mutation, which handles
   *  eligibility, source logging, and the transfiguration effect-details
   *  payload. */
  transfigureDeckEntry(
    entryId: string,
    type: TransfigurationType | null,
    source: string,
  ): void;

  // ---- Dreamsigns --------------------------------------------------------
  /** Add a Dreamsign. `purgeIndex` resolves the 12-cap purge if needed. */
  addDreamsign(dreamsign: Dreamsign, source: string, purgeIndex?: number): void;

  /** Remove the active Dreamsign at `index`. */
  removeDreamsign(index: number, source: string): void;

  // ---- Banes (cleanup) ---------------------------------------------------
  /** Remove `count` bane cards from the deck (random selection). */
  purgeRandomBaneCards(count: number, source: string): void;

  /** Remove all bane cards from the deck. */
  purgeAllBaneCards(source: string): void;

  // ---- Atlas / route -----------------------------------------------------
  /** Add a site of `siteType` to the dreamscape identified by `placement`. */
  addSiteToDreamscape(
    placement: "current" | "next",
    siteType: SiteType,
    source: string,
  ): void;

  /** Replace one occurrence of `from` site type with `to` in the current
   *  dreamscape. */
  replaceSiteType(from: SiteType, to: SiteType, source: string): void;

  /** Remove all sites of `siteType` from the next `dreamscapes` dreamscapes. */
  removeSiteTypeFromNextDreamscapes(
    siteType: SiteType,
    dreamscapes: number,
    source: string,
  ): void;

  // ---- Battle-window counters -------------------------------------------
  /** Stack a "next N battles, essence reward -X" or "-X%" modifier. */
  pushBattleRewardModifier(
    kind: "flat" | "percent",
    amount: number,
    battles: number,
    source: string,
  ): void;

  /** Stack a "gain N <bane> for the next M battles" modifier. The bane is
   *  added to the deck immediately; the modifier records when to remove it. */
  pushTemporaryBaneGrant(
    baneName: string,
    count: number,
    battles: number,
    source: string,
  ): void;

  // ---- Shop modifiers ----------------------------------------------------
  /** Grant `count` free shop rerolls (consumed at shops; ungrouped). */
  grantFreeShopRerolls(count: number, source: string): void;

  /** Add `percent` to the permanent shop essence discount. */
  applyShopEssenceDiscount(percent: number, source: string): void;

  /** Push `count` one-use "-1 omen" tokens onto the upcoming-shop queue. */
  grantShopOmenDiscounts(count: number, source: string): void;

  // ---- Site boost --------------------------------------------------------
  /** Boost appearance chance of `siteType` by `percent` for `dreamscapes`. */
  boostSiteAppearance(
    siteType: SiteType,
    percent: number,
    dreamscapes: number,
    source: string,
  ): void;
}
