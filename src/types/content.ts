/**
 * Default starting essence used when a DreamAvatar record omits a tuned
 * value. Persistence helpers (see `normalizeJourneyState`) also fall back to
 * this constant so RTDB-stripped rooms render with a sensible value.
 */
import type { SiteType } from "./journey.ts";
import type { Rarity } from "./cards.ts";
import type { CardId, CardName } from "./card-identity";
import type { GuideId } from "./identifiers";
import type { DreamAvatarId } from "./identifiers";
import type { DreamscapeId } from "./identifiers";
import type {
  AffiliationId,
  ApollyonIncarnationId,
  DreamsignId,
  TideId,
} from "./identifiers";

/** Normalized point locating a DreamAvatar's head in its portrait artwork. */
export interface DreamAvatarPortraitFocus {
  /** Horizontal position from the artwork's left edge, in the range 0..1. */
  x: number;
  /** Vertical position from the artwork's top edge, in the range 0..1. */
  y: number;
}

export interface DreamAvatarContent {
  id: DreamAvatarId;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
  /** Authored head position shared by full-body and square portrait crops. */
  portraitFocus?: DreamAvatarPortraitFocus;
  /**
   * Per-DreamAvatar starting essence, compensating for differences in opening
   * power and engine ramp speed. The economy catalog supplies the default when
   * omitted from source data.
   */
  startingEssence: number;
  /**
   * Display names corresponding to the avatar's authored signature card UUIDs.
   */
  signatureCards?: CardName[];
  /**
   * Stable cards_v2 UUIDs for {@link signatureCards}, index-aligned. Lets a
   * consumer distinguish two cards that share a display name.
   */
  signatureCardIds?: CardId[];
}

export interface DreamsignTemplate {
  id: DreamsignId;
  name: string;
  effectDescription: string;
  imageName?: string;
  imageAlt?: string;
  /** Canonical catalog entries always provide strength rarity. */
  rarity?: Extract<Rarity, "Common" | "Uncommon" | "Rare" | "Legendary">;
  /** Canonical catalog entries provide one to three tide UUIDs. */
  tideIds?: readonly TideId[];
  tags?: readonly string[];
}

/**
 * One dreamscape region of the Dream Atlas, sourced from dreamscapes.toml. The
 * starter dreamscape (`isStarter`) opens every run with a `fixedSites` sequence
 * and carries no guide or affiliation; every other dreamscape has a resident
 * `guideId` and a thematic `affiliationId`.
 *
 * `dreamAvatarIds` lists the 3-4 DreamAvatars resident in this region (empty for
 * the starter). Across all dreamscapes these lists partition
 * dream_avatars.toml: every non-starter DreamAvatar appears under exactly one
 * dreamscape, an invariant the asset build enforces.
 */
export interface DreamscapeContent {
  id: DreamscapeId;
  name: string;
  guideId: GuideId | null;
  signatureSite: SiteType;
  affiliationId: AffiliationId | null;
  isStarter: boolean;
  fixedSites?: SiteType[];
  dreamAvatarIds: DreamAvatarId[];
}

/**
 * A Dream Guide: the resident character of a non-starter dreamscape, sourced
 * from the generated Dream Guide catalog. The guide enhances `siteType` (their home
 * dreamscape's signature site); `homeSpecialty` describes that enhancement.
 */
export interface DreamGuideContent {
  id: GuideId;
  name: string;
  homeDreamscapeId: DreamscapeId;
  siteType: SiteType;
  portraitSource: string;
  dialogue: Readonly<
    Record<
      string,
      readonly import("../runtime/localization/runtime").SourceTransport[]
    >
  >;
  homeSpecialty: string;
}

/** Versioned canonical Dream Guide catalog emitted by the asset compiler. */
export interface DreamGuidesData {
  schemaVersion: 1;
  contentHash: string;
  guides: readonly DreamGuideContent[];
}

