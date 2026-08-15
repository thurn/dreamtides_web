import type {
  AvatarPortraitFocus,
  ResolvedAvatarPackage,
} from "./content";
import type { CardData, CardType } from "./cards";
import type {
  RewardCardPredicate,
  RewardMechanicId,
  RewardSelectionPolicyId,
  RewardSelectionTrace,
  SelectionRulesVersion,
} from "../reward-selection/types";
import type { AuguryEncounter } from "../journey_v2/types";
import type { FourSuitRepriseOutcome } from "../data/four-suit-reprise";
import type { DraftState } from "./draft";
import type { LayerName } from "./layer-name";
import type {
  GambleGameId,
  GravokGateId,
  StandardPlayingCard,
  StarwayStairsTierNumber,
  TidemarkLadderClimbAttemptNumber,
} from "./gamble";
import type { RandomSiteDestinationType, SiteType } from "./site-type";
import type { ExplorationMultiCardTransfigurationPreparation } from "../exploration/multi-card-transfiguration-plan";
import type { MultiCardReplacementPreparation } from "../exploration/multi-card-replacement-plan";
import type { ExplorationRandomDeckTargetPreparation } from "../exploration/random-deck-target-plan";
import type { ExplorationDisclosedDeckTargetPreparation } from "../exploration/disclosed-deck-target-plan";
import type { ExplorationCompoundActionPreparation } from "../exploration/compound-action-plan";
import type {
  ExplorationChoosableSiteType,
  ExplorationFixedSiteType,
} from "../data/exploration";
import type { CardId, CardSubtype } from "./card-identity";
import type { JourneyMutationSource } from "./journey-source";
import type { JourneySeed } from "./journey-seed";
import type { StableDigest } from "./stable-digest";
import type { SelectionContentRevision } from "./selection-content-revision";
import type {
  AtlasNodeId,
  ApollyonIncarnationId,
  BattleId,
  CardTypeChangePredicateId,
  DeckEntryId,
  AvatarId,
  DreamscapeId,
  DreamsignId,
  ExplorationActionId,
  GuideId,
  IdentityRecord,
  JourneyId,
  ShuffleCommitment,
  SelectionKey,
  SiteId,
  AuguryArchetypeId,
} from "./identifiers";
export type { SiteType } from "./site-type";
export type { RandomSiteDestinationType } from "./site-type";
export type { AtlasData } from "./atlas-data";

/** Badge applied to a card via a Transfiguration site. */
export type TransfigurationType =
  | "Empowered"
  | "Amplified"
  | "Kindled"
  | "Inspired"
  | "Enduring"
  | "Hastened"
  | "Resonant"
  | "Attuned"
  | "Perfected";

/** The locale-neutral change shown by a transfiguration offer. */
export type TransfigurationChange =
  | { kind: "energy-delta"; from: number; to: number }
  | { kind: "spark-delta"; from: number; to: number }
  | { kind: "added-draw" }
  | { kind: "added-reclaim" }
  | { kind: "added-fast" }
  | { kind: "amplified-rules"; rulesText: string }
  | { kind: "widened-trigger" }
  | { kind: "reduced-activated-cost"; amount: number }
  | { kind: "all-available" };

/** Persistent card type/subtype override applied to one concrete deck entry. */
export interface CardTypeChange {
  predicateId: CardTypeChangePredicateId;
  cardType: CardType;
  subtype: CardSubtype;
  label: string;
}

/** Persistent keyword overrides applied to one concrete deck entry. */
export interface CardKeywordModification {
  fast?: boolean;
  /** Persistent additive reduction applied to the resolved energy cost. */
  energyCostReduction?: number;
  /** Added Reclaim cost. Repeated grants add to this value. */
  reclaim?: number;
  /** Exact Reclaim cost override for one concrete deck entry. */
  setReclaim?: number;
}

/** Persistent card modifications applied to one concrete deck entry. */
export interface DeckEntryCardModification {
  typeChange?: CardTypeChange | null;
  keywords?: CardKeywordModification | null;
}

/**
 * Lifecycle state of one Dream Atlas node in the v2 atlas model. A node starts
 * `unrevealed`, becomes `revealedLocked` when shown but not yet reachable,
 * `available` when the player can travel to it, `completed` once cleared, and
 * `forgone` when a sibling branch was taken and this one is unreachable.
 *
 * `forgone` is a data-only generator state (a passed-by sibling); its display
 * fade is delivered by the view-model's `isReachable` computation (the
 * `node-unreachable` CSS treatment), so no `node-forgone` visual rule is needed.
 */
export type AtlasNodeState =
  "unrevealed" | "revealedLocked" | "available" | "completed" | "forgone";

/** An entry in the player's deck. Duplicates are possible. */
export interface DeckEntry {
  entryId: DeckEntryId;
  cardNumber: number;
  transfiguration: TransfigurationType | null;
  typeChange?: CardTypeChange | null;
  keywordModification?: CardKeywordModification | null;
  /** Permanent additive spark granted to this concrete deck entry. */
  sparkBonus?: number;
  /** Debug-only absolute overrides for printed stats on one concrete deck
   *  entry. Applied last, after transfiguration and card modifications, so an
   *  explicit value wins over transfiguration-derived math. A missing key
   *  leaves the corresponding stat at its resolved value. */
  statOverride?: { energyCost?: number; spark?: number };
  isBane: boolean;
}

/** The selected Avatar package shown in player-facing UI. */
export interface Avatar {
  id: AvatarId;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
  /** Authored head position shared by full-body and square portrait crops. */
  portraitFocus?: AvatarPortraitFocus;
  /**
   * Starting essence the player begins the journey with. Captured on the
   * Avatar record so the HUD inspector and persisted state always know
   * the chosen value, even after Firebase round-trips.
   */
  startingEssence: number;
}

/** A passive effect collected during the journey. */
export interface Dreamsign {
  id?: DreamsignId;
  name: string;
  effectDescription: string;
  imageName?: string;
  imageAlt?: string;
}

/**
 * One card currently being explained by the provenance debug overlay.
 */
