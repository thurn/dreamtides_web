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

/** Fields shared by every draft mode. Survives across dreamscape visits. */
interface DraftStateCommon {
  /** Current offer presented to the player. */
  currentOffer: number[];
  /** Site currently owning the in-progress or completed visit state. */
  activeSiteId: string | null;
  /** 1-indexed pick counter across the entire quest (1..30). */
  pickNumber: number;
  /** Number of player picks completed in the current draft site visit. */
  sitePicksCompleted: number;
}

/**
 * Pool-based draft state: offers are weighted samples from a fixed run
 * multiset that is spent down and recreated as picks are made.
 */
export interface PoolDraftState extends DraftStateCommon {
  mode: "pool";
  /**
   * The full fixed run multiset, keyed by card number. Immutable for the run:
   * when `remainingCopiesByCard` is exhausted the multiset is recreated from
   * this snapshot.
   */
  draftPoolCopiesByCard: Record<string, number>;
  /** Remaining copies for each card number in the fixed run pool. */
  remainingCopiesByCard: Record<string, number>;
}

/**
 * Record-replay draft state: offers are the deck-fit best slice of a frozen
 * sequence of real packs, indexed by `pickNumber`.
 */
export interface ReplayDraftState extends DraftStateCommon {
  mode: "replay";
  /** Chosen record/seat id, for logging/debug. */
  recordId: string;
  /** 30 frozen, resolved, deduped packs; indexed by `pickNumber - 1`. */
  packSequence: number[][];
  /** Dreamcaller signatures; seed the fit model when the deck is small. */
  signatureCardNumbers: number[];
}

/** Persistent draft state, survives across dreamscape visits. */
export type DraftState = PoolDraftState | ReplayDraftState;
