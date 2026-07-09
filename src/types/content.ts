/**
 * Default starting essence used when a Dreamcaller record omits a tuned
 * value. Persistence helpers (see `normalizeQuestState`) also fall back to
 * this constant so RTDB-stripped rooms render with a sensible value.
 */
import type { PoolVariant } from "../draft/pool/types.ts";
import type { SiteType } from "./quest.ts";

export const DEFAULT_STARTING_ESSENCE = 200;

/** Normalized point locating a Dreamcaller's head in its portrait artwork. */
export interface DreamcallerPortraitFocus {
  /** Horizontal position from the artwork's left edge, in the range 0..1. */
  x: number;
  /** Vertical position from the artwork's top edge, in the range 0..1. */
  y: number;
}

export interface DreamcallerContent {
  id: string;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
  /** Authored head position shared by full-body and square portrait crops. */
  portraitFocus?: DreamcallerPortraitFocus;
  /**
   * Per-Dreamcaller starting essence, compensating for differences in opening
   * power and engine ramp speed. Defaults to `DEFAULT_STARTING_ESSENCE` when
   * omitted from source data.
   */
  startingEssence: number;
  /**
   * Card names that steer the `idf3` pool generator toward this Dreamcaller's
   * intended decks when building the run's draft package. Optional during the
   * V2 migration; absent for v1 records.
   */
  signatureCards?: string[];
  /**
   * Stable cards_v2 UUIDs for {@link signatureCards}, index-aligned. Lets a
   * consumer distinguish two cards that share a display name.
   */
  signatureCardIds?: string[];
}

export interface DreamsignTemplate {
  id: string;
  name: string;
  effectDescription: string;
  imageName?: string;
  imageAlt?: string;
}

/**
 * One dreamscape region of the Dream Atlas, sourced from dreamscapes.toml. The
 * starter dreamscape (`isStarter`) opens every run with a `fixedSites` sequence
 * and carries no guide or affiliation; every other dreamscape has a resident
 * `guideId` and a thematic `affiliationId`.
 *
 * `dreamcallerIds` lists the 3-4 Dreamcallers resident in this region (empty for
 * the starter). Across all dreamscapes these lists partition
 * dreamcallers_v2.toml: every non-starter Dreamcaller appears under exactly one
 * dreamscape, an invariant the asset build enforces.
 */
export interface DreamscapeContent {
  id: string;
  name: string;
  aesthetic: string;
  guideId: string | null;
  signatureSite: SiteType;
  affiliationId: string | null;
  siteIcon: string;
  isStarter: boolean;
  fixedSites?: SiteType[];
  dreamcallerIds: string[];
}

/**
 * A Dream Guide: the resident character of a non-starter dreamscape, sourced
 * from dream_guides.toml. The guide enhances `siteType` (their home
 * dreamscape's signature site); `homeSpecialty` describes that enhancement.
 */
export interface DreamGuideContent {
  id: string;
  name: string;
  homeDreamscapeId: string;
  siteType: SiteType;
  dialog: string[];
  homeSpecialty: string;
}

/**
 * One of Apollyon's ten incarnations, sourced from apollyon_incarnations.toml.
 * Atlas generation picks a single incarnation per run to present the boss node:
 * its `title` (epithet) and `description` (short deck summary) are surfaced in
 * the UI. `deckType` is design-reference metadata and is never displayed.
 */
export interface ApollyonIncarnationContent {
  id: string;
  title: string;
  description: string;
  deckType: string;
}

/**
 * A thematic affiliation backing a dreamscape, sourced from affiliations.toml.
 * `signatureCards` are curated cards_v2 UUIDs exemplifying the theme;
 * `weightStrength` and `opponentBiasStrength` tune how strongly later systems
 * pull draft content and opponent decks toward them.
 */
