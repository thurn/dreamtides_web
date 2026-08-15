import type { JourneyContent } from "../data/journey-content";
import type { JourneySeed } from "../types/journey-seed";
import type { CardTransfigurationDisplay } from "../transfiguration/transfiguration-logic";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type { JourneyRewardEffect } from "../rules/journey/reward-effects";
import type { SitesData } from "../types/sites-data";
import type { DeckEntry, SiteState } from "../types/journey";
import type { AuguryOfferFamily } from "./archetypes/types";
import type { AuguryOfferTrace } from "./trace/types";
import type {
  RewardMechanicId,
  RewardSelectionContext,
  RewardSelectionPolicyId,
  RewardSelectionTrace,
  SelectionRulesVersion,
} from "../reward-selection/types";
import type { DeckEntryId } from "../types/identifiers";
import type { DreamsignId } from "../types/identifiers";
import type { ChoiceId } from "../types/identifiers";
import type { OfferId } from "../types/identifiers";
import type { SiteId } from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import type { SelectionContentRevision } from "../types/selection-content-revision";
import type { StableDigest } from "../types/stable-digest";
import type {
  AuguryArchetypeId,
  AuguryTargetKey,
  SelectionKey,
} from "../types/identifiers";

export interface AuguryGameObjectBadge {
  label: string;
  detail?: string;
}

export interface AuguryCardIdentity {
  cardUuid: CardId;
  cardNumber: number;
  entryId?: DeckEntryId;
  dreamsignId?: DreamsignId;
}

export interface AuguryDeckCard extends AuguryCardIdentity {
  objectType: "deckCard";
  entryId: DeckEntryId;
  deckEntry: DeckEntry;
  card: CardData;
  displayName: string;
  badge?: AuguryGameObjectBadge;
  previewCard?: CardData;
  /**
   * When the object's `card`/`previewCard` shows a transfigured result, this
   * paints the hover preview with the transfiguration tint and marks the
   * changed spans. Absent for plain (non-transfigured) cards and for keyword /
   * type-change previews, whose changed text is already shown without a tint.
   */
  transfiguration?: CardTransfigurationDisplay;
}

export interface AuguryCatalogCard extends AuguryCardIdentity {
  objectType: "catalogCard";
  card: CardData;
  displayName: string;
  badge?: AuguryGameObjectBadge;
  /** Paints the hover preview as transfigured; see {@link AuguryDeckCard}. */
  transfiguration?: CardTransfigurationDisplay;
}

export interface AuguryContext {
  sitesData: SitesData;
  journeySeed: JourneySeed;
  site: SiteState;
  /** Canonical Augury slot scope injected by encounter generation. */
  selectionKey?: SelectionKey;
  /**
   * Debug reroll counter for this site. Mixed into the encounter RNG salt so a
   * non-zero value produces a fresh encounter from the same journey parameters
   * (seed, deck, dreamsigns). Defaults to `0`, which leaves the salt unchanged
   * so untouched encounters keep their original signatures.
   */
  rerollNonce?: number;
  /**
   * Debug-only: when set to an eligible `AuguryArchetypeId`, the generator
   * forces the first offer (slot A) to use that archetype instead of weighted
   * sampling. Typed as `string` because it is a persisted passthrough from
   * `AugurySiteRuntime`; the generator validates it against the eligible
   * builder set and ignores values that are not eligible.
   */
  forcedArchetypeId?: AuguryArchetypeId;
  /** Retained on the context for other screens; the augury ignores it. */
  essence: number;
  deckCards: readonly AuguryDeckCard[];
  cardByUuid: ReadonlyMap<CardId, CardData>;
  cardByNumber: ReadonlyMap<number, CardData>;
  deckEntryById: ReadonlyMap<DeckEntryId, AuguryDeckCard>;
  ownedCardUuids: ReadonlySet<CardId>;
  /**
   * UUIDs of the cards in this journey's resolved draft pool (the cards the player
   * could actually draft this game). Empty when no draft pool has been resolved.
   * Category drafts (`category_draft_known`) only offer cards in this set, and
   * every grant trace marks each candidate's pool membership (`inDraftPool`) so a
   * log reader can tell pool cards from global-catalog cards.
   */
  draftPoolCardUuids: ReadonlySet<CardId>;
  heldDreamsignIds: ReadonlySet<DreamsignId>;
  heldDreamsignFallbackNames: ReadonlySet<string>;
  /** Non-starter pool cards eligible as grant targets. */
  candidateGrantCards: readonly AuguryCatalogCard[];
  /** Unheld dreamsign templates. */
  candidateDreamsigns: readonly DreamsignTemplate[];
  cardDatabase: JourneyContent["cardDatabase"];
  dreamsignTemplates: readonly DreamsignTemplate[];
  /** Site-neutral projection consumed by the shared selection core. */
  rewardSelection: RewardSelectionContext;
}