export interface CardSourceDebugEntry {
  cardNumber: number;
  cardName: string;
  draftPoolCopies: number;
}

/** Which surface produced the currently explained cards. */
export type CardSourceDebugSurface =
  "Draft" | "Shop" | "BattleReward" | "Reward";

/** Global debug data for cards currently revealed on a journey screen. */
export interface CardSourceDebugState {
  screenLabel: string;
  surface: CardSourceDebugSurface;
  entries: CardSourceDebugEntry[];
}

/** A site within a dreamscape. */
export interface SiteState {
  id: SiteId;
  type: SiteType;
  isEnhanced: boolean;
  isVisited: boolean;
  /** Random Site wrapper/origin metadata persisted for deterministic replay. */
  randomSite?: RandomSiteMetadata;
  data?: Record<string, unknown>;
}

export interface RandomSiteMetadata {
  /** One hidden destination away from Random Site's home; configured choices at home. */
  mode: "single" | "homeChoice";
  candidateSiteTypes: RandomSiteDestinationType[];
  destinationSiteType?: RandomSiteDestinationType;
  /** Random Site guide that continues presenting the materialized destination. */
  presentingGuideId?: GuideId;
  /** Set once the wrapper becomes the selected concrete destination. */
  materialized?: boolean;
}

/**
 * A node on the Dream Atlas representing one dreamscape slot in a fixed 7-layer
 * directed graph. The player travels forward from the {@link LayerName.One}
 * starter to the {@link LayerName.Seven} boss. A node holds a column position
 * within its layer (`layer`,
 * `indexInLayer`), the dreamscape assigned to it (`dreamscapeId`, lazily drawn
 * at reveal; `null` while unrevealed), its forward/backward connections, its
 * lifecycle `state`, and an optional pre-revealed known dreamsign carried by
 * one of its sites.
 */
export interface DreamscapeNode {
  id: AtlasNodeId;
  /** The layer this node sits on, from `LayerName.One` (starter) to `Seven` (boss). */
  layer: LayerName;
  /** Column index of this node within its layer. */
  indexInLayer: number;
  /** The dreamscape assigned to this node, or `null` while unrevealed. */
  dreamscapeId: DreamscapeId | null;
  sites: SiteState[];
  position: { x: number; y: number };
  state: AtlasNodeState;
  /** The site type this dreamscape enhances, or `null` when none. */
  enhancedSiteType: SiteType | null;
  /** Node ids in the next layer this node connects forward to. */
  forwardIds: AtlasNodeId[];
  /** Node ids in the previous layer this node connects backward to. */
  backwardIds: AtlasNodeId[];
  /**
   * The id of a pre-revealed "known" dreamsign carried by this node, or `null`
   * when the node carries none. The dreamsign is shown to the player before
   * they reach the node so they can plan a route toward it.
   */
  knownDreamsignId: DreamsignId | null;
}

/**
 * The Dream Atlas: a fixed 7-layer directed graph the player traverses from the
 * {@link LayerName.One} starter dreamscape to the {@link LayerName.Seven} boss.
 * `layers` lists the node ids in each layer, ordered like {@link LAYER_ORDER}
 * (index 0..6); connections derive from each node's `forwardIds`.
 */
export interface DreamAtlas<Generated extends boolean = boolean> {
  /**
   * Node ids per layer, ordered like {@link LAYER_ORDER}: index 0 holds the
   * {@link LayerName.One} nodes, index 6 the {@link LayerName.Seven} boss.
   */
  layers: AtlasNodeId[][];
  nodes: IdentityRecord<AtlasNodeId, DreamscapeNode>;
  /**
   * The {@link LayerName.One} starter dreamscape the player begins the run in.
   * Anchors the left edge of the Atlas and is the player's "you started here"
   * marker.
   */
  startingNodeId: Generated extends true ? AtlasNodeId : AtlasNodeId | null;
  /** The {@link LayerName.Seven} boss node, always revealed from the start of the run. */
  bossNodeId: Generated extends true ? AtlasNodeId : AtlasNodeId | null;
  /**
   * The Apollyon incarnation chosen for this run, identifying which guise the
   * boss node presents (title + short deck description). Resolves against
   * `JourneyContent.apollyonIncarnations`. Absent or `null` on atlases generated
   * before an incarnation was assigned, in which case the UI falls back to the
   * default boss presentation.
   */
  bossIncarnationId?: ApollyonIncarnationId | null;
  /** The node the player currently occupies, or `null` between dreamscapes. */
  currentNodeId: AtlasNodeId | null;
  /** Node ids that carry a pre-revealed known dreamsign. */
  knownDreamsignCarrierIds: AtlasNodeId[];
}

/** Terminal battle result stored on a frozen failure summary. */
export type JourneyFailureBattleResult = "defeat" | "draw";

/**
 * Discriminated reason for a terminal battle result, mirrored from the
 * battle-module `BattleResultReason` type so the journey layer does not have
 * to import battle internals.
 */
export type JourneyFailureReason =
  "score_target_reached" | "turn_limit_reached" | "forced_result";

/**
 * Frozen snapshot describing why a playable battle ended without victory.
 *
 * Captured before leaving the battle surface so the downstream `journeyFailed`
 * screen can render the summary even if the live battle state is later
 * discarded by `resetJourney()`.
 */
export interface JourneyFailureSummary {
  battleId: BattleId;
  result: JourneyFailureBattleResult;
  reason: JourneyFailureReason;
  siteId: SiteId;
  siteLabel: string;
  dreamscapeIdOrNone: AtlasNodeId | null;
  turnNumber: number;
  playerScore: number;
  enemyScore: number;
}

/** Canonical provenance for a queued Exploration shop modifier. */
export interface ExplorationModifierSource {
  readonly sourceSiteId: SiteId;
  readonly sourceActionId: ExplorationActionId;
}

/** One queued modifier that makes every item in the next Card Shop free. */
export interface FreeNextShopModifier extends ExplorationModifierSource {
  readonly kind: "free-next-shop";
}

/** One FIFO purchase counter granted by an Exploration action. */
export interface FreePurchaseModifier extends ExplorationModifierSource {
  readonly kind: "free-purchases";
  readonly initialCount: number;
  readonly remainingCount: number;
}

