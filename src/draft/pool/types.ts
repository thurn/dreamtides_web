// Shared public and internal types for the pool generator.

import type { AffinityCorpus } from "./affinity-grower.ts";
import type { TideDecksJson } from "./tides-io.ts";
import type { TideRelationshipsJson } from "./tide-relationships-io.ts";
import type { Tides3DecksJson } from "./tides3-io.ts";
import type { Tides4DecksJson, Tides4Role } from "./tides4-io.ts";
import type { Tides5DecksJson } from "./tides5-io.ts";

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
  | "idf"
  | "idf2"
  | "idf3"
  | "idf4"
  | "seed"
  | "pickfit"
  | "pickearly"
  | "pickpos"
  | "pickchoice"
  | "pickcohere"
  | "picksig"
  | "sigseed"
  | "embedded"
  | "tides"
  | "tides2"
  | "tides3"
  | "tides4"
  | "tides5";
// The quest prototype and the draft test harness use this when `?algo=` is
// absent. An unrecognised `?algo=` value is a hard error, not a fall-through to
// this default.
export const DEFAULT_POOL_VARIANT: PoolVariant = "tides4";

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
   * Mechanic-archetype tides for the experimental cards_v2 pool. Supplied from
   * `cards-v2-metadata.ts`; absent on runtime catalog cards, where the
   * tide-derived archetype lists are unused.
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
  /**
   * Cards flagged `core:true`, keyed by stable UUID (when available) or
   * display name (synthetic / test cards with no `id`). These seed every pool.
   */
  core: Set<string>;
  /**
   * Mechanic-archetype tide slugs → the set of cards in that archetype, each
   * card keyed by UUID (or display name for test cards). Populated by
   * `cards-v2-metadata.ts`; empty for runtime catalog cards.
   */
  archLists: Map<string, Set<string>>;
  /**
   * Color-combo and color+archetype list keys → the set of cards in that
   * list, each card keyed by UUID (or display name for test cards).
   */
  draftLists: Map<string, Set<string>>;
  /**
   * Real per-deck card lists used by the `decklists`, `idf`, `idf2`, and `idf3`
   * variants: each seat's mainboard from the adapted draft records
   * (`docs/draft_records_adapted`). Optional because the theme-based variants and
   * the Node tooling do not need them; when absent the `decklists` variant falls
   * back to the `default` algorithm.
   */
  decklists?: readonly (readonly string[])[];
  /**
   * The same per-seat decklists as {@link decklists}, but keyed on each card's
   * stable cards_v2 UUID (lowercased) instead of its current display name. The
   * IDF-cosine pool engine (`idf`/`idf2`/`idf3`/`idf4`) and the affiliation
   * reweighting build their corpus from this id-keyed source so two distinct
   * cards that share a display name stay distinct in document-frequency and
   * affinity scoring (24 cards_v2 cards share a name with another). The engine
   * resolves these UUIDs back to display names through {@link cardNameById} for
   * its name-keyed outputs (the pool counts and the idf3 provenance summary).
   * Falls back to {@link decklists} when absent (synthetic / test corpora keyed
   * by opaque strings), so a corpus with no UUID source still scores correctly.
   */
  decklistIds?: readonly (readonly string[])[];
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
   * A prebuilt affinity corpus the `embedded` variant grows from, reconstructed
   * from the committed corpus (`data/affinity_corpus.jsonc`, served as
   * `/affinity-corpus-data.json`) rather than rebuilt from {@link draftRecords}.
   * When set, the `embedded` variant reads it directly; the record-derived
   * variants ignore it and keep building their corpus from `draftRecords`, so
   * setting it never changes any other variant's pools. Absent for every variant
   * but `embedded`.
   */
  affinityCorpus?: AffinityCorpus;
  /**
   * The committed tide-deck artifact the `tides` variant combines into pools
   * (`data/tides.jsonc`, served as `/tides-data.json`): 32 preconstructed decks
   * keyed by cards_v2 UUID, mapped back to current names via
   * {@link cardNameById} at generation time. Set only when the run's variant is
   * `tides`; every other variant ignores it.
   */
  tideDecks?: TideDecksJson;
  /**
   * The committed tide-deck artifact the `tides2` variant combines into pools
   * (`data/tides2.jsonc`, served as `/tides2-data.json`): the same schema as
   * {@link tideDecks}, baked with smaller, purer tides so an affinity-selected
   * pool concentrates on a coherent archetype. Set only when the run's variant
   * is `tides2`; every other variant ignores it.
   */
  tides2Decks?: TideDecksJson;
  /**
   * The committed tide-relationship artifact the `tides2` variant steers
   * selection by (`data/tides2_relationships.jsonc`, served as
   * `/tides2-relationships-data.json`): each tide's allied tides and each
   * Dreamcaller's tide pool, keyed by tide id and Dreamcaller UUID. Set
   * alongside {@link tides2Decks} only when the run's variant is `tides2`.
   */
  tides2Relationships?: TideRelationshipsJson;
  /**
   * The committed `tides3` artifact the `tides3` variant combines into pools
   * (`data/tides3.jsonc`, served as `/tides3-data.json`): 32 preconstructed
   * decks — each signatured Dreamcaller's full-signature `sigseed` pool plus
   * broad neutral tides — and the per-Dreamcaller tide pools that say which
   * tides combine for each Dreamcaller. Set only when the run's variant is
   * `tides3`; every other variant ignores it.
   */
  tides3Decks?: Tides3DecksJson;
  /**
   * The committed `tides4` artifact the `tides4` variant combines into pools
   * (`data/tides4.jsonc`, served as `/tides4-data.json`): preconstructed
   * signature, facet, and neutral tides plus the per-Dreamcaller tide pools that
   * say which tides combine for each Dreamcaller. Set only when the run's variant
   * is `tides4`; every other variant ignores it.
   */
  tides4Decks?: Tides4DecksJson;
  /**
   * The committed `tides5` artifact the `tides5` variant combines into pools
   * (`data/tides5.jsonc`, served as `/tides5-data.json`): the same kind of
   * signature, facet, and neutral tides plus per-Dreamcaller tide pools as
   * `tides4`, but baked only from the known-good decklists. Set only when the
   * run's variant is `tides5`; every other variant ignores it.
   */
  tides5Decks?: Tides5DecksJson;
  /**
   * Current display name -> stable cards_v2 UUID, built from the card records
   * in {@link buildPoolData} when they carry an `id`. The `seed` variant reads
   * it to translate the name-keyed decklist corpus into UUID identity space;
   * absent when no source card carries an `id`.
   */
  cardIdByName?: Map<string, string>;
  /**
   * Stable cards_v2 UUID -> current display name, the inverse of
   * {@link cardIdByName}. The `seed`, `idf3`, `decklists`, and related
   * variants read it to map UUID-keyed pool results back onto display names
   * for the downstream name→card-number resolution; absent when no source
   * card carries an `id`.
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
 * Full provenance for one generated `idf3` pool, keyed by corpus card key
 * (UUID in production, opaque string in synthetic corpora). Records the whole
 * chain — signature -> anchors -> starter -> grown neighbours — so a debug
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
  /**
   * Per-card provenance, keyed by corpus card key (UUID in production, opaque
   * string in synthetic/test corpora). Distinct UUIDs that share a display name
   * keep separate entries here so no same-name card is silently dropped. The
   * downstream resolver (`buildDreamcallerProvenance`) converts these keys to
   * card numbers via the id index, resolving display names only at the final
   * render boundary.
   */
  cardProvenanceById: Record<string, Idf3PoolCardProvenance>;
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

