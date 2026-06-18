/** Configuration shared across all pack generation strategies. */
export interface DraftConfig {
  /** Number of cards shown per pick. */
  packSize: number;
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
  affiliationId?: string;
}

/** Context provided to a pack generation strategy. */
export interface PackContext {
  /** Remaining copies for each card number in the fixed run pool. */
  remainingCopiesByCard: Record<string, number>;
  /** 1-indexed pick counter across the entire quest. */
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
  /**
   * Card numbers that have appeared in any offer during the current draft site
   * visit. A card shown once is never shown again for the rest of the visit, so
   * a single visit can never offer the same card twice. Reset to empty when a
   * new draft site visit begins. Optional only so older persisted states and
   * fixtures omit it safely; live states maintained by the engine always set it.
   */
  siteShownCardNumbers?: number[];
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

/**
 * Fresh-pack draft state: at each pick a brand-new random pack of `packSize`
 * cards is generated from the cards currently eligible to be shown, and the
 * same deck-fit ranking as the replay draft selects the best slice to offer.
 *
 * The packs are not frozen up front: each one depends on which cards have
 * already been shown, so the pack for a pick can only be rolled once the prior
 * picks are resolved. Offers are persisted in `currentOffer` exactly like the
 * other modes, so a reload never re-rolls a pick that has already been shown.
 */
export interface Fresh20DraftState extends DraftStateCommon {
  mode: "fresh20";
  /** Number of cards in each freshly generated random pack (e.g. 20). */
  packSize: number;
  /**
   * Show history keyed by card number: the (ascending, deduped) pick numbers at
   * which each card has appeared in a shown offer. Drives the show cooldown and
   * the twice-then-never cap; cards never shown are absent.
   */
  shownPicksByCard: Record<string, number[]>;
}

/** Persistent draft state, survives across dreamscape visits. */
export type DraftState = PoolDraftState | ReplayDraftState | Fresh20DraftState;
