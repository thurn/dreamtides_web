import type {
  DreamcallerPortraitFocus,
  ResolvedDreamcallerPackage,
} from "./content";
import type { CardData, CardType } from "./cards";
import type { DraftState } from "./draft";
import type { LayerName } from "./layer-name";

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

/** All site types available in dreamscapes. */
export type SiteType =
  | "Battle"
  | "Draft"
  | "Shop"
  | "Purge"
  | "Essence"
  | "Transfiguration"
  | "Duplication"
  | "Reward"
  | "DreamAugury"
  | "DreamsignMarket"
  | "DreamsignRevelation"
  | "TemptingOffer"
  | "Gamble"
  | "TemporalFork";

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
  | "unrevealed"
  | "revealedLocked"
  | "available"
  | "completed"
  | "forgone";

/** One layer's inclusive node-count range in the 7-layer Dream Atlas. */
export interface AtlasLayerSpec {
  min: number;
  max: number;
}

/** Generation tuning for the v2 Dream Atlas, sourced from atlas_config.toml. */
export interface AtlasConfig {
  layerSpecs: AtlasLayerSpec[];
  connectionAverage: number;
  bonusReveal: { min: number; max: number; mode: number };
  repeatDiscourageStrength: number;
  knownDreamsign: {
    maxPerAtlas: number;
    eligibleLayers: number[];
    placementProbability: number;
    earlyRevealBias: number;
  };
}

/** An entry in the player's deck. Duplicates are possible. */
export interface DeckEntry {
  entryId: string;
  cardNumber: number;
  transfiguration: TransfigurationType | null;
  typeChange?: CardTypeChange | null;
  keywordModification?: CardKeywordModification | null;
  /** Debug-only absolute overrides for printed stats on one concrete deck
   *  entry. Applied last, after transfiguration and card modifications, so an
   *  explicit value wins over transfiguration-derived math. A missing key
   *  leaves the corresponding stat at its resolved value. */
  statOverride?: { energyCost?: number; spark?: number };
  isBane: boolean;
}

/** The selected Dreamcaller package shown in player-facing UI. */
export interface Dreamcaller {
  id: string;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
  /** Authored head position shared by full-body and square portrait crops. */
  portraitFocus?: DreamcallerPortraitFocus;
  /**
   * Starting essence the player begins the quest with. Captured on the
   * Dreamcaller record so the HUD inspector and persisted state always know
   * the chosen value, even after Firebase round-trips.
   */
  startingEssence: number;
}

/** A passive effect collected during the quest. */
export interface Dreamsign {
  id?: string;
  name: string;
  effectDescription: string;
  imageName?: string;
  imageAlt?: string;
  isBane: boolean;
}

/**
 * One card currently being explained by the provenance debug overlay. idf3
 * builds each Dreamcaller's pool from its signature cards, so provenance is
 * reported as starter-decklist membership and the card's draft-pool copy count.
 */
export interface CardSourceDebugEntry {
  cardNumber: number;
  cardName: string;
  inStarterDecklist: boolean;
  draftPoolCopies: number;
}

/** Which surface produced the currently explained cards. */
export type CardSourceDebugSurface =
  | "Draft"
  | "Shop"
  | "BattleReward"
  | "Reward";

/** Global debug data for cards currently revealed on a quest screen. */
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
  data?: Record<string, unknown>;
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
  /** Accent colour shown for the dreamscape on the Atlas. */
  biomeColor: string;
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
   * `QuestContent.apollyonIncarnations`. Absent or `null` on atlases generated
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
export type QuestFailureBattleResult = "defeat" | "draw";

/**
 * Discriminated reason for a terminal battle result, mirrored from the
 * battle-module `BattleResultReason` type so the quest layer does not have
 * to import battle internals.
 */
export type QuestFailureReason =
  | "score_target_reached"
  | "turn_limit_reached"
  | "forced_result";

/**
 * Frozen snapshot describing why a playable battle ended without victory.
 *
 * Captured before leaving the battle surface so the downstream `questFailed`
 * screen can render the summary even if the live battle state is later
 * discarded by `resetQuest()`.
 */