/**
 * Why a tide was joined into a `tides4` pool this run:
 *   * `starter` — the Dreamcaller's signature tide, the always-joined identity
 *     floor (for a signatureless Dreamcaller, the borrowed archetype's signature);
 *   * `facet-drawn` — a theme tide drawn in the random variety subset, the
 *     variety engine that leans the identity a different way each run;
 *   * `facet-fill` — an on-identity theme tide NOT in the drawn subset, joined
 *     only to top the pool up after the starter and drawn facets fall short;
 *   * `neutral-fill` — a broad, format-spanning tide joined to top the pool up.
 */
export type Tides4PoolTideSelection =
  | "starter"
  | "facet-drawn"
  | "facet-fill"
  | "neutral-fill";

/** One tide that took part in a `tides4` run, summarised for the debug surface. */
export interface Tides4PoolTide {
  /** Stable tide id, e.g. "tide-sig-01" / "tide-fac-01" / "tide-neu-01". */
  id: string;
  /** Human-readable tide name. */
  name: string;
  /** A narrative, thematic name for the tide (player-facing), when annotated. */
  displayName?: string;
  /** A 10-20 word player-facing description of the tide, when annotated. */
  displayDescription?: string;
  /** Whether the tide is a signature floor, a directional facet, or a broad tide. */
  role: Tides4Role;
  /** Why this tide was joined this run. */
  selection: Tides4PoolTideSelection;
  /**
   * Whether the tide was actually folded into the bag. A run stops joining tides
   * once a full pool is dealable, so trailing fill tides in the selection order
   * can go unjoined; only joined tides contribute cards.
   */
  joined: boolean;
  /** This tide's full decklist as card names that resolve in the catalog, in deck order. */
  cardNames: string[];
  /** Distinct pool cards whose earliest (join-order) source tide is this one. */
  contributedCardCount: number;
}