type AuguryTransfigurationPayload = Extract<
  JourneyRewardEffect,
  { kind: "transfigure_deck_entry" }
> & {
  previewCard: CardData;
  description: string;
};

/** Augury-facing reward payload with its presentation-only preview fields. */
export type AuguryApplyPayload =
  | Exclude<
      JourneyRewardEffect,
      { kind: "transfigure_deck_entry" } | { kind: "composite" }
    >
  | AuguryTransfigurationPayload
  | { kind: "composite"; children: readonly AuguryApplyPayload[] };

export interface AuguryChoiceRequest {
  choiceType: "catalogCard" | "dreamsign" | "replacementCard";
  candidates: readonly AuguryChoiceCandidate[];
}

export interface AuguryChoice {
  choiceId: ChoiceId;
}

export interface AuguryChoiceCandidate {
  choiceId: ChoiceId;
  gameObjects: readonly AuguryGameObject[];
  applyPayload: AuguryApplyPayload;
  cardUuid?: CardId;
  cardNumber?: number;
  dreamsignId?: DreamsignId;
}

export interface AuguryOffer {
  offerId: OfferId;
  encounterSignature: StableDigest;
  archetypeId: AuguryArchetypeId;
  family: AuguryOfferFamily;
  targetKey: AuguryTargetKey;
  gameObjects: readonly AuguryGameObject[];
  applyPayload?: AuguryApplyPayload;
  choiceRequest?: AuguryChoiceRequest;
  /** Pure explanation of how this offer's target(s) were chosen; logged per offer. */
  trace?: AuguryOfferTrace;
  mechanicId?: RewardMechanicId;
  policyId?: RewardSelectionPolicyId;
  selectionKey?: SelectionKey;
  selectionRulesVersion?: SelectionRulesVersion;
  selectionContentRevision?: SelectionContentRevision;
  selectionTrace?: RewardSelectionTrace;
}

export interface AuguryEncounter {
  encounterSignature: StableDigest;
  siteId: SiteId;
  selectionRulesVersion?: SelectionRulesVersion;
  selectionContentRevision?: SelectionContentRevision;
  offers: readonly AuguryOffer[];
}

export interface AuguryAcceptRequest {
  encounterSignature: StableDigest;
  offerId: OfferId;
  archetypeId: AuguryArchetypeId;
  selectionRulesVersion?: SelectionRulesVersion;
  choice?: AuguryChoice;
}

export type AuguryOfferFailureReason =
  | "encounter_unavailable"
  | "stale_encounter"
  | "offer_not_found"
  | "archetype_mismatch"
  | "missing_choice"
  | "invalid_choice"
  | "target_unavailable"
  | "site_unavailable";

export type AuguryOfferActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: AuguryOfferFailureReason;
    };

export interface AuguryDeclineRequest {
  encounterSignature: StableDigest;
  offerId: OfferId;
  selectionRulesVersion?: SelectionRulesVersion;
  choice?: AuguryChoice;
}

export type AuguryGameObject =
  | AuguryCatalogCard
  | AuguryDeckCard
  | {
      objectType: "dreamsign";
      dreamsignId: DreamsignId;
      dreamsignTemplate: DreamsignTemplate;
      displayName: string;
      badge?: AuguryGameObjectBadge;
    };