/** Exact persisted result of one successful Shop or Dreamsign Bazaar buy. */
export interface ShopPurchaseResult {
  readonly eventSeq: number;
  readonly siteId: SiteId;
  readonly slotIndex: number;
  readonly item:
    | {
        readonly kind: "card";
        readonly cardNumber: number;
        readonly gainedEntryId: DeckEntryId;
      }
    | {
        readonly kind: "dreamsign";
        readonly dreamsignId: DreamsignId;
        readonly replacedDreamsignId?: DreamsignId;
      };
  /** Effective price after ordinary discounts but before a free modifier. */
  readonly priceBeforeFree: number;
  /** Exact Essence charged by this purchase. */
  readonly pricePaid: number;
  readonly essenceBefore: number;
  readonly essenceAfter: number;
  /** Visit-wide T56 provenance, when this Card Shop was bound as free. */
  readonly freeNextShopSource?: ExplorationModifierSource;
  /** Exact T82 FIFO counter transition, even when another effect made it free. */
  readonly freePurchaseModifier?: ExplorationModifierSource & {
    readonly initialCount: number;
    readonly remainingBefore: number;
    readonly remainingAfter: number;
  };
}

/** Runtime state for one purchasable slot in a shop site. */
export type RuntimeShopSlot =
  | {
      itemType: "card";
      cardNumber: number;
      /** Exact form minted when an Exploration modifier transfigures this Shop. */
      transfiguration?: TransfigurationType;
      basePrice: number;
      discountPercent: number;
      purchased: boolean;
    }
  | {
      itemType: "dreamsign";
      dreamsign: Dreamsign;
      basePrice: number;
      discountPercent: number;
      purchased: boolean;
    };

/** Runtime state for a shop site. */
export interface ShopSiteRuntime {
  kind: "shop";
  slots: RuntimeShopSlot[];
  rerollCount: number;
  remainingDreamsignPoolIds: DreamsignId[];
  /** Exact successful purchase history, retained when rerolls replace slots. */
  purchaseHistory: readonly ShopPurchaseResult[];
  /** T56 source bound when this exact Card Shop visit opened. */
  freePurchaseSource?: ExplorationModifierSource;
  /** Exploration action whose one-use modifier transfigures this Shop visit. */
  transfiguredOfferSource?: {
    siteId: SiteId;
    actionId: ExplorationActionId;
  };
}

/**
 * Runtime state for a Dreamsign Reward site. The reward is always a known
 * Dreamsign; the `essence` variant is a defensive fallback for the impossible
 * case of an empty Dreamsign pool.
 */
export interface RewardSiteRuntime {
  kind: "reward";
  reward:
    | {
        rewardType: "dreamsign";
        dreamsign: Dreamsign;
      }
    | { rewardType: "essence"; essenceAmount: number };
  remainingDreamsignPoolIds: DreamsignId[];
  accepted: boolean;
}

/** Runtime state for a Dreamsign offer site. */
export interface DreamsignOfferSiteRuntime {
  kind: "dreamsignOffer";
  offeredDreamsigns: Dreamsign[];
  remainingDreamsignPool: DreamsignId[];
  accepted: boolean;
}

/** Runtime state for an Essence site. */
export interface EssenceSiteRuntime {
  kind: "essence";
  amount: number;
  accepted: boolean;
}

/** Runtime state for a card choice site. */
export interface CardChoiceTransfigurationOffer {
  entryId: DeckEntryId;
  type: TransfigurationType;
  /** Structured change used by player presentation. */
  change?: TransfigurationChange;
  /** Legacy analytics/debug payload retained for imported runtime compatibility. */
  effectDescription?: string;
  effectDetails: Record<string, unknown>;
  previewCard: CardData;
  /**
   * Essence the player pays to forge this form, quoted once when the site
   * runtime is built and stable for the whole visit. A multiple of 10 in
   * `[0, 100]`, scaled to the magnitude of the change with a little seeded
   * randomness (see `transfigurationEssenceCost`).
   */
  essenceCost: number;
}

export type CardChoiceSiteRuntime = {
  kind: "cardChoice";
  entryIds: DeckEntryId[];
  acceptedEntryIds: DeckEntryId[];
} & (
  | {
      choiceKind: "transfiguration";
      transfigurationOffers: CardChoiceTransfigurationOffer[];
    }
  | {
      choiceKind: "duplication";
    }
);

/** Runtime state for an Augury site. */
export interface AugurySiteRuntime {
  kind: "augury";
  completed: boolean;
  /** Shared-version runtimes persist their complete prepared encounter. */
  selectionRulesVersion?: SelectionRulesVersion;
  selectionContentRevision?: SelectionContentRevision;
  encounter?: AuguryEncounter;
  /**
   * Debug reroll counter. Incremented by `rerollAugury` to regenerate the
   * encounter from the same journey parameters. Mixed into the encounter RNG salt
   * by `buildAuguryContext`, so the persisted value drives both the displayed
   * encounter and the signature checks on accept/decline. Absent (or `0`) for an
   * un-rerolled site.
   */
  rerollNonce?: number;
  /**
   * Debug-only: forces the first generated offer to use this archetype (a
   * `AuguryArchetypeId`). Set by `forceAuguryArchetype` from the Augury
   * "force a category" debug dropdown. Read by `buildAuguryContext` and
   * honored during encounter generation, so it drives both the displayed
   * encounter and the signature checks on accept/decline. Absent when no
   * category is forced; the value is ignored if it is not eligible for the
   * current journey state.
   */
  forcedArchetypeId?: AuguryArchetypeId;
}

/** Resolved one-card outcome for Gravok's Three-Gate Wager. */
export interface GravokWagerResult {
  gateId: GravokGateId;
  card: StandardPlayingCard;
  won: boolean;
  essenceGained: number;
  /** False until the result announcement applies the wager's payout. */
  essenceSettled?: boolean;
  dreamsignAwarded: boolean;
  pendingDreamsignReplacement: boolean;
  replacedDreamsignId?: DreamsignId;
}