export interface AffiliationContent {
  id: string;
  name: string;
  signatureCards: string[];
  weightStrength: number;
  opponentBiasStrength: number;
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
 * Full provenance for one Dreamcaller's resolved affinity-grown pool, keyed by
 * card number. Produced by the family of variants that draw one random seed card
 * and grow a pool around it (`seed` plus the pick-record variants `pickfit`,
 * `pickearly`, `pickpos`, `pickchoice`). Records the seed card and how the pool
 * grew outward from it, so the "Why Cards" surface can explain what the initial
 * card was and how the pool reached its target size. Recomputed on demand from
 * the run seed and the pool corpus; never persisted.
 */
export interface SeedProvenanceSummary {
  /**
   * The pool-construction variant that grew this pool. Drives the player-facing
   * copy so the explanation matches the algorithm the run actually used (see
   * `seedProvenanceVariantCopy`).
   */
  variant: PoolVariant;
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

/** The role a tide plays in `tides4` pool construction. */
export type Tides4Role = "signature" | "facet" | "neutral";

/** Why a tide was joined into a `tides4` pool this run. */
export type Tides4TideSelection =
  | "starter"
  | "facet-drawn"
  | "facet-fill"
  | "neutral-fill";

/**
 * One tide that took part in a `tides4` run, resolved for the debug surface. The
 * Pool Viewer renders each as a separately viewable tide deck and the "Why Cards"
 * overlay names a card's source tide from these.
 */
export interface Tides4TideSummary {
  /** Stable tide id, e.g. "tide-sig-01" / "tide-fac-01" / "tide-neu-01". */
  id: string;
  /** Human-readable tide name. */
  name: string;
  /**
   * A narrative, thematic name for the tide shown on the player-facing screens
   * (Dreamcaller select, Pool Viewer, "Why Cards"), when the tide is annotated.
   */
  displayName?: string;
  /**
   * A 10-20 word player-facing description of what makes the tide distinctive,
   * shown in the tide hover popovers, when the tide is annotated.
   */
  displayDescription?: string;
  /** Whether the tide is a signature floor, a directional facet, or a broad tide. */
  role: Tides4Role;
  /** Why this tide was joined this run. */
  selection: Tides4TideSelection;
  /**
   * Whether the tide was folded into the pool. A run stops joining once a full
   * pool is dealable, so trailing fill tides can go unjoined; an unjoined tide
   * contributes no cards but is still shown so the candidate set is legible.
   */
  joined: boolean;
  /**
   * This tide's full decklist as card numbers that resolve in the catalog, in
   * deck order, deduped, with starter cards (never draftable) removed.
   */
  cardNumbers: number[];
  /** Distinct pooled cards whose home (earliest join-order) tide is this one. */
  contributedCardCount: number;
}

/** Per-card provenance within a `tides4` pool, resolved by card number. */
export interface Tides4CardProvenance {
  /** Copies of this card in the pool (1 or 2). */
  copies: number;
  /** Joined tide ids that contain this card, in join order. */
  tideIds: string[];
  /** The earliest joined tide (in join order) that contains this card — its home tide. */
  primaryTideId: string;
}

/**
 * Full provenance for one Dreamcaller's resolved `tides4` pool, keyed by card
 * number. Records the tides the pool combined — the always-joined signature
 * tide, the random subset of theme tides, and the broad tail — and which tide
 * each pooled card came from, so the Pool Viewer can show every individual tide
 * deck and the "Why Cards" surface can explain why each offered card is in the
 * pool. Recomputed on demand from the run seed and the tide artifact; never
 * persisted.
 */
export interface Tides4ProvenanceSummary {
  /** The Dreamcaller this pool was built for. */
  dreamcallerId: string;
  /**
   * Whether the Dreamcaller has no signature. A signatureless Dreamcaller borrows
   * a random signatured Dreamcaller's whole pool, leaning a coherent archetype.
   */
  signatureless: boolean;
  /**
   * For a signatureless Dreamcaller, the name of the borrowed signature tide (the
   * archetype it leaned this run); null for a signatured Dreamcaller.
   */
  borrowedArchetypeName: string | null;
  /** Total copies dealt into the pool. */
  dealSize: number;
  /** Max copies of any single card (the 2-copy rule). */
  cap: number;
  /** How many facet (theme) tides were drawn in the random variety subset. */
  facetDrawnCount: number;
  /** How many facet tides were available to draw the subset from. */
  facetAvailableCount: number;
  /**
   * Every tide that took part in the run, in join order: the starter (when
   * present), the drawn facets, then the fill (undrawn facets and broad tides).
   */
  tides: Tides4TideSummary[];
  /** Per-card provenance, keyed by card number (as a string). */
  cardProvenanceByNumber: Record<string, Tides4CardProvenance>;
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
