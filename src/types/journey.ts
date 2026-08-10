import type {
  DreamAvatarPortraitFocus,
  ResolvedDreamAvatarPackage,
} from "./content";
import type { CardData, CardType } from "./cards";
import type {
  RewardCardPredicate,
  RewardMechanicId,
  RewardSelectionPolicyId,
  RewardSelectionTrace,
} from "../reward-selection/types";
import type { MerchantEncounter } from "../journey_v2/types";
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
  predicateId: string;
  cardType: CardType;
  subtype: string;
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
  entryId: string;
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

/** The selected DreamAvatar package shown in player-facing UI. */
export interface DreamAvatar {
  id: string;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
  /** Authored head position shared by full-body and square portrait crops. */
  portraitFocus?: DreamAvatarPortraitFocus;
  /**
   * Starting essence the player begins the journey with. Captured on the
   * DreamAvatar record so the HUD inspector and persisted state always know
   * the chosen value, even after Firebase round-trips.
   */
  startingEssence: number;
}

/** A passive effect collected during the journey. */
export interface Dreamsign {
  id?: string;
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
  id: string;
  type: SiteType;
  isEnhanced: boolean;
  isVisited: boolean;
  /** Random Site wrapper/origin metadata persisted for deterministic replay. */
  randomSite?: RandomSiteMetadata;
  /** Dream Guide displayed instead of the resident guide for this site. */
  guideIdOverride?: string;
  data?: Record<string, unknown>;
}

export interface RandomSiteMetadata {
  /** One hidden destination away from Random Site's home; configured choices at home. */
  mode: "single" | "homeChoice";
  candidateSiteTypes: RandomSiteDestinationType[];
  destinationSiteType?: RandomSiteDestinationType;
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
  id: string;
  /** The layer this node sits on, from `LayerName.One` (starter) to `Seven` (boss). */
  layer: LayerName;
  /** Column index of this node within its layer. */
  indexInLayer: number;
  /** The dreamscape assigned to this node, or `null` while unrevealed. */
  dreamscapeId: string | null;
  /** Display name of the assigned dreamscape (`""` while unrevealed). */
  biomeName: string;
  sites: SiteState[];
  position: { x: number; y: number };
  state: AtlasNodeState;
  /** The site type this dreamscape enhances, or `null` when none. */
  enhancedSiteType: SiteType | null;
  /** Node ids in the next layer this node connects forward to. */
  forwardIds: string[];
  /** Node ids in the previous layer this node connects backward to. */
  backwardIds: string[];
  /**
   * The id of a pre-revealed "known" dreamsign carried by this node, or `null`
   * when the node carries none. The dreamsign is shown to the player before
   * they reach the node so they can plan a route toward it.
   */
  knownDreamsignId: string | null;
}

/**
 * The Dream Atlas: a fixed 7-layer directed graph the player traverses from the
 * {@link LayerName.One} starter dreamscape to the {@link LayerName.Seven} boss.
 * `layers` lists the node ids in each layer, ordered like {@link LAYER_ORDER}
 * (index 0..6); connections derive from each node's `forwardIds`.
 */