/** Catalog selection inputs persisted so a Gamble choice can be reconstructed. */
export interface GambleSelectionTrace {
  source: "weighted" | "requested";
  requestedGameId: GambleGameId | null;
  selectionRoll: number;
  totalWeight: number;
  candidates: {
    gameId: GambleGameId;
    weight: number;
    fallback: boolean;
  }[];
  selectedGameId: GambleGameId;
}

/** Shared, replayable runtime for one Gravok's Three-Gate Wager encounter. */
export interface GravokWagerSiteRuntime {
  kind: "gamble";
  gameId: "gravok-three-gate-wager";
  /** Absent only on persisted runtimes created before catalog tracing. */
  selectionTrace?: GambleSelectionTrace;
  /** One-based wager number within this site visit. */
  roundNumber?: number;
  isFarpoint: boolean;
  wagerCost: number;
  shuffleCommitment: ShuffleCommitment;
  committedCard: StandardPlayingCard;
  dreamsignCandidateIds: DreamsignId[];
  rewardDreamsign: Dreamsign | null;
  result: GravokWagerResult | null;
}

/** Deterministic follow-up offers prepared when an Exploration site opens. */
export interface ExplorationEssencePreparation {
  minimumEssence: number;
  maximumEssence: number;
  purpose: "essence-amount";
  saltParts: string[];
  drawsConsumed: number;
}

export type ExplorationDreamsignPreparationKind =
  | "fixed-gain"
  | "offered-gain"
  | "offered-replacement"
  | "replace-all-random"
  | "purge-and-gain-random";

export type DreamsignActionUnavailableReason =
  | "invalid-authored-count"
  | "invalid-held-dreamsigns"
  | "invalid-capacity"
  | "requires-held-dreamsign"
  | "capacity-too-small"
  | "insufficient-candidates";

/** Signed, replayable Dreamsign plan prepared without spending the run pool. */
export interface ExplorationDreamsignPreparation {
  kind: ExplorationDreamsignPreparationKind;
  requestedCount: number;
  /** Authored Nightmare bundle size signed with compound Dreamsign plans. */
  nightmareCount?: number;
  heldIdsAtPreparation: DreamsignId[];
  maxDreamsignsAtPreparation: number;
  poolBeforeIds: DreamsignId[];
  poolBasisIds: DreamsignId[];
  poolRegenerated: boolean;
  preparedDreamsignIds: DreamsignId[];
  requiredOverflowReplacementCount: number;
  unavailableReason?: DreamsignActionUnavailableReason;
  planSignature: StableDigest;
}

export interface ExplorationDreamsignReplacement {
  removedDreamsignId: DreamsignId;
  gainedDreamsignId: DreamsignId;
}

/** Complete Dreamsign state and pool transition persisted by a resolution. */
export interface ExplorationDreamsignMutationResolution {
  beforeIds: DreamsignId[];
  afterIds: DreamsignId[];
  offeredIds: DreamsignId[];
  gainedIds: DreamsignId[];
  purgedIds: DreamsignId[];
  replacements: ExplorationDreamsignReplacement[];
  poolBeforeIds: DreamsignId[];
  poolAfterIds: DreamsignId[];
  poolRegenerated: boolean;
}

export type ExplorationStarterCardEffectKind =
  | "purge-starter-card"
  | "purge-random-starter-card"
  | "purge-random-starter-and-gain-card"
  | "replace-all-starter-cards";

export type ExplorationStarterCardUnavailableReason =
  "requires-starter-card" | "insufficient-replacement-cards";

/** Canonical base-card identity paired with one concrete starter deck entry. */
export interface ExplorationStarterCardBinding {
  entryId: DeckEntryId;
  cardId: CardId;
}

/** Signed, replayable starter-card plan prepared when an Exploration site opens. */
export interface ExplorationStarterCardPreparation {
  kind: ExplorationStarterCardEffectKind;
  eligibleStarterCards: ExplorationStarterCardBinding[];
  purgedEntryIds: DeckEntryId[];
  purgedCardIds: CardId[];
  replacementCardIdByEntryId: IdentityRecord<DeckEntryId, CardId>;
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: SelectionContentRevision;
  selectionKey: SelectionKey;
  selectorSignatures: StableDigest[];
  selectorTraces: RewardSelectionTrace[];
  unavailableReason?: ExplorationStarterCardUnavailableReason;
  planSignature: StableDigest;
}

/** Exact persisted identity mapping for one atomic starter-card replacement. */
export interface ExplorationStarterCardReplacement {
  purgedEntryId: DeckEntryId;
  purgedCardId: CardId;
  gainedEntryId: DeckEntryId;
  gainedCardId: CardId;
}

export type ExplorationStarterCardTransfigurationEffectKind =
  "transfigure-random-starter-cards" | "transfigure-all-starter-cards";

export type ExplorationStarterCardTransfigurationUnavailableReason =
  | "requires-starter-card"
  | "insufficient-transfigurable-starter-cards"
  | "all-starter-cards-must-be-transfigurable";

/** Canonical base-card identity paired with one concrete starter deck entry. */
export interface ExplorationStarterCardTransfigurationBinding {
  entryId: DeckEntryId;
  cardId: CardId;
}

/** One prepared starter entry and its independently selected positive form. */
export interface ExplorationStarterCardTransfigurationTarget extends ExplorationStarterCardTransfigurationBinding {
  transfiguration: TransfigurationType;
}

/** Signed automatic transfiguration plan prepared when an Exploration site opens. */
export interface ExplorationStarterCardTransfigurationPreparation {
  kind: "random-count" | "all";
  starterCards: readonly ExplorationStarterCardTransfigurationBinding[];
  eligibleStarterCards: readonly ExplorationStarterCardTransfigurationBinding[];
  targets: readonly ExplorationStarterCardTransfigurationTarget[];
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: SelectionContentRevision;
  selectionKey: SelectionKey;
  selectorSignatures: readonly StableDigest[];
  selectorTraces: readonly RewardSelectionTrace[];
  unavailableReason?: ExplorationStarterCardTransfigurationUnavailableReason;
  planSignature: StableDigest;
}

