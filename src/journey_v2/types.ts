import type { JourneyContent } from "../data/journey-content";
import type { CardTransfigurationDisplay } from "../transfiguration/transfiguration-logic";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type { JourneyRewardEffect } from "../rules/journey/reward-effects";
import type { SitesData } from "../types/sites-data";
import type { DeckEntry, SiteState } from "../types/journey";
import type {
  MerchantArchetypeId,
  MerchantOfferFamily,
} from "./archetypes/types";
import type { MerchantOfferTrace } from "./trace/types";
import type {
  RewardMechanicId,
  RewardSelectionContext,
  RewardSelectionPolicyId,
  RewardSelectionTrace,
} from "../reward-selection/types";

export interface MerchantGameObjectBadge {
  label: string;
  detail?: string;
}

export interface MerchantCardIdentity {
  cardUuid: string;
  cardNumber: number;
  entryId?: string;
  dreamsignId?: string;
}

export interface MerchantDeckCard extends MerchantCardIdentity {
  objectType: "deckCard";
  entryId: string;
  deckEntry: DeckEntry;
  card: CardData;
  displayName: string;
  badge?: MerchantGameObjectBadge;
  previewCard?: CardData;
  /**
   * When the object's `card`/`previewCard` shows a transfigured result, this
   * paints the hover preview with the transfiguration tint and marks the
   * changed spans. Absent for plain (non-transfigured) cards and for keyword /
   * type-change previews, whose changed text is already shown without a tint.
   */
  transfiguration?: CardTransfigurationDisplay;
}

export interface MerchantCatalogCard extends MerchantCardIdentity {
  objectType: "catalogCard";
  card: CardData;
  displayName: string;
  badge?: MerchantGameObjectBadge;
  /** Paints the hover preview as transfigured; see {@link MerchantDeckCard}. */
  transfiguration?: CardTransfigurationDisplay;
}

export interface MerchantContext {
  sitesData: SitesData;
  journeySeed: string;
  site: SiteState;
  /** Canonical Augury slot scope injected by encounter generation. */
  selectionKey?: string;
  /**
   * Debug reroll counter for this site. Mixed into the encounter RNG salt so a
   * non-zero value produces a fresh encounter from the same journey parameters
   * (seed, deck, dreamsigns). Defaults to `0`, which leaves the salt unchanged
   * so untouched encounters keep their original signatures.
   */
  rerollNonce?: number;
  /**
   * Debug-only: when set to an eligible `MerchantArchetypeId`, the generator
   * forces the first offer (slot A) to use that archetype instead of weighted
   * sampling. Typed as `string` because it is a persisted passthrough from
   * `AugurySiteRuntime`; the generator validates it against the eligible
   * builder set and ignores values that are not eligible.
   */
  forcedArchetypeId?: string;
  /** Retained on the context for other screens; the merchant ignores it. */
  essence: number;
  deckCards: readonly MerchantDeckCard[];
  cardByUuid: ReadonlyMap<string, CardData>;
  cardByNumber: ReadonlyMap<number, CardData>;
  deckEntryById: ReadonlyMap<string, MerchantDeckCard>;
  ownedCardUuids: ReadonlySet<string>;
  /**
   * UUIDs of the cards in this journey's resolved draft pool (the cards the player
   * could actually draft this game). Empty when no draft pool has been resolved.
   * Category drafts (`category_draft_known`) only offer cards in this set, and
   * every grant trace marks each candidate's pool membership (`inDraftPool`) so a
   * log reader can tell pool cards from global-catalog cards.
   */
  draftPoolCardUuids: ReadonlySet<string>;
  heldDreamsignIds: ReadonlySet<string>;
  heldDreamsignFallbackNames: ReadonlySet<string>;
  /** Non-starter pool cards eligible as grant targets. */
  candidateGrantCards: readonly MerchantCatalogCard[];
  /** Unheld dreamsign templates. */
  candidateDreamsigns: readonly DreamsignTemplate[];
  cardDatabase: JourneyContent["cardDatabase"];
  dreamsignTemplates: readonly DreamsignTemplate[];
  /** Site-neutral projection consumed by the shared selection core. */
  rewardSelection: RewardSelectionContext;
}

type MerchantTransfigurationPayload = Extract<
  JourneyRewardEffect,
  { kind: "transfigure_deck_entry" }
> & {
  previewCard: CardData;
  description: string;
};

/** Merchant-facing reward payload with its presentation-only preview fields. */
export type MerchantApplyPayload =
  | Exclude<
      JourneyRewardEffect,
      { kind: "transfigure_deck_entry" } | { kind: "composite" }
    >
  | MerchantTransfigurationPayload
  | { kind: "composite"; children: readonly MerchantApplyPayload[] };

export interface MerchantChoiceRequest {
  choiceType: "catalogCard" | "dreamsign" | "replacementCard";
  candidates: readonly MerchantChoiceCandidate[];
}

export interface MerchantChoice {
  choiceId: string;
}

export interface MerchantChoiceCandidate {
  choiceId: string;
  gameObjects: readonly MerchantGameObject[];
  applyPayload: MerchantApplyPayload;
  cardUuid?: string;
  cardNumber?: number;
  dreamsignId?: string;
}

export interface MerchantOffer {
  offerId: string;
  encounterSignature: string;
  archetypeId: MerchantArchetypeId;
  family: MerchantOfferFamily;
  targetKey: string;
  gameObjects: readonly MerchantGameObject[];
  applyPayload?: MerchantApplyPayload;
  choiceRequest?: MerchantChoiceRequest;
  /** Pure explanation of how this offer's target(s) were chosen; logged per offer. */
  trace?: MerchantOfferTrace;
  mechanicId?: RewardMechanicId;
  policyId?: RewardSelectionPolicyId;
  selectionKey?: string;
  selectionRulesVersion?: string;
  selectionContentRevision?: string;
  selectionTrace?: RewardSelectionTrace;
}

export interface MerchantEncounter {
  encounterSignature: string;
  siteId: string;
  selectionRulesVersion?: string;
  selectionContentRevision?: string;
  offers: readonly MerchantOffer[];
}

export interface MerchantAcceptRequest {
  encounterSignature: string;
  offerId: string;
  archetypeId: MerchantArchetypeId;
  selectionRulesVersion?: string;
  choice?: MerchantChoice;
}

export type MerchantOfferActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
    };

export interface MerchantDeclineRequest {
  encounterSignature: string;
  offerId: string;
  selectionRulesVersion?: string;
  choice?: MerchantChoice;
}

export type MerchantGameObject =
  | MerchantCatalogCard
  | MerchantDeckCard
  | {
      objectType: "dreamsign";
      dreamsignId: string;
      dreamsignTemplate: DreamsignTemplate;
      displayName: string;
      badge?: MerchantGameObjectBadge;
    };