export interface DreamAtlas {
  /**
   * Node ids per layer, ordered like {@link LAYER_ORDER}: index 0 holds the
   * {@link LayerName.One} nodes, index 6 the {@link LayerName.Seven} boss.
   */
  layers: string[][];
  nodes: Record<string, DreamscapeNode>;
  /**
   * The {@link LayerName.One} starter dreamscape the player begins the run in.
   * Anchors the left edge of the Atlas and is the player's "you started here"
   * marker.
   */
  startingNodeId: string;
  /** The {@link LayerName.Seven} boss node, always revealed from the start of the run. */
  bossNodeId: string;
  /**
   * The Apollyon incarnation chosen for this run, identifying which guise the
   * boss node presents (title + short deck description). Resolves against
   * `JourneyContent.apollyonIncarnations`. Absent or `null` on atlases generated
   * before an incarnation was assigned, in which case the UI falls back to the
   * default boss presentation.
   */
  bossIncarnationId?: string | null;
  /** The node the player currently occupies, or `null` between dreamscapes. */
  currentNodeId: string | null;
  /** Node ids that carry a pre-revealed known dreamsign. */
  knownDreamsignCarrierIds: string[];
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
  battleId: string;
  result: JourneyFailureBattleResult;
  reason: JourneyFailureReason;
  siteId: string;
  siteLabel: string;
  dreamscapeIdOrNone: string | null;
  turnNumber: number;
  playerScore: number;
  enemyScore: number;
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
  remainingDreamsignPoolIds: string[];
  /** Exploration action whose one-use modifier transfigures this Shop visit. */
  transfiguredOfferSource?: {
    siteId: string;
    actionId: string;
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
  remainingDreamsignPoolIds: string[];
  accepted: boolean;
}

/** Runtime state for a Dreamsign offer site. */
export interface DreamsignOfferSiteRuntime {
  kind: "dreamsignOffer";
  offeredDreamsigns: Dreamsign[];
  remainingDreamsignPool: string[];
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
  entryId: string;
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
  entryIds: string[];
  acceptedEntryIds: string[];
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
  selectionRulesVersion?: string;
  selectionContentRevision?: string;
  encounter?: MerchantEncounter;
  /**
   * Debug reroll counter. Incremented by `rerollAugury` to regenerate the
   * encounter from the same journey parameters. Mixed into the encounter RNG salt
   * by `buildMerchantContext`, so the persisted value drives both the displayed
   * encounter and the signature checks on accept/decline. Absent (or `0`) for an
   * un-rerolled site.
   */
  rerollNonce?: number;
  /**
   * Debug-only: forces the first generated offer to use this archetype (a
   * `MerchantArchetypeId`). Set by `forceAuguryArchetype` from the Augury
   * "force a category" debug dropdown. Read by `buildMerchantContext` and
   * honored during encounter generation, so it drives both the displayed
   * encounter and the signature checks on accept/decline. Absent when no
   * category is forced; the value is ignored if it is not eligible for the
   * current journey state.
   */
  forcedArchetypeId?: string;
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
  replacedDreamsignId?: string;
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
  shuffleCommitment: string;
  committedCard: StandardPlayingCard;
  dreamsignCandidateIds: string[];
  rewardDreamsign: Dreamsign | null;
  result: GravokWagerResult | null;
}

/** Deterministic follow-up offers prepared when an Exploration site opens. */
export interface ExplorationActionOfferRuntime {
  actionId: string;
  /** Canonical internal mechanic and policy; omitted on legacy runtimes. */
  canonicalMechanicId?: RewardMechanicId;
  selectionPolicyId?: RewardSelectionPolicyId;
  selectionRulesVersion?: string;
  selectionContentRevision?: string;
  selectionKey?: string;
  selectionSignature?: string;
  selectionTrace?: RewardSelectionTrace;
  /** Every trace when one action prepares independent targets per deck entry. */
  selectionTraces?: RewardSelectionTrace[];
  offeredCardIds: string[];
  offeredDreamsignIds?: string[];
  /** Randomly minted concrete deck-entry UUIDs for deck-card effects. */
  offeredDeckEntryIds?: string[];
  /** Deterministic eligible deck-entry UUIDs captured when a bulk effect is prepared. */
  eligibleDeckEntryIds?: string[];
  /** Randomly offered DreamAvatar UUIDs for identity replacement effects. */
  offeredDreamAvatarIds?: string[];
  packCardIds: string[][];
  replacementCardIdByEntryId: Record<string, string>;
  transfigurationByEntryId: Record<string, TransfigurationType>;
  transfigurationByCardId?: Record<string, TransfigurationType>;
  offeredSiteType?: SiteType;
}

/** Persisted result shown with the authored response before leaving the site. */
export interface ExplorationResolution {
  actionId: string;
  selectionRulesVersion?: string;
  selectionContentRevision?: string;
  encounterSignature?: string;
  selectionSignature?: string;
  /** Validated UUID-only player intent persisted for replay and diagnostics. */
  selection?: Record<string, string | string[] | number>;
  gainedCardIds: string[];
  /** Concrete deck-entry UUIDs minted by this resolution. */
  gainedEntryIds?: string[];
  gainedDreamsignIds: string[];
  purgedCardIds: string[];
  /** Concrete deck-entry UUIDs removed by this resolution. */
  purgedEntryIds?: string[];
  /** Exact pre-resolution deck entries needed to replay and present purges. */
  purgedEntrySnapshots?: DeckEntry[];
  purgedDreamsignIds?: string[];
  affectedEntryIds: string[];
  /** Exact resolved spark values before and after a persisted deck mutation. */
  sparkBeforeByEntryId?: Record<string, number>;
  sparkAfterByEntryId?: Record<string, number>;
  essenceGained: number;
  /** Exact Essence deducted by the resolved action. */
  essenceSpent?: number;
  chosenTransfiguration?: TransfigurationType;
  /** Exact typed card predicate used to select a persisted bulk result. */
  resolvedPredicate?: Exclude<RewardCardPredicate, "any">;
  chosenSubtype?: string;
  /** Exact Reclaim cost applied to each surviving concrete deck entry. */
  reclaimCostByEntryId?: Record<string, number>;
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
  previousDreamAvatarId?: string;
  chosenDreamAvatarId?: string;
  /** Exact one-use future-site modifier created by the resolution. */
  siteOfferModifier?: TransfiguredSiteOfferModifier;
}

/** Shared, replayable runtime for one Exploration encounter. */
export interface ExplorationSiteRuntime {
  kind: "exploration";
  selectionRulesVersion?: string;
  selectionContentRevision?: string;
  encounterSignature?: string;
  encounterCardId: string;
  actionOffers: ExplorationActionOfferRuntime[];
  resolution: ExplorationResolution | null;
}

/** One scored candidate considered for a strong-pool Dreamsign reward. */
export interface TidemarkLadderClimbDreamsignCandidateScore {
  dreamsignId: string;
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
  replacedDreamsignId?: string;
}

/** Shared, replayable runtime for one Tidemark Ladder Climb encounter. */
export interface TidemarkLadderClimbSiteRuntime {
  kind: "gamble";
  gameId: "tidemark-ladder-climb";
  /** Absent only on persisted runtimes created before catalog tracing. */
  selectionTrace?: GambleSelectionTrace;
  isFarpoint: boolean;
  /** One independent full-deck commitment for each possible attempt. */
  shuffleCommitments: string[];
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
  shuffleCommitments: string[];
  committedCards: StandardPlayingCard[];
  results: StarwayStairsResult[];
  terminalReason: StarwayStairsTerminalReason | null;
  prizeAwarded: number;
}

/** One deck card prepared as a legal Four-Suit Reprise target. */
export interface FourSuitRepriseTarget {
  entryId: string;
  cardId: string;
  cardNumber: number;
  /** Exact card face locked when the site opens, retained after a purge. */
  cardSnapshot: CardData;
  /** Every legal free form if this target draws Spades. */
  transfigurationOffers: CardChoiceTransfigurationOffer[];
}

/** One paid, one-shot suit result in Four-Suit Reprise. */
export interface FourSuitRepriseRound {
  roundNumber: 1 | 2 | 3;
  shuffleCommitment: string;
  card: StandardPlayingCard;
  targetEntryId: string;
  targetCardId: string;
  costPaid: number;
  outcome: FourSuitRepriseOutcome;
  resultRevealed: boolean;
  resultSettled: boolean;
  essenceGained: number;
  duplicatedEntryId?: string;
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
  shuffleCommitments: string[];
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
  shuffleCommitment: string;
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
      /** Shared debug-reroll count used to derive the shown DreamAvatar offer. */
      rerollCount?: number;
      /**
       * Shared tutorial override that presents exactly this DreamAvatar UUID.
       * Absent for the normal seeded three-avatar offer.
       */
      tutorialDreamAvatarId?: string;
    }
  | { type: "atlas" }
  | { type: "dreamscape" }
  | { type: "site"; siteId: string }
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
      source: string;
    }
  | {
      kind: "reward_reduction_percent";
      percent: number;
      battlesRemaining: number;
      source: string;
    }
  | {
      kind: "temporary_nightmare_grant";
      count: number;
      battlesRemaining: number;
      /**
       * The deck `entryId`s added when this modifier was pushed; removed when
       * `battlesRemaining` hits 0 so the temporary Nightmares leave the deck.
       */
      addedEntryIds: readonly string[];
      source: string;
    }
  | {
      kind: "opening_hand_bonus";
      count: number;
      battlesRemaining: number;
      source: string;
    }
  | {
      kind: "starting_energy_bonus";
      count: number;
      battlesRemaining: number;
      source: string;
    }
  | {
      kind: "smaller_hand_and_cost_discount";
      openingHandDelta: -1;
      energyCostReduction: 1;
      battlesRemaining: number;
      source: string;
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
      source: string;
    }
  | {
      kind: "boost_site_appearance";
      siteType: SiteType;
      percent: number;
      dreamscapesRemaining: number;
      source: string;
    };