/** Exact persisted before/after mapping for one starter-card transfiguration. */
export interface ExplorationStarterCardTransfiguration {
  entryId: DeckEntryId;
  cardId: CardId;
  beforeTransfiguration: null;
  afterTransfiguration: TransfigurationType;
}

/** Exact persisted before/after mapping for one general deck transfiguration. */
export interface ExplorationCardTransfiguration {
  entryId: DeckEntryId;
  cardId: CardId;
  beforeTransfiguration: null;
  afterTransfiguration: TransfigurationType;
}

/** Exact source-to-minted mapping for one chosen card replacement. */
export interface ExplorationCardReplacement {
  sourceEntryId: DeckEntryId;
  sourceCardId: CardId;
  replacementEntryId: DeckEntryId;
  replacementCardId: CardId;
}

/** Exact source-to-minted mapping for one copied concrete deck entry. */
export interface ExplorationCardCopy {
  sourceEntryId: DeckEntryId;
  sourceCardId: CardId;
  mintedEntryId: DeckEntryId;
  mintedCardId: CardId;
}

/** Exact persisted type override applied to one concrete deck entry. */
export interface ExplorationCardTypeChange {
  entryId: DeckEntryId;
  cardId: CardId;
  beforeCardType: CardType;
  afterCardType: CardType;
  beforeTypeChange: CardTypeChange | null;
  afterTypeChange: CardTypeChange;
}

/** Exact persisted keyword mutation applied to one concrete deck entry. */
export interface ExplorationCardKeywordChange {
  entryId: DeckEntryId;
  cardId: CardId;
  before: CardKeywordModification | null;
  after: CardKeywordModification;
}

/** Exact Nightmare card minted by one compound Exploration action. */
export interface ExplorationNightmareGain {
  entryId: DeckEntryId;
  cardId: CardId;
}

export interface ExplorationActionOfferRuntime {
  actionId: ExplorationActionId;
  /** Canonical internal mechanic and policy; omitted on legacy runtimes. */
  canonicalMechanicId?: RewardMechanicId;
  selectionPolicyId?: RewardSelectionPolicyId;
  selectionRulesVersion?: SelectionRulesVersion;
  selectionContentRevision?: SelectionContentRevision;
  selectionKey?: SelectionKey;
  selectionSignature?: StableDigest;
  selectionTrace?: RewardSelectionTrace;
  /** Every trace when one action prepares independent targets per deck entry. */
  selectionTraces?: RewardSelectionTrace[];
  /** Exact random Essence result prepared once when the site opens. */
  preparedEssenceAmount?: number;
  /** Reconstructable deterministic stream and inclusive bounds for that result. */
  essencePreparation?: ExplorationEssencePreparation;
  /** Exact signed Dreamsign offer/replacement plan prepared at site opening. */
  dreamsignPreparation?: ExplorationDreamsignPreparation;
  /** Exact signed starter purge/replacement plan prepared at site opening. */
  starterCardPreparation?: ExplorationStarterCardPreparation;
  /** Exact signed starter transfiguration plan prepared at site opening. */
  starterCardTransfigurationPreparation?: ExplorationStarterCardTransfigurationPreparation;
  /** Exact signed multi-card transfiguration plan prepared at site opening. */
  multiCardTransfigurationPreparation?: ExplorationMultiCardTransfigurationPreparation;
  /** Exact signed chosen multi-card replacement plan prepared at site opening. */
  multiCardReplacementPreparation?: MultiCardReplacementPreparation;
  /** Exact signed automatic random deck-target plan prepared at site opening. */
  randomDeckTargetPreparation?: ExplorationRandomDeckTargetPreparation;
  /** Exact signed concrete deck target disclosed before an automatic action. */
  disclosedDeckTargetPreparation?: ExplorationDisclosedDeckTargetPreparation;
  /** Exact signed plan for a compound deck mutation prepared at site opening. */
  compoundActionPreparation?: ExplorationCompoundActionPreparation;
  /** Exact signed fixed-site append plan prepared at site opening. */
  siteInsertionPreparation?: ExplorationSiteInsertionPreparation;
  /** Exact signed player-facing site-type offer and append plan. */
  siteTypeChoicePreparation?: ExplorationSiteTypeChoicePreparation;
  offeredCardIds: CardId[];
  offeredDreamsignIds?: DreamsignId[];
  /** Randomly minted concrete deck-entry UUIDs for deck-card effects. */
  offeredDeckEntryIds?: DeckEntryId[];
  /** Deterministic eligible deck-entry UUIDs captured when a bulk effect is prepared. */
  eligibleDeckEntryIds?: DeckEntryId[];
  /** Randomly offered Avatar UUIDs for identity replacement effects. */
  offeredAvatarIds?: AvatarId[];
  packCardIds: CardId[][];
  replacementCardIdByEntryId: IdentityRecord<DeckEntryId, CardId>;
  transfigurationByEntryId: IdentityRecord<DeckEntryId, TransfigurationType>;
  transfigurationByCardId?: IdentityRecord<CardId, TransfigurationType>;
  offeredSiteType?: SiteType;
}

/** Signed append-only fixed-site plan prepared when an Exploration site opens. */
export interface ExplorationSiteInsertionPreparation {
  sourceSiteId: SiteId;
  sourceActionId: ExplorationActionId;
  targetNodeId: AtlasNodeId;
  insertionIndex: number;
  siblingSiteIdsBefore: readonly SiteId[];
  insertedSite: SiteState & { type: ExplorationFixedSiteType };
  planSignature: StableDigest;
}

/** One offered destination and the exact site record it would append. */
export interface ExplorationPreparedSiteChoice {
  siteType: ExplorationChoosableSiteType;
  insertedSite: SiteState & { type: ExplorationChoosableSiteType };
}

/** Signed site-type chooser prepared when an Exploration site opens. */
export interface ExplorationSiteTypeChoicePreparation {
  sourceSiteId: SiteId;
  sourceActionId: ExplorationActionId;
  targetNodeId: AtlasNodeId;
  insertionIndex: number;
  siblingSiteIdsBefore: readonly SiteId[];
  choices: readonly ExplorationPreparedSiteChoice[];
  selectorSignature: StableDigest;
  planSignature: StableDigest;
}

