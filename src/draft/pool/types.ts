// Shared public and internal types for the pool generator.

// `default` is the original color-identity algorithm. `diverse` is an
// experimental variant tuned to spread cards and archetypes more evenly across
// pools (see `docs/cards2/draft_pool_algorithms.md`). The variants are
// selectable side by side via the `variant` argument and the draft test `?algo=`
// URL parameter. To make a variant the primary one, change
// `DEFAULT_POOL_VARIANT`; to retire one, delete its module and the corresponding
// branch in `generate.ts`.
export type PoolVariant =
  | "default"
  | "diverse"
  | "decklists"
  | "merged"
  | "idf"
  | "idf2"
  | "idf3";
export const DEFAULT_POOL_VARIANT: PoolVariant = "default";

/** The card fields the pool generator reads. `CardData` satisfies this shape. */
export interface PoolCard {
  name: string;
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
}
