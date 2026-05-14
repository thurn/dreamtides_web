/** Configuration shared across all pack generation strategies. */
export interface DraftConfig {
  /** Number of cards shown per pick. */
  packSize: number;
}

/** Context provided to a pack generation strategy. */
export interface PackContext {
  /** Remaining copies for each card number in the fixed run pool. */
  remainingCopiesByCard: Record<string, number>;
  /** 1-indexed pick counter across the entire quest. */
  pickNumber: number;
  /** Number of cards to include in the pack. */
  packSize: number;
}

/** Persistent draft state, survives across dreamscape visits. */
export interface DraftState {
  /**
   * The full fixed run multiset, keyed by card number. Immutable for the run:
   * when `remainingCopiesByCard` is exhausted the multiset is recreated from
   * this snapshot.
   */
  draftPoolCopiesByCard: Record<string, number>;
  /** Remaining copies for each card number in the fixed run pool. */
  remainingCopiesByCard: Record<string, number>;
  /** Current 4-unique-card offer. */
  currentOffer: number[];
  /** Site currently owning the in-progress or completed visit state. */
  activeSiteId: string | null;
  /** 1-indexed pick counter across the entire quest. */
  pickNumber: number;
  /** Number of player picks completed in the current draft site visit. */
  sitePicksCompleted: number;
}