/** Exact site insertion persisted by a resolved Exploration action. */
export interface ExplorationSiteInsertionResolution {
  targetNodeId: AtlasNodeId;
  insertionIndex: number;
  siblingSiteIdsBefore: readonly SiteId[];
  insertedSite: SiteState & { type: ExplorationFixedSiteType };
}

/** Persisted result shown with the authored response before leaving the site. */
export interface ExplorationResolution {
  actionId: ExplorationActionId;
  selectionRulesVersion?: SelectionRulesVersion;
  selectionContentRevision?: SelectionContentRevision;
  encounterSignature?: StableDigest;
  selectionSignature?: StableDigest;
  /** Validated UUID-only player intent persisted for replay and diagnostics. */
  selection?: Record<string, string | string[] | number>;
  gainedCardIds: CardId[];
  /** Concrete deck-entry UUIDs minted by this resolution. */
  gainedEntryIds?: DeckEntryId[];
  gainedDreamsignIds: DreamsignId[];
  purgedCardIds: CardId[];
  /** Concrete deck-entry UUIDs removed by this resolution. */
  purgedEntryIds?: DeckEntryId[];
  /** Exact pre-resolution deck entries needed to replay and present purges. */
  purgedEntrySnapshots?: DeckEntry[];
  purgedDreamsignIds?: DreamsignId[];
  /** Authoritative structured Dreamsign transition for compound effects. */
  dreamsignMutation?: ExplorationDreamsignMutationResolution;
  /** Exact removed-to-minted mappings for starter-card replacement effects. */
  starterCardReplacements?: ExplorationStarterCardReplacement[];
  /** Exact ordered starter-card transfigurations applied by this resolution. */
  starterCardTransfigurations?: readonly ExplorationStarterCardTransfiguration[];
  /** Exact ordered general deck-card transfigurations applied by this resolution. */
  cardTransfigurations?: readonly ExplorationCardTransfiguration[];
  /** Exact ordered source-to-minted chosen card replacements. */
  cardReplacements?: readonly ExplorationCardReplacement[];
  /** Exact ordered source-to-minted concrete card copies. */
  cardCopies?: readonly ExplorationCardCopy[];
  /** Exact ordered effective card-type transitions. */
  cardTypeChanges?: readonly ExplorationCardTypeChange[];
  /** Exact ordered keyword transitions applied by a compound action. */
  cardKeywordChanges?: readonly ExplorationCardKeywordChange[];
  /** Exact ordered Nightmare entries minted by a compound action. */
  nightmareGains?: readonly ExplorationNightmareGain[];
  affectedEntryIds: DeckEntryId[];
  /** Exact resolved spark values before and after a persisted deck mutation. */
  sparkBeforeByEntryId?: IdentityRecord<DeckEntryId, number>;
  sparkAfterByEntryId?: IdentityRecord<DeckEntryId, number>;
  essenceGained: number;
  /** Exact shared Essence balance immediately before and after the mutation. */
  essenceBefore?: number;
  essenceAfter?: number;
  /** Preparation metadata copied from a random-Essence offer for replay. */
  essencePreparation?: ExplorationEssencePreparation;
  /** Exact Essence deducted by the resolved action. */
  essenceSpent?: number;
  chosenTransfiguration?: TransfigurationType;
  /** Exact typed card predicate used to select a persisted bulk result. */
  resolvedPredicate?: Exclude<RewardCardPredicate, "any">;
  chosenSubtype?: CardSubtype;
  /** Exact authored card type applied by a random type-change action. */
  resolvedCardType?: CardType;
  /** Exact Reclaim cost applied to each surviving concrete deck entry. */
  reclaimCostByEntryId?: IdentityRecord<DeckEntryId, number>;
  /** Exact one-battle modifier created by the resolution. */
  battleModifier?:
    | {
        kind: "opening-hand" | "starting-energy";
        amount: number;
        battlesRemaining: number;
      }
    | {
        kind: "smaller-hand-and-cost-discount";
        openingHandDelta: -1;
        energyCostReduction: 1;
        battlesRemaining: number;
      };
  previousAvatarId?: AvatarId;
  chosenAvatarId?: AvatarId;
  /** Exact one-use future-site modifier created by the resolution. */
  siteOfferModifier?: TransfiguredSiteOfferModifier;
  /** Exact FIFO shop modifier appended by this resolution. */
  shopModifier?: FreeNextShopModifier | FreePurchaseModifier;
  /** Exact append-only site mutation produced by a site-insertion action. */
  siteInsertion?: ExplorationSiteInsertionResolution;
}

/** Shared, replayable runtime for one Exploration encounter. */
export interface ExplorationSiteRuntime {
  kind: "exploration";
  selectionRulesVersion?: SelectionRulesVersion;
  selectionContentRevision?: SelectionContentRevision;
  encounterSignature?: StableDigest;
  encounterCardId: CardId;
  actionOffers: ExplorationActionOfferRuntime[];
  resolution: ExplorationResolution | null;
}

/** One scored candidate considered for a strong-pool Dreamsign reward. */
export interface TidemarkLadderClimbDreamsignCandidateScore {
  dreamsignId: DreamsignId;
  score: number;
}

/** The currently revealed attempt in Tidemark Ladder Climb. */
export interface TidemarkLadderClimbResult {
  attemptNumber: TidemarkLadderClimbAttemptNumber;
  card: StandardPlayingCard;
  won: boolean;
  costPaid: number;
  cumulativeCost: number;
  /** False until the result choreography reaches its outcome moment. */
  resultSettled: boolean;
  dreamsignAwarded: boolean;
  pendingDreamsignReplacement: boolean;
  replacedDreamsignId?: DreamsignId;
}

