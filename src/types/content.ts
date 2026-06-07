/**
 * Default starting essence used when a Dreamcaller record omits a tuned
 * value. Persistence helpers (see `normalizeQuestState`) also fall back to
 * this constant so RTDB-stripped rooms render with a sensible value.
 */
export const DEFAULT_STARTING_ESSENCE = 250;

export interface DreamcallerContent {
  id: string;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
  /**
   * Per-Dreamcaller starting essence. Tuned in `dreamcallers.toml` to
   * compensate for differences in opening power and engine ramp speed.
   * Defaults to `DEFAULT_STARTING_ESSENCE` when omitted from source data.
   */
  startingEssence: number;
  /**
   * Card names that steer the `idf3` pool generator toward this Dreamcaller's
   * intended decks when building the run's draft package. Optional during the
   * V2 migration; absent for v1 records.
   */
  signatureCards?: string[];
}

export interface DreamsignTemplate {
  id: string;
  name: string;
  effectDescription: string;
  imageName?: string;
  imageAlt?: string;
}

/**
 * One real decklist the `idf3` grower folded into a pool, resolved for the
 * provenance debug surface. `distinctiveCardNames` are the deck's most
 * archetype-defining card names, so a reader can recognise what kind of deck it
 * is at a glance.
 */
export interface Idf3SourceDeck {
  /** 0 for the starter deck, then 1, 2, ... for each nearer-to-farther neighbour. */
  rank: number;
  /** IDF-cosine similarity of this deck to the starter (1 for the starter itself). */
  similarityToStarter: number;
  /** Most archetype-defining card names in this deck, most distinctive first. */
  distinctiveCardNames: string[];
  /** How many pooled cards name this deck as their nearest source. */
  contributedCardCount: number;
}

/** One anchor deck the signature located, resolved for the debug surface. */
export interface Idf3Anchor {
  /** Probe-cosine similarity of this real deck to the signature. */
  similarityToSignature: number;
  /** Most archetype-defining card names in the anchor deck, most distinctive first. */
  distinctiveCardNames: string[];
}

/** Per-card provenance within an `idf3` pool. */
export interface Idf3CardProvenance {
  /** Whether this card is one of the Dreamcaller's signature cards. */
  isSignature: boolean;
  /** Whether this card is in the drawn starter decklist. */
  inStarterDeck: boolean;
  /** Copies of this card in the pool (1 or 2). */
  copies: number;
  /** Rank of the nearest source deck holding this card (0 = starter). */
  sourceRank: number;
  /** Similarity of that nearest source deck to the starter (1 for the starter). */
  sourceSimilarity: number;
}

/**
 * Full provenance for one Dreamcaller's resolved `idf3` pool, keyed by card
 * number. Records the whole chain — signature -> anchors -> starter -> grown
 * neighbours — so the "Why Cards" surface can explain why each card is in the
 * pool. Recomputed on demand from the run seed and the pool corpus; never
 * persisted.
 */
export interface Idf3ProvenanceSummary {
  /** The Dreamcaller's raw signature card names. */
  signatureCardNames: string[];
  /** Signature cards that carry IDF weight in the corpus (the actual probe). */
  signatureWeightedNames: string[];
  /** Signature cards dropped because they are absent or carry no IDF weight. */
  signatureDroppedNames: string[];
  /** The anchor decks the signature located, most similar first. */
  anchors: Idf3Anchor[];
  /** Most archetype-defining card names in the starter deck, most distinctive first. */
  starterDistinctiveCardNames: string[];
  /** Number of distinct cards in the starter deck. */
  starterCardCount: number;
  /** Every deck folded into the pool, starter first then nearest-to-farthest. */
  sourceDecks: Idf3SourceDeck[];
  /** Per-card provenance, keyed by card number (as a string). */
  cardProvenanceByNumber: Record<string, Idf3CardProvenance>;
}

/** Per-card provenance within a `seed` pool, resolved by card number. */
export interface SeedCardProvenance {
  /** Whether this is the randomly drawn seed card the pool grew from. */
  isSeed: boolean;
  /** Copies of this card in the pool (1 or 2). */
  copies: number;
  /** Order this card joined the pool (0 = seed, then 1, 2, ... in growth order). */
  addOrder: number;
  /** Normalised affinity (0-1) of this card to the seed card. */
  seedAffinity: number;
  /** Normalised affinity (0-1) of this card to the pool when it joined. */
  poolAffinity: number;
  /** Blended seed/pool/prior score this card was admitted on (the seed is 1). */
  blendedScore: number;
}

/**
 * Full provenance for one Dreamcaller's resolved `seed` pool, keyed by card
 * number. Records the random seed card and how the pool grew outward from it, so
 * the "Why Cards" surface can explain what the initial card was and how the pool
 * reached its target size. Recomputed on demand from the run seed and the pool
 * corpus; never persisted.
 */
export interface SeedProvenanceSummary {
  /** The card drawn uniformly at random that seeded the whole pool. */
  seedCardName: string;
  /** Card number of the seed card, or null if it does not resolve to one. */
  seedCardNumber: number | null;
  /** Target pool size in total copies the grower aimed for. */
  targetSize: number;
  /** The seed-vs-pool affinity blend weight used during growth (0-1). */
  seedAffinityWeight: number;
  /** Distinct cards in the finished pool. */
  distinctCardCount: number;
  /** Total copies in the finished pool. */
  totalCopies: number;
  /** How many cards earned a second copy. */
  doubledCardCount: number;
  /** The seed's strongest affinity partners that made it into the pool. */
  topPartnerCardNames: string[];
  /** Per-card provenance, keyed by card number (as a string). */
  cardProvenanceByNumber: Record<string, SeedCardProvenance>;
}

export interface ResolvedDreamcallerPackage {
  dreamcaller: DreamcallerContent;
  draftPoolCopiesByCard: Record<string, number>;
  dreamsignPoolIds: string[];
  mandatoryOnlyPoolSize: number;
  draftPoolSize: number;
  doubledCardCount: number;
  legalSubsetCount: number;
  preferredSubsetCount: number;
  /**
   * Card numbers of the idf3 starter deck the pool was grown from, resolved
   * against the run's name index. Excludes starter cards and unmapped names,
   * deduped in first-seen order. Optional during the V2 migration.
   */
  starterDecklistCardNumbers?: number[];
}