/**
 * One of Apollyon's ten incarnations, loaded from the generated
 * apollyon_incarnations.toml compatibility projection.
 * Atlas generation picks a single incarnation per run to present the boss node:
 * its `title` (epithet) and `description` (short deck summary) are surfaced in
 * the UI. `deckType` is design-reference metadata and is never displayed.
 */
export interface ApollyonIncarnationContent {
  id: ApollyonIncarnationId;
  title: string;
  description: string;
  deckType: string;
}

/**
 * A thematic affiliation backing a dreamscape, sourced from affiliations.toml.
 * `tideIds` are the three authored tides that define the affiliation's theme.
 */
export interface AffiliationContent {
  id: AffiliationId;
  name: string;
  atlasCardTheme: string;
  tideIds: TideId[];
}

/** The role a tide plays in `tides4` pool construction. */
export type Tides4Role = "signature" | "facet" | "neutral";

/** Why a tide was joined into a `tides4` pool this run. */
export type Tides4TideSelection =
  "starter" | "facet-drawn" | "facet-fill" | "neutral-fill";

/**
 * One tide that took part in a `tides4` run, resolved for the debug surface. The
 * Pool Viewer renders each as a separately viewable tide deck and the "Why Cards"
 * overlay names a card's source tide from these.
 */
export interface Tides4TideSummary {
  /** Stable tide UUIDv4. */
  id: TideId;
  /** Narrative, thematic name shown on player-facing screens. */
  displayName: string;
  /** Player-facing description of what makes the tide distinctive. */
  displayDescription: string;
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
  tideIds: TideId[];
  /** The earliest joined tide (in join order) that contains this card — its home tide. */
  primaryTideId: TideId;
}

/**
 * Full provenance for one DreamAvatar's resolved `tides4` pool, keyed by card
 * number. Records the tides the pool combined — the always-joined signature
 * tide, the random subset of theme tides, and the broad tail — and which tide
 * each pooled card came from, so the Pool Viewer can show every individual tide
 * deck and the "Why Cards" surface can explain why each offered card is in the
 * pool. Recomputed on demand from the run seed and the tide artifact; never
 * persisted.
 */
export interface Tides4ProvenanceSummary {
  /** The DreamAvatar this pool was built for. */
  dreamAvatarId: DreamAvatarId;
  /**
   * Whether the DreamAvatar has no signature. A signatureless DreamAvatar borrows
   * a random signatured DreamAvatar's whole pool, leaning a coherent archetype.
   */
  signatureless: boolean;
  /**
   * For a signatureless DreamAvatar, the name of the borrowed signature tide (the
   * archetype it leaned this run); null for a signatured DreamAvatar.
   */
  borrowedArchetypeName: string | null;
  /** Total copies dealt into the pool. */
  dealSize: number;
  /** Max copies of any single card (the 2-copy rule). */
  cap: number;
  /** Maximum number of facets eligible for the random subset draw. */
  maxFacets: number;
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

export interface ResolvedDreamAvatarPackage {
  dreamAvatar: DreamAvatarContent;
  /** Joined tide UUIDs for this run, persisted for reconstructable affinity selection. */
  joinedTideIds?: TideId[];
  draftPoolCopiesByCard: Record<string, number>;
  /**
   * Exact early offers keyed by their 1-indexed journey pick. Authored flows
   * can use this to teach with a stable opening before ordinary pool sampling.
   */
  openingDraftOffers?: Record<string, number[]>;
  /**
   * Dreamsign UUIDs guaranteed to appear in the opening Revelation offer.
   * Authored tutorial flows use this to establish the run's theme while the
   * remaining offer slots continue to draw from the shared pool.
   */
  openingDreamsignOfferIds?: DreamsignId[];
  dreamsignPoolIds: DreamsignId[];
  mandatoryOnlyPoolSize: number;
  draftPoolSize: number;
  doubledCardCount: number;
  legalSubsetCount: number;
  preferredSubsetCount: number;
}