/** Shared, replayable runtime for one Tidemark Ladder Climb encounter. */
export interface TidemarkLadderClimbSiteRuntime {
  kind: "gamble";
  gameId: "tidemark-ladder-climb";
  /** Absent only on persisted runtimes created before catalog tracing. */
  selectionTrace?: GambleSelectionTrace;
  isFarpoint: boolean;
  /** One independent full-deck commitment for each possible attempt. */
  shuffleCommitments: ShuffleCommitment[];
  committedCards: StandardPlayingCard[];
  /** All eligible candidates, sorted by descending match score then UUID. */
  dreamsignCandidateScores: TidemarkLadderClimbDreamsignCandidateScore[];
  /** Number retained in the strong pool (at most 50). */
  strongPoolSize: number;
  /** Score of the final retained candidate, or null for an empty pool. */
  strongPoolCutoffScore: number | null;
  rewardDreamsign: Dreamsign;
  revealedCards: StandardPlayingCard[];
  cumulativeCost: number;
  result: TidemarkLadderClimbResult | null;
}

/** One revealed tier result in Starway Stairs. */
export interface StarwayStairsResult {
  tierNumber: StarwayStairsTierNumber;
  card: StandardPlayingCard;
  busted: boolean;
  /** False until the result announcement reaches its outcome moment. */
  resultSettled: boolean;
}

/** How a Starway Stairs visit reached its terminal state. */
export type StarwayStairsTerminalReason = "bust" | "cashed-out" | "top";

/** Shared, replayable runtime for one Starway Stairs encounter. */
export interface StarwayStairsSiteRuntime {
  kind: "gamble";
  gameId: "starway-stairs";
  /** Absent only on persisted runtimes created before catalog tracing. */
  selectionTrace?: GambleSelectionTrace;
  /** One-based game number within this site visit. */
  roundNumber: number;
  isFarpoint: boolean;
  /** Essence paid for each tier draw in this round. */
  wagerAmount: number;
  /** One independent full-deck commitment for each tier. */
  shuffleCommitments: ShuffleCommitment[];
  committedCards: StandardPlayingCard[];
  results: StarwayStairsResult[];
  terminalReason: StarwayStairsTerminalReason | null;
  prizeAwarded: number;
}

/** One deck card prepared as a legal Four-Suit Reprise target. */
export interface FourSuitRepriseTarget {
  entryId: DeckEntryId;
  cardId: CardId;
  cardNumber: number;
  /** Exact card face locked when the site opens, retained after a purge. */
  cardSnapshot: CardData;
  /** Every legal free form if this target draws Spades. */
  transfigurationOffers: CardChoiceTransfigurationOffer[];
}

/** One paid, one-shot suit result in Four-Suit Reprise. */
export interface FourSuitRepriseRound {
  roundNumber: 1 | 2 | 3;
  shuffleCommitment: ShuffleCommitment;
  card: StandardPlayingCard;
  targetEntryId: DeckEntryId;
  targetCardId: CardId;
  costPaid: number;
  outcome: FourSuitRepriseOutcome;
  resultRevealed: boolean;
  resultSettled: boolean;
  essenceGained: number;
  duplicatedEntryId?: DeckEntryId;
  chosenTransfiguration?: TransfigurationType;
}

/** Shared, replayable runtime for one Four-Suit Reprise visit. */
export interface FourSuitRepriseSiteRuntime {
  kind: "gamble";
  gameId: "four-suit-reprise";
  /** Absent only on persisted runtimes created before catalog tracing. */
  selectionTrace?: GambleSelectionTrace;
  isFarpoint: boolean;
  drawCost: number;
  /** One independent full-deck commitment for each possible round. */
  shuffleCommitments: ShuffleCommitment[];
  committedCards: StandardPlayingCard[];
  targets: FourSuitRepriseTarget[];
  rounds: FourSuitRepriseRound[];
  phase: "choose" | "result";
}

/** Shared, replayable player-versus-dealer Blackjack hand. */
export interface BlackjackSiteRuntime {
  kind: "gamble";
  gameId: "blackjack";
  /** Absent only on persisted runtimes created before catalog tracing. */
  selectionTrace?: GambleSelectionTrace;
  isFarpoint: boolean;
  wagerCost: number;
  prizeEssence: number;
  /** Paid-hand number; every dealer win advances this counter. */
  attemptNumber: number;
  shuffleCommitment: ShuffleCommitment;
  /** Complete deterministic shoe; cards past deckCursor have not been drawn. */
  committedDeck: StandardPlayingCard[];
  deckCursor: number;
  playerCards: StandardPlayingCard[];
  dealerCards: StandardPlayingCard[];
  dealerRevealed: boolean;
  wagerPaid: boolean;
  playerDecision: "deal" | "hit" | "stand" | null;
  outcome: "player-win" | "dealer-win" | "push" | null;
  resultSettled: boolean;
  essenceAwarded: number;
}

/** Every game runtime currently available at a Gamble site. */
export type GambleSiteRuntime =
  | GravokWagerSiteRuntime
  | TidemarkLadderClimbSiteRuntime
  | StarwayStairsSiteRuntime
  | FourSuitRepriseSiteRuntime
  | BlackjackSiteRuntime;

/** Stable Gamble game id, re-exported beside its persisted runtime union. */
export type GambleSiteGameId = GambleGameId;

/** Shared, replayable configured destination offer at Random Site's home. */
export interface RandomSiteRuntime {
  kind: "randomSite";
  offeredSiteTypes: RandomSiteDestinationType[];
  selectedSiteType: RandomSiteDestinationType | null;
}

/** Serialized runtime state keyed by site id. */
export type SiteRuntimeState =
  | ShopSiteRuntime
  | RewardSiteRuntime
  | DreamsignOfferSiteRuntime
  | EssenceSiteRuntime
  | CardChoiceSiteRuntime
  | AugurySiteRuntime
  | GambleSiteRuntime
  | ExplorationSiteRuntime
  | RandomSiteRuntime;

/** Discriminated union for the current screen. */
export type Screen =
  | {
      type: "journeyStart";
      /** Shared debug-reroll count used to derive the shown Avatar offer. */
      rerollCount?: number;
      /**
       * Shared tutorial override that presents exactly this Avatar UUID.
       * Absent for the normal seeded three-avatar offer.
       */
      tutorialAvatarId?: AvatarId;
    }
  | { type: "atlas" }
  | { type: "dreamscape" }
  | { type: "site"; siteId: SiteId }
  | { type: "journeyComplete" }
  | { type: "journeyFailed" };