/** Per-card provenance within a `tides4` pool, keyed by card name. */
export interface Tides4PoolCardProvenance {
  /** Copies of this card in the pool (1 or 2). */
  copies: number;
  /** Joined tide ids that contain this card, in join order. */
  tideIds: string[];
  /** The earliest joined tide (in join order) that contains this card — its "home" tide. */
  primaryTideId: string;
}

/**
 * Full provenance for one generated `tides4` pool, keyed by card name. Records
 * the tides the pool combined — the always-joined signature tide, the random
 * subset of theme tides, and the broad tail — and which tide each pooled card
 * came from, so a debug surface can show every individual tide deck and explain
 * why each offered card is in the pool. Only the `tides4` variant produces this;
 * the field is absent on every other variant's result.
 */
export interface Tides4PoolProvenance {
  /** The Dreamcaller this pool was built for. */
  dreamcallerId: string;
  /**
   * Whether the Dreamcaller has no signature. A signatureless Dreamcaller borrows
   * a random signatured Dreamcaller's whole pool, leaning a coherent archetype.
   */
  signatureless: boolean;
  /**
   * For a signatureless Dreamcaller, the name of the borrowed signature tide
   * (the archetype it leaned this run); null for a signatured Dreamcaller.
   */
  borrowedArchetypeName: string | null;
  /** Total copies dealt into the pool (`TIDES4.dealSize`). */
  dealSize: number;
  /** Max copies of any single card (`TIDES4.cap`, the 2-copy rule). */
  cap: number;
  /** How many facet (theme) tides were drawn in the random variety subset. */
  facetDrawnCount: number;
  /** How many facet tides were available to draw the subset from. */
  facetAvailableCount: number;
  /**
   * Every tide that took part in the run, in join order: the starter (when
   * present), the drawn facets, then the fill (undrawn facets and broad tides).
   */
  tides: Tides4PoolTide[];
  /** Per-card provenance for the dealt pool, keyed by card name. */
  cardProvenanceByName: Record<string, Tides4PoolCardProvenance>;
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
  /**
   * Full tide provenance for the run, set only by the `tides4` variant. The Pool
   * Viewer reads it to show each individual tide deck and the construction story;
   * the "Why Cards" surface reads it to explain which tide each card came from.
   * Undefined for other variants.
   */
  tides4Provenance?: Tides4PoolProvenance;
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
  /**
   * Full tide provenance, set only by the `tides4` variant; threaded straight
   * onto {@link GeneratedPool}. Undefined for other variants.
   */
  tides4Provenance?: Tides4PoolProvenance;
}
