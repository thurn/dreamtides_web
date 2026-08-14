import type { DraftRarityCap } from "./draft-data";
import type { AffiliationId, ExplorationActionId, SiteId } from "./identifiers";

/** Configuration for the tides4 draft offer engine. */
export interface DraftConfig {
  /** Number of cards shown per pick. */
  packSize: number;
  /** Number of picks required to complete the active persisted Draft site. */
  sitePickCount: number;
  /** Per-rarity pool and run limits compiled from draft.toml. */
  rarityCaps: readonly DraftRarityCap[];
  /**
   * Optional affiliation reweighting for a draft inside an affiliated dreamscape:
   * a `cardNumber -> multiplier` map (see `src/affiliations/affiliation-weights.ts`).
   * Each offered card's base copy weight is multiplied by its entry (cards absent
   * from the map use 1), pulling offers toward the dreamscape's affiliation
   * without ever removing a card. Absent in a neutral dreamscape.
   */
  affiliationWeights?: ReadonlyMap<number, number>;
  /**
   * The id of the affiliation `affiliationWeights` came from, recorded in the
   * reconstruction log so a draw can be traced back to its dreamscape's faction.
   * Absent in a neutral dreamscape.
   */
  affiliationId?: AffiliationId;
}

/** Context provided to a pack generation strategy. */
export interface PackContext {
  /** Remaining copies for each card number in the fixed run pool. */
  remainingCopiesByCard: Record<string, number>;
  /** 1-indexed pick counter across the entire journey. */
  pickNumber: number;
  /** Number of cards to include in the pack. */
  packSize: number;
  /**
   * Optional affiliation reweighting (`cardNumber -> multiplier`) applied to each
   * candidate's base copy weight, threaded from {@link DraftConfig}. Absent in a
   * neutral dreamscape.
   */
  affiliationWeights?: ReadonlyMap<number, number>;
}

/** Persistent tides4 draft state. Survives across dreamscape visits. */
export interface DraftState {
  /** Persisted discriminator for future draft-algorithm extensions. */
  mode: "tides4";
  /** Current offer presented to the player. */
  currentOffer: number[];
  /** Site currently owning the in-progress or completed visit state. */
  activeSiteId: SiteId | null;
  /** 1-indexed pick counter across the entire journey (1..30). */
  pickNumber: number;
  /** Number of player picks completed in the current draft site visit. */
  sitePicksCompleted: number;
  /**
   * Card numbers that have appeared in any offer during the current draft site
   * visit. A card shown once is never shown again for the rest of the visit, so
   * a single visit can never offer the same card twice. Reset to empty when a
   * new draft site visit begins. Optional only so older persisted states and
   * fixtures omit it safely; live states maintained by the engine always set it.
   */
  siteShownCardNumbers?: number[];
  /** Exact transfiguration rolled for each card in the currently visible offer. */
  currentOfferTransfigurations?: Record<
    string,
    import("./journey").TransfigurationType
  >;
  /** Exploration action whose one-use modifier transfigures this Draft visit. */
  transfiguredOfferSource?: {
    siteId: SiteId;
    actionId: ExplorationActionId;
  };
  /**
   * The full fixed run multiset, keyed by card number. Immutable for the run:
   * when `remainingCopiesByCard` is exhausted the multiset is recreated from
   * this snapshot.
   */
  draftPoolCopiesByCard: Record<string, number>;
  /**
   * Exact early offers keyed by their 1-indexed journey pick. When every
   * authored card remains eligible, the engine presents the authored order.
   */
  openingDraftOffers?: Record<string, number[]>;
  /** Remaining copies for each card number in the fixed run pool. */
  remainingCopiesByCard: Record<string, number>;
}

/** Explicit alias for code that consumes the fixed tides4 pool multiset. */
export type PoolDraftState = DraftState;
