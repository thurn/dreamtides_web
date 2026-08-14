// Draft-site progress derivation for the draft screens. The reducer's
// `ENTER_DRAFT_SITE` case (`src/rules/journey/draft.ts`) is the source of truth
// for a player's draft-site entry and offer minting — it rolls the offer
// deterministically from `ctx.rng` so both clients folding the same event see
// byte-identical packs. This module reads the resulting draft state back into
// the shape a screen renders.

import { countRemainingCards } from "../draft/draft-engine";
import type { DraftState } from "../types/draft";
import type { SiteId } from "../types/identifiers";

/** The derived draft progress for a site, read from the effective draft state. */
export interface DraftSiteProgress {
  /** True when the effective draft state is advanced to this site. */
  isActive: boolean;
  /** The current offered pack's card numbers (empty when not active / exhausted). */
  offerCardNumbers: number[];
  /** Stable key for the current pack (the card numbers joined). */
  offerKey: string;
  /** How many picks the player has made at this site. */
  sitePicksCompleted: number;
  /** True once the site's picks are exhausted and the run should move on. */
  isComplete: boolean;
}

/**
 * Read the draft progress a screen needs from the effective draft state. Mirrors
 * the completion rule the pool/deck-fit modes share: a pool site completes when
 * its offer empties after at least one pick (or when fewer than a full pack of
 * copies remain); the deck-fit modes complete on an empty final offer.
 */
export function readDraftSiteProgress(
  effective: DraftState | null,
  siteId: SiteId,
): DraftSiteProgress {
  const isActive = effective?.activeSiteId === siteId;
  const sitePicksCompleted = isActive
    ? (effective?.sitePicksCompleted ?? 0)
    : 0;
  const offerCardNumbers = isActive ? [...(effective?.currentOffer ?? [])] : [];
  const offerKey = offerCardNumbers.join(",");
  const remainingTotal =
    isActive && effective && effective.mode === "tides4"
      ? countRemainingCards(effective.remainingCopiesByCard)
      : 0;
  const isComplete =
    isActive &&
    offerKey === "" &&
    (sitePicksCompleted > 0 || remainingTotal < 4);
  return {
    isActive,
    offerCardNumbers,
    offerKey,
    sitePicksCompleted,
    isComplete,
  };
}
