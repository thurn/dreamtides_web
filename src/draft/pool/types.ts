// Shared public and internal types for the pool generator.

// `color_pool` is the original color-identity algorithm. `diverse` is an
// experimental variant tuned to spread cards and archetypes more evenly across
// pools (see `docs/cards2/draft_pool_algorithms.md`). Each id names a
// {@link PoolStrategy} registered in `registry.ts`; the variants are selectable
// side by side via the `variant` argument and the `?algo=` URL parameter (which
// drives both the quest prototype and the draft test harness). To make a variant
// the primary one, change `DEFAULT_POOL_VARIANT`; to retire one, remove its id
// here and its `registry.ts` entry, then delete its module.
export type PoolVariant =
  | "color_pool"
  | "diverse"
  | "decklists"
  | "merged"
  | "idf"
  | "idf2"
  | "idf3";
// The quest prototype and the draft test harness both fall back to this when
// `?algo=` is absent or unrecognised.
export const DEFAULT_POOL_VARIANT: PoolVariant = "idf3";

/** The card fields the pool generator reads. `CardData` satisfies this shape. */
export interface PoolCard {
  name: string;
  /**
   * Mechanic-archetype tides for the experimental cards_v2 pool. Supplied by the
   * `draft_test` experiment harness from `cards-v2-metadata.ts`; absent on
   * runtime catalog cards, where the tide-derived archetype lists are unused.
   */
  tides?: readonly string[];
  core?: boolean;
  colors?: readonly string[];
  draftArchetypes?: readonly string[];
}

/** The generator's reconstructed inputs. */
export interface PoolData {
  core: Set<string>;
  archLists: Map<string, Set<string>>;
  draftLists: Map<string, Set<string>>;
  /**
   * Real per-deck card lists used by the `decklists` variant. Optional because
   * the theme-based variants and the Node tooling do not need them; when absent
   * the `decklists` variant falls back to the `default` algorithm.
   */
  decklists?: readonly (readonly string[])[];
  /**
   * Merged archetype lists used by the `merged` variant: archetype label (e.g.
   * `br-aristocrats`) -> the cards that recur across that archetype's real
   * decks. Built offline by `scripts/setup-assets.mjs`. Optional because the
   * other variants and the Node tooling do not need them; when absent the
   * `merged` variant falls back to the `default` algorithm.
   */
  mergedLists?: Map<string, Set<string>>;
}

/**
 * One real decklist that the `idf3` grower folded into the pool, summarised for
 * the provenance debug surface. `distinctiveCardNames` are the deck's highest
 * IDF-weight (most archetype-defining) card names, so a reader can recognise
 * "what kind of deck this is" at a glance.
 */
export interface Idf3PoolSourceDeck {
  /** 0 for the starter deck, then 1, 2, ... for each nearer-to-farther neighbour. */
  rank: number;
  /** IDF-cosine similarity of this deck to the starter (1 for the starter itself). */
  similarityToStarter: number;
  /** Highest IDF-weight card names in this deck, most distinctive first. */
  distinctiveCardNames: string[];
  /** How many pooled cards name this deck as their nearest source. */
  contributedCardCount: number;
}

/** One anchor deck the signature located, summarised for the debug surface. */
export interface Idf3PoolAnchor {
  /** Probe-cosine similarity of this real deck to the signature. */
  similarityToSignature: number;
  /** Highest IDF-weight card names in the anchor deck, most distinctive first. */
  distinctiveCardNames: string[];
}

/** Per-card provenance within an `idf3` pool, keyed by card name. */
export interface Idf3PoolCardProvenance {
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
 * Full provenance for one generated `idf3` pool, keyed by card name. Records the
 * whole chain — signature -> anchors -> starter -> grown neighbours — so a debug
 * surface can explain why each card is in the pool. Only the `idf3` variant
 * produces this; the field is absent on every other variant's result.
 */
export interface Idf3PoolProvenance {
  /** The Dreamcaller's raw signature card names. */
  signatureCardNames: string[];
  /** Signature cards that carry IDF weight in the corpus (the actual probe). */
  signatureWeightedNames: string[];
  /** Signature cards dropped because they are absent or carry no IDF weight. */
  signatureDroppedNames: string[];
  /** The anchor decks the signature located, most similar first. */
  anchors: Idf3PoolAnchor[];
  /** Highest IDF-weight card names in the starter deck, most distinctive first. */
  starterDistinctiveCardNames: string[];
  /** Number of distinct cards in the starter deck. */
  starterCardCount: number;
  /** Every deck folded into the pool, starter first then nearest-to-farthest. */
  sourceDecks: Idf3PoolSourceDeck[];
  /** Per-card provenance, keyed by card name. */
  cardProvenanceByName: Record<string, Idf3PoolCardProvenance>;
}

/** Result of one pool generation. */
export interface GeneratedPool {
  /** Chosen color identity as ordered w/u/b/r/g letters, e.g. "ubr". */
  identity: string;
  /** Selected theme labels, e.g. "A:storm" or "D:ur-welder". */
  themes: string[];
  /** Card name -> copy count (1 or 2). */
  counts: Map<string, number>;
  /** Seed used for this run, so a pool can be reproduced. */
  seed: number;
  /** Total copies in the pool (sum of counts, each capped at 2). */
  size: number;
  /** Which generation variant produced this pool. */
  variant: PoolVariant;
  /**
   * The single real decklist the `idf3` variant chose as this run's starter —
   * the anchor deck the pool was grown from. Empty for variants that do not
   * select a starter deck.
   */
  starterDeck?: readonly string[];
  /**
   * Full per-card provenance for the run, set only by the `idf3` variant. The
   * provenance debug surface ("Why Cards") reads it to explain how each card
   * descends from the Dreamcaller's signature. Undefined for other variants.
   */
  idf3Provenance?: Idf3PoolProvenance;
}

/**
 * The raw output every variant generator returns before {@link GeneratedPool}
 * is assembled in `generate.ts`: the chosen color set, the theme/label list, and
 * the uncapped copy counts.
 */
export interface VariantResult {
  C: Set<string>;
  selected: string[];
  counts: Map<string, number>;
  /**
   * The real decklist this variant chose as the run's starter, if any. Only the
   * `idf3` variant sets it (its grown-from anchor deck); other variants leave it
   * undefined and `generate.ts` defaults the public field to `[]`.
   */
  starterDeck?: readonly string[];
  /**
   * Full per-card provenance, set only by the `idf3` variant; threaded straight
   * onto {@link GeneratedPool}. Undefined for other variants.
   */
  idf3Provenance?: Idf3PoolProvenance;
}
