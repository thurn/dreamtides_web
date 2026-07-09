// Shared draft-site entry logic: resolving the per-site draft config (the
// dreamscape's affiliation reweighting) and rolling the offer for a newly
// entered site. The reducer's `ENTER_DRAFT_SITE` case (`src/rules/quest/draft.ts`)
// is the source of truth for a player's draft-site entry — it calls the
// underlying `enterDraftSite` engine function directly with an
// `ctx.rng`-backed stream. `enterDraftSiteState` here is this module's preview
// wrapper: it clones a `DraftState`, rolls the same engine call with an
// injectable `rng` (defaulting to `Math.random`), and returns the clone
// without mutating its input — for any caller that wants to preview an offer
// outside the event log.
//
// `enterDraftSite` mints a fresh offer, so these functions are minting
// operations, not pure view-model mapping — they belong on the impure
// (data/adapter) side, never in a screen's pure view-model builder.

import {
  countRemainingCards,
  DEFAULT_DRAFT_CONFIG,
  enterDraftSite,
} from "../draft/draft-engine";
import { replayDepsFor } from "../draft/replay/replay-deps";
import { fresh20DepsFor } from "../draft/fresh20/fresh20-deps";
import type { FitModel } from "../draft/replay/fit-model";
import type { PoolData } from "../draft/pool/types";
import { resolveNodeAffiliationWeights } from "../affiliations/affiliation-weights";
import type { CardData } from "../types/cards";
import type { AffiliationContent, DreamscapeContent } from "../types/content";
import type { DraftConfig, DraftState } from "../types/draft";
import type { DeckEntry, DreamscapeNode } from "../types/quest";

/**
 * The draft config for a draft site sitting in `node`. A neutral dreamscape
 * yields `DEFAULT_DRAFT_CONFIG` (no bias); an affiliated one pulls the offers
 * toward its signature set (via `affiliationWeights`) without removing any card.
 */
export function resolveDraftConfig(
  node: DreamscapeNode | null,
  dreamscapes: readonly DreamscapeContent[],
  affiliations: readonly AffiliationContent[],
  poolData: PoolData | null | undefined,
  cardDatabase: ReadonlyMap<number, CardData>,
): DraftConfig {
  const resolved = resolveNodeAffiliationWeights(
    node,
    dreamscapes,
    affiliations,
    poolData,
    cardDatabase,
  );
  if (resolved === null) {
    return DEFAULT_DRAFT_CONFIG;
  }
  return {
    ...DEFAULT_DRAFT_CONFIG,
    affiliationWeights: resolved.weights,
    affiliationId: resolved.affiliation.id,
  };
}

/**
 * Build the per-offer deck-fit deps a draft state needs to reveal an offer:
 * replay and fresh20 each require their own deps; a pool state ignores them
 * (returns `undefined`).
 */
export function offerDepsForDraftState(
  draftState: DraftState,
  deck: readonly DeckEntry[],
  fitModel: FitModel | undefined,
  cardDatabase: Map<number, CardData>,
) {
  if (draftState.mode === "replay") return replayDepsFor(deck, fitModel);
  if (draftState.mode === "fresh20") {
    return fresh20DepsFor(deck, fitModel, cardDatabase);
  }
  return undefined;
}

/**
 * Clone `liveDraftState` and advance it into `siteId`, rolling that site's
 * first offer. The returned state is a fresh object safe to hand to
 * `setDraftState`; the input is never mutated.
 *
 * `rng` defaults to `Math.random` for any preview caller that has no
 * deterministic source; the reducer's `ENTER_DRAFT_SITE` case (the live
 * player path — see `src/rules/quest/draft.ts`) supplies an `ctx.rng`-backed
 * stream instead, so two clients folding the same event roll byte-identical
 * offers.
 */
export function enterDraftSiteState(
  liveDraftState: DraftState,
  siteId: string,
  cardDatabase: Map<number, CardData>,
  deck: readonly DeckEntry[],
  fitModel: FitModel | undefined,
  draftConfig: DraftConfig = DEFAULT_DRAFT_CONFIG,
  rng: () => number = Math.random,
): DraftState {
  const cloned = JSON.parse(JSON.stringify(liveDraftState)) as DraftState;
  const offerDeps = offerDepsForDraftState(cloned, deck, fitModel, cardDatabase);
  enterDraftSite(cloned, siteId, cardDatabase, draftConfig, offerDeps, rng);
  return cloned;
}

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
  siteId: string,
): DraftSiteProgress {
  const isActive = effective?.activeSiteId === siteId;
  const sitePicksCompleted = isActive ? effective?.sitePicksCompleted ?? 0 : 0;
  const offerCardNumbers = isActive ? [...(effective?.currentOffer ?? [])] : [];
  const offerKey = offerCardNumbers.join(",");
  const remainingTotal =
    isActive && effective && effective.mode === "pool"
      ? countRemainingCards(effective.remainingCopiesByCard)
      : 0;
  const isComplete =
    isActive
    && offerKey === ""
    && (sitePicksCompleted > 0 || remainingTotal < 4);
  return { isActive, offerCardNumbers, offerKey, sitePicksCompleted, isComplete };
}
