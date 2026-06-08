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
  | "idf3"
  | "idf4"
  | "idf_human"
  | "seed"
  | "pickfit"
  | "pickearly"
  | "pickpos"
  | "pickchoice"
  | "pickcohere";
// The quest prototype and the draft test harness use this when `?algo=` is
// absent. An unrecognised `?algo=` value is a hard error, not a fall-through to
// this default.
export const DEFAULT_POOL_VARIANT: PoolVariant = "idf3";

/**
 * Throw because a pool variant cannot build a pool: its required source data
 * (a draft-record corpus, a decklist corpus, etc.) is missing. Pool generation
 * does not silently degrade to the random color pool — a missing corpus is a
 * configuration error (for example the draft records were never fetched), and
 * quietly substituting an unrelated pool hides it. `detail` names the missing
 * input.
 */
export function missingPoolData(variant: string, detail: string): never {
  throw new Error(
    `Pool variant "${variant}" cannot build a pool: ${detail}. Pool generation ` +
      `does not fall back to the random color pool; supply the missing data or ` +
      `choose a different ?algo=.`,
  );
}

/** The card fields the pool generator reads. `CardData` satisfies this shape. */
export interface PoolCard {
  name: string;
  /**
   * The stable cards_v2 UUID. Present on runtime catalog cards (`CardData`) and
   * used by the `seed` variant as the rename-proof card identity; absent on the
   * synthetic cards some experiments and tests build, where the `seed` variant
   * falls back to keying by name.
   */
  id?: string;
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

/**
 * One real draft seat's pick trajectory, the minimal slice the `pickfit` variant
 * needs from a bundled draft record: `packs[i]` is the full set of cards offered
 * at pick `i` (what was available), `picks[i]` is the card(s) the human actually
 * took at that pick (0–3 cards), aligned index-for-index with `packs`. The pair
 * captures the taken-over-passed signal decklists cannot. Cards are identified by
 * their stable cards_v2 UUID (the bundle's `packIds`/`pickIds`), so the variant is
 * unaffected by card renames.
 */
export interface PickRecord {
  packs: readonly (readonly string[])[];
  picks: readonly (readonly string[])[];
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
   * Real per-deck card lists drawn from the human Cube Cobra draft records
   * (`docs/human_drafts_anon`) used by the `idf_human` variant, which runs the
   * `idf3` algorithm over this corpus instead of {@link decklists}. Optional for
   * the same reasons as `decklists`; when absent the `idf_human` variant falls
   * back to the `default` algorithm.
   */
  humanDecklists?: readonly (readonly string[])[];
  /**
   * Merged archetype lists used by the `merged` variant: archetype label (e.g.
   * `br-aristocrats`) -> the cards that recur across that archetype's real
   * decks. Built offline by `scripts/setup-assets.mjs`. Optional because the
   * other variants and the Node tooling do not need them; when absent the
   * `merged` variant falls back to the `default` algorithm.
   */
  mergedLists?: Map<string, Set<string>>;
  /**
   * Real draft pick trajectories drawn from the adapted draft records
   * (`docs/draft_records_adapted`) used by the `pickfit` variant, which grows a
   * pool from an availability-corrected pick-rate prior and a behavioural synergy
   * affinity instead of decklist co-occurrence. Optional for the same reasons as
   * {@link decklists}; when absent the `pickfit` variant falls back to the
   * `default` algorithm.
   */
  draftRecords?: readonly PickRecord[];
  /**
   * Current display name -> stable cards_v2 UUID, built from the card records in
   * {@link buildPoolData} when they carry an `id`. The `seed` variant reads it to
   * translate the name-keyed decklist corpus into its rename-proof UUID identity
   * space; absent when no source card carries an `id`.
   */
  cardIdByName?: Map<string, string>;
  /**
   * Stable cards_v2 UUID -> current display name, the inverse of
   * {@link cardIdByName}. The `seed` variant reads it to map its UUID-keyed
   * results back onto current names for the downstream name→card-number
   * resolution; absent when no source card carries an `id`.
   */
  cardNameById?: Map<string, string>;
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

/**
 * Per-card provenance within a `seed` pool, keyed by card name. Records how and
 * when each card entered the pool that grew outward from the single drawn seed
 * card, so a debug surface can explain why each card is present.
 */
export interface SeedPoolCardProvenance {
  /** Whether this is the randomly drawn seed card the pool grew from. */
  isSeed: boolean;
  /** Copies of this card in the pool (1 or 2). */
  copies: number;
  /** Order this card joined the pool (0 = the seed, then 1, 2, ... in growth order). */
  addOrder: number;
  /** Normalised affinity (0-1) of this card to the seed card. */
  seedAffinity: number;
  /** Normalised affinity (0-1) of this card to the pool at the moment it joined. */
  poolAffinity: number;
  /** Blended seed/pool/prior score this card was admitted on (the seed is 1). */
  blendedScore: number;
}

/**
 * Full provenance for one generated `seed` pool, keyed by card name. Records the
 * seed card, the blend used, and per-card growth detail so a debug surface can
 * explain what the initial card was and how the pool grew to its target size.
 * Only the `seed` variant produces this; the field is absent on every other
 * variant's result.
 */
export interface SeedPoolProvenance {
  /** The card drawn uniformly at random that seeded the whole pool. */
  seedCardName: string;
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
  /** Per-card provenance, keyed by card name. */
  cardProvenanceByName: Record<string, SeedPoolCardProvenance>;
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
  /**
   * Full per-card provenance for the run, set only by the `seed` variant. The
   * "Why Cards" surface reads it to explain the random seed card and how the pool
   * grew around it. Undefined for other variants.
   */
  seedProvenance?: SeedPoolProvenance;
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
  /**
   * Full per-card provenance, set only by the `seed` variant; threaded straight
   * onto {@link GeneratedPool}. Undefined for other variants.
   */
  seedProvenance?: SeedPoolProvenance;
}
