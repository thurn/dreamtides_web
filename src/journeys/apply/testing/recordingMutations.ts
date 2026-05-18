// Recording test double for `JourneyMutations`.
//
// Every per-template `apply` test in later tasks needs to assert that the
// right `JourneyMutations` method was called with the right arguments. This
// double records each call into a shared `calls` array; the assertion is the
// caller's responsibility.
//
// This file lives under `apply/testing/` rather than alongside production
// code so a future tree-shaking pass can drop it from the prod bundle.

import type { JourneyMutations } from "../JourneyMutations";

/** A single recorded call against the recording `JourneyMutations` double. */
export interface MutCall {
  readonly method: keyof JourneyMutations;
  readonly args: readonly unknown[];
}

/**
 * Returns a fresh recording double. Each call to `mut.<method>(...args)`
 * appends `{ method, args }` to `calls`. Tests narrow `args` at the
 * assertion site (e.g. `expect(calls[0]).toEqual({ method: "changeEssence",
 * args: [-50, "src"] })`).
 */
export function createRecordingMutations(): {
  mut: JourneyMutations;
  calls: MutCall[];
} {
  const calls: MutCall[] = [];
  let addedCardCount = 0;

  const record =
    <M extends keyof JourneyMutations>(method: M) =>
    (...args: unknown[]): void => {
      calls.push({ method, args });
    };

  const mut: JourneyMutations = {
    // ---- Resources -------------------------------------------------------
    changeEssence: record("changeEssence"),
    changeOmens: record("changeOmens"),
    setEssence: record("setEssence"),
    changeMaxEssence: record("changeMaxEssence"),

    // ---- Deck ------------------------------------------------------------
    addCardById: (...args) => {
      calls.push({ method: "addCardById", args });
      addedCardCount += 1;
      return `recorded-add-card-${String(addedCardCount)}`;
    },
    addCardByIdWithTransfiguration: (...args) => {
      calls.push({ method: "addCardByIdWithTransfiguration", args });
      addedCardCount += 1;
      return `recorded-add-card-${String(addedCardCount)}`;
    },
    addBaneCardById: record("addBaneCardById"),
    removeDeckEntry: record("removeDeckEntry"),
    duplicateDeckEntry: record("duplicateDeckEntry"),
    transfigureDeckEntry: record("transfigureDeckEntry"),
    changeDeckEntryType: record("changeDeckEntryType"),

    // ---- Dreamsigns ------------------------------------------------------
    addDreamsign: record("addDreamsign"),
    removeDreamsign: record("removeDreamsign"),

    // ---- Banes -----------------------------------------------------------
    purgeRandomBaneCards: record("purgeRandomBaneCards"),
    purgeAllBaneCards: record("purgeAllBaneCards"),

    // ---- Atlas / route ---------------------------------------------------
    addSiteToDreamscape: record("addSiteToDreamscape"),
    replaceSiteType: record("replaceSiteType"),
    removeSiteTypeFromNextDreamscapes: record("removeSiteTypeFromNextDreamscapes"),

    // ---- Battle-window counters -----------------------------------------
    pushBattleRewardModifier: record("pushBattleRewardModifier"),
    pushTemporaryBaneGrant: record("pushTemporaryBaneGrant"),

    // ---- Shop modifiers --------------------------------------------------
    grantFreeShopRerolls: record("grantFreeShopRerolls"),
    applyShopEssenceDiscount: record("applyShopEssenceDiscount"),
    grantShopOmenDiscounts: record("grantShopOmenDiscounts"),

    // ---- Site boost ------------------------------------------------------
    boostSiteAppearance: record("boostSiteAppearance"),
  };

  return { mut, calls };
}