export interface QuestFailureSummary {
  battleId: string;
  result: QuestFailureBattleResult;
  reason: QuestFailureReason;
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
  effectDescription: string;
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

/** Runtime state for a Dream Augury site. */
export interface DreamAugurySiteRuntime {
  kind: "dreamAugury";
  completed: boolean;
  /**
   * Debug reroll counter. Incremented by `rerollDreamAugury` to regenerate the
   * encounter from the same quest parameters. Mixed into the encounter RNG salt
   * by `buildMerchantContext`, so the persisted value drives both the displayed
   * encounter and the signature checks on accept/decline. Absent (or `0`) for an
   * un-rerolled site.
   */
  rerollNonce?: number;
  /**
   * Debug-only: forces the first generated offer to use this archetype (a
   * `MerchantArchetypeId`). Set by `forceDreamAuguryArchetype` from the Dream
   * Augury "force a category" debug dropdown. Read by `buildMerchantContext` and
   * honored during encounter generation, so it drives both the displayed
   * encounter and the signature checks on accept/decline. Absent when no
   * category is forced; the value is ignored if it is not eligible for the
   * current quest state.
   */
  forcedArchetypeId?: string;
}

/** Serialized runtime state keyed by site id. */
export type SiteRuntimeState =
  | ShopSiteRuntime
  | RewardSiteRuntime
  | DreamsignOfferSiteRuntime
  | EssenceSiteRuntime
  | CardChoiceSiteRuntime
  | DreamAugurySiteRuntime;

/** Discriminated union for the current screen. */
export type Screen =
  | { type: "questStart" }
  | { type: "atlas" }
  | { type: "dreamscape" }
  | { type: "site"; siteId: string }
  | { type: "questComplete" }
  | { type: "questFailed" };

/**
 * A modifier that affects upcoming battle resolutions. Pushed by Dream Augury
 * effects; decremented by `incrementCompletionLevel` each time a battle
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
      kind: "temporary_bane_grant";
      baneName: string;
      count: number;
      battlesRemaining: number;
      /**
       * The deck `entryId`s added when this modifier was pushed; removed when
       * `battlesRemaining` hits 0 so the temporary banes leave the deck.
       */
      addedEntryIds: readonly string[];
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
 * Shop-side modifiers stacked by Dream Augury rewards. Free-reroll grants
 * stack additively and are consumed by `rerollShop`; `essenceDiscountPercent`
 * is a permanent additive discount on essence-priced shop slots.
 */
export interface ShopModifiers {
  readonly freeRerolls: number;
  readonly essenceDiscountPercent: number;
}

/** The top-level quest state object. */
export interface QuestState {
  /** Event-log identity of the current assembled or loaded run. */
  readonly runId: string | null;
  /**
   * Per-quest random seed generated once at quest start. Mixed into derived
   * generators that must vary across distinct quests but stay stable for the
   * life of a single quest. The journey adapter hashes this together with the
   * atlas starting node id and the site id when deriving a journey seed, so
   * two fresh quests on the same atlas site land on different shapes and
   * dream art, while the same quest reloaded keeps the manifest byte-stable.
   */
  readonly seed: string;
  essence: number;
  /**
   * Maximum essence the player can hold. Essence gained beyond this cap is
   * lost. Defaults to 500; effects such as Dream Augury rewards can raise it.
   */
  essenceCap: number;
  /**
   * Maximum number of Dreamsigns the player can hold at once. Defaults to 12;
   * certain effects can reduce it.
   */
  maxDreamsigns: number;
  deck: DeckEntry[];
  dreamcaller: Dreamcaller | null;
  resolvedPackage: ResolvedDreamcallerPackage | null;
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
  failureSummary: QuestFailureSummary | null;
  /**
   * Whether the player has dismissed the one-time starter-deck reveal popup
   * shown immediately after picking a Dreamcaller. Persisted on the quest
   * state so reloads of the same room (or other clients) do not see the
   * popup again. Defaults to `false`; flipped to `true` when the player
   * clicks the popup's "Continue" action.
   */
  hasSeenStartingDeckPopup: boolean;
  /**
   * Modifiers consumed by future battles. Each modifier carries a remaining
   * count of battles; `incrementCompletionLevel` decrements each entry and
   * drops entries that reach zero.
   */
  readonly battleModifiers: readonly BattleModifier[];
  /**
   * Modifiers consumed at shop sites. Free-reroll grants stack additively, and
   * the essence discount is a permanent additive percentage applied to every
   * essence-priced shop purchase.
   */
  readonly shopModifiers: ShopModifiers;
  /**
   * Modifiers consumed by future dreamscapes. Each modifier decrements when
   * a new dreamscape opens; entries at zero drop on the same tick.
   */
  readonly dreamscapeModifiers: readonly DreamscapeModifier[];
}