/**
 * Shop-side modifiers stacked by Augury rewards. Free-reroll grants
 * stack additively and are consumed by `rerollShop`; `essenceDiscountPercent`
 * is a permanent additive discount on essence-priced shop slots.
 */
export interface ShopModifiers {
  readonly freeRerolls: number;
  readonly essenceDiscountPercent: number;
}

/** A one-use Exploration modifier consumed by the next eligible Draft or Shop. */
export interface TransfiguredSiteOfferModifier {
  readonly kind: "transfigure-next-draft-or-shop";
  readonly sourceSiteId: string;
  readonly sourceActionId: string;
}

/** The top-level journey state object. */
export interface JourneyState {
  /** Event-log identity of the current assembled or loaded run. */
  readonly runId: string | null;
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
  readonly seed: string;
  essence: number;
  /**
   * Maximum number of Dreamsigns the player can hold at once. Defaults to 12;
   * certain effects can reduce it.
   */
  maxDreamsigns: number;
  deck: DeckEntry[];
  dreamAvatar: DreamAvatar | null;
  resolvedPackage: ResolvedDreamAvatarPackage | null;
  cardSourceDebug: CardSourceDebugState | null;
  remainingDreamsignPool: string[];
  dreamsigns: Dreamsign[];
  completionLevel: number;
  atlas: DreamAtlas;
  currentDreamscape: string | null;
  visitedSites: string[];
  siteRuntime: Record<string, SiteRuntimeState>;
  draftState: DraftState | null;
  screen: Screen;
  activeSiteId: string | null;
  failureSummary: JourneyFailureSummary | null;
  /**
   * Whether the player has dismissed the one-time starter-deck reveal popup
   * shown immediately after picking a DreamAvatar. Persisted on the journey
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
   * Modifiers consumed at shop sites. Free-reroll grants stack additively, and
   * the essence discount is a permanent additive percentage applied to every
   * essence-priced shop purchase.
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