/**
 * A modifier that affects upcoming battle resolutions. Pushed by Augury
 * effects; decremented by the authoritative victory transition each time a battle
 * completes. Entries at `battlesRemaining === 0` drop on the same tick that
 * brought them to zero. Battle initialization reads `battleModifiers` to apply
 * reward reductions to the visible reward and the payout amount.
 */
export type BattleModifier =
  | {
      kind: "reward_reduction_flat";
      amount: number;
      battlesRemaining: number;
      source: JourneyMutationSource;
    }
  | {
      kind: "reward_reduction_percent";
      percent: number;
      battlesRemaining: number;
      source: JourneyMutationSource;
    }
  | {
      kind: "temporary_nightmare_grant";
      count: number;
      battlesRemaining: number;
      /**
       * The deck `entryId`s added when this modifier was pushed; removed when
       * `battlesRemaining` hits 0 so the temporary Nightmares leave the deck.
       */
      addedEntryIds: readonly DeckEntryId[];
      source: JourneyMutationSource;
    }
  | {
      kind: "opening_hand_bonus";
      count: number;
      battlesRemaining: number;
      source: JourneyMutationSource;
    }
  | {
      kind: "starting_energy_bonus";
      count: number;
      battlesRemaining: number;
      source: JourneyMutationSource;
    }
  | {
      kind: "smaller_hand_and_cost_discount";
      openingHandDelta: -1;
      energyCostReduction: 1;
      battlesRemaining: number;
      source: JourneyMutationSource;
    };

/**
 * A modifier that affects upcoming dreamscape generation or site appearance.
 * Decremented by `setCurrentDreamscape` whenever the player advances to a
 * new dreamscape; entries at `dreamscapesRemaining === 0` drop on the same
 * tick.
 */
export type DreamscapeModifier =
  | {
      kind: "remove_shop_sites";
      dreamscapesRemaining: number;
      source: JourneyMutationSource;
    }
  | {
      kind: "boost_site_appearance";
      siteType: SiteType;
      percent: number;
      dreamscapesRemaining: number;
      source: JourneyMutationSource;
    };

/**
 * Shop-side modifiers stacked by rewards and Exploration resolutions.
 * Free-reroll grants stack additively and are consumed by `rerollShop`;
 * `essenceDiscountPercent` is a permanent additive discount on
 * essence-priced shop slots; free-shop and free-purchase modifiers remain in
 * FIFO order until their eligible site open or purchase consumes them.
 */
export interface ShopModifiers {
  readonly freeRerolls: number;
  readonly essenceDiscountPercent: number;
  /** FIFO T56 modifiers awaiting an eligible Card Shop open. */
  readonly freeNextShopModifiers: readonly FreeNextShopModifier[];
  /** FIFO T82 counters consumed by successful Shop and Bazaar purchases. */
  readonly freePurchaseModifiers: readonly FreePurchaseModifier[];
}

/** A one-use Exploration modifier consumed by the next eligible Draft or Shop. */
export interface TransfiguredSiteOfferModifier {
  readonly kind: "transfigure-next-draft-or-shop";
  readonly sourceSiteId: SiteId;
  readonly sourceActionId: ExplorationActionId;
}

/** The top-level journey state object. */
export interface JourneyState {
  /** Event-log identity of the current assembled or loaded run. */
  readonly runId: JourneyId | null;
  /** Whether this run was assembled from the authored tutorial journey handoff. */
  readonly isTutorialJourney?: boolean;
  /**
   * Per-journey random seed generated once at journey start. Mixed into derived
   * generators that must vary across distinct journeys but stay stable for the
   * life of a single journey. The journey adapter hashes this together with the
   * atlas starting node id and the site id when deriving a journey seed, so
   * two fresh journeys on the same atlas site land on different shapes and
   * dream art, while the same journey reloaded keeps the manifest byte-stable.
   */
  readonly seed: JourneySeed;
  essence: number;
  /**
   * Maximum number of Dreamsigns the player can hold at once. Defaults to 12;
   * certain effects can reduce it.
   */
  maxDreamsigns: number;
  deck: DeckEntry[];
  avatar: Avatar | null;
  resolvedPackage: ResolvedAvatarPackage | null;
  cardSourceDebug: CardSourceDebugState | null;
  remainingDreamsignPool: DreamsignId[];
  dreamsigns: Dreamsign[];
  completionLevel: number;
  atlas: DreamAtlas;
  currentDreamscape: AtlasNodeId | null;
  visitedSites: SiteId[];
  siteRuntime: IdentityRecord<SiteId, SiteRuntimeState>;
  draftState: DraftState | null;
  screen: Screen;
  activeSiteId: SiteId | null;
  failureSummary: JourneyFailureSummary | null;
  /**
   * Whether the player has dismissed the one-time starter-deck reveal popup
   * shown immediately after picking an Avatar. Persisted on the journey
   * state so reloads of the same room (or other clients) do not see the
   * popup again. Defaults to `false`; flipped to `true` when the player
   * clicks the popup's "Continue" action.
   */
  hasSeenStartingDeckPopup: boolean;
  /**
   * Modifiers consumed by future battles. Each modifier carries a remaining
   * count of battles; the authoritative victory transition decrements each entry and
   * drops entries that reach zero.
   */
  readonly battleModifiers: readonly BattleModifier[];
  /**
   * Modifiers consumed at shop sites. Free-reroll grants stack additively, the
   * essence discount is a permanent additive percentage, and Exploration
   * free-shop/free-purchase modifiers are retained in FIFO queues.
   */
  readonly shopModifiers: ShopModifiers;
  /** One-use modifiers waiting for the next eligible Draft or Shop visit. */
  readonly siteOfferModifiers: readonly TransfiguredSiteOfferModifier[];
  /**
   * Modifiers consumed by future dreamscapes. Each modifier decrements when
   * a new dreamscape opens; entries at zero drop on the same tick.
   */
  readonly dreamscapeModifiers: readonly DreamscapeModifier[];
}
