import type { ResolvedDreamcallerPackage } from "./content";
import type { CardData, CardType } from "./cards";
import type { DraftState } from "./draft";

/** Badge applied to a card via a Transfiguration site. */
export type TransfigurationType =
  | "Viridian"
  | "Golden"
  | "Scarlet"
  | "Azure"
  | "Bronze"
  | "Magenta"
  | "Rose"
  | "Prismatic";

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
  | "SpecialtyShop"
  | "DreamsignOffering"
  | "DreamsignDraft"
  | "DreamJourney"
  | "Purge"
  | "Essence"
  | "Transfiguration"
  | "Duplication"
  | "Reward"
  | "Cleanse";

/** An entry in the player's deck. Duplicates are possible. */
export interface DeckEntry {
  entryId: string;
  cardNumber: number;
  transfiguration: TransfigurationType | null;
  typeChange?: CardTypeChange | null;
  keywordModification?: CardKeywordModification | null;
  isBane: boolean;
}

/** The selected Dreamcaller package shown in player-facing UI. */
export interface Dreamcaller {
  id: string;
  name: string;
  title: string;
  renderedText: string;
  imageNumber: string;
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
  | "SpecialtyShop"
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

/** A node on the Dream Atlas representing a dreamscape. */
export interface DreamscapeNode {
  id: string;
  biomeName: string;
  biomeColor: string;
  sites: SiteState[];
  position: { x: number; y: number };
  status: "completed" | "available" | "unavailable";
  enhancedSiteType: SiteType | null;
}

/** The Dream Atlas graph containing all dreamscape nodes. */
export interface DreamAtlas {
  nodes: Record<string, DreamscapeNode>;
  edges: Array<[string, string]>;
  /**
   * The dreamscape the player started the run in. Rendered at the centre of
   * the Atlas SVG and emphasised in `AtlasNode` so the player has a clear
   * "you started here" anchor on the graph.
   */
  startingNodeId: string;
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

/** Runtime state for a Dream Journey site. */
export interface DreamJourneySiteRuntime {
  kind: "dreamJourney";
  completed: boolean;
}

/** Serialized runtime state keyed by site id. */
export type SiteRuntimeState =
  | ShopSiteRuntime
  | RewardSiteRuntime
  | DreamsignOfferSiteRuntime
  | EssenceSiteRuntime
  | CardChoiceSiteRuntime
  | DreamJourneySiteRuntime;

/** Discriminated union for the current screen. */
export type Screen =
  | { type: "questStart" }
  | { type: "atlas" }
  | { type: "dreamscape" }
  | { type: "site"; siteId: string }
  | { type: "questComplete" }
  | { type: "questFailed" };

/**
 * A modifier that affects upcoming battle resolutions. Pushed by Dream Journey
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
      kind: "remove_dreamsign_sites";
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
 * Shop-side modifiers stacked by Dream Journey rewards. Free-reroll grants
 * stack additively and are consumed by `rerollShop`; the omen-discount queue
 * holds one-use −1-omen tokens; `essenceDiscountPercent` is a permanent
 * additive discount on essence-priced shop slots.
 */
export interface ShopModifiers {
  readonly freeRerolls: number;
  readonly upcomingOmenDiscounts: number;
  readonly essenceDiscountPercent: number;
}

/** The top-level quest state object. */
export interface QuestState {
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
   * lost. Defaults to 500; effects such as Dream Journey rewards can raise it.
   */
  essenceCap: number;
  /**
   * Omens currency. Spent only on shop Dreamsign purchases and shop rerolls.
   * Uncapped.
   */
  omens: number;
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
   * Modifiers consumed at shop sites. Free-reroll grants stack additively,
   * the omen-discount queue is FIFO, and the essence discount is a permanent
   * additive percentage applied to every essence-priced shop purchase.
   */
  readonly shopModifiers: ShopModifiers;
  /**
   * Modifiers consumed by future dreamscapes. Each modifier decrements when
   * a new dreamscape opens; entries at zero drop on the same tick.
   */
  readonly dreamscapeModifiers: readonly DreamscapeModifier[];
}
