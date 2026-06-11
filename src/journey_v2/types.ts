import type { FitModel } from "../draft/replay/fit-model";
import type { MerchantCorpus } from "../data/merchant-corpus";
import type { DreamsignProfile } from "../data/dreamsign-profiles";
import type { QuestContent } from "../data/quest-content";
import type { CardTransfigurationDisplay } from "../transfiguration/transfiguration-logic";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type {
  CardKeywordModification,
  CardTypeChange,
  DeckEntry,
  SiteState,
  SiteType,
  TransfigurationType,
} from "../types/quest";
import type {
  MerchantArchetypeId,
  MerchantOfferFamily,
} from "./archetypes/types";
import type { MerchantOfferTrace } from "./trace/types";

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
  questSeed: string;
  site: SiteState;
  /**
   * Debug reroll counter for this site. Mixed into the encounter RNG salt so a
   * non-zero value produces a fresh encounter from the same quest parameters
   * (seed, deck, dreamsigns). Defaults to `0`, which leaves the salt unchanged
   * so untouched encounters keep their original signatures.
   */
  rerollNonce?: number;
  /**
   * Debug-only: when set to an eligible `MerchantArchetypeId`, the generator
   * forces the first offer (slot A) to use that archetype instead of weighted
   * sampling. Typed as `string` because it is a persisted passthrough from
   * `DreamJourneySiteRuntime`; the generator validates it against the eligible
   * builder set and ignores values that are not eligible.
   */
  forcedArchetypeId?: string;
  /** Retained on the context for other screens; the merchant ignores it. */
  essence: number;
  /** Retained on the context for other screens; the merchant ignores it. */
  essenceCap: number;
  deckCards: readonly MerchantDeckCard[];
  cardByUuid: ReadonlyMap<string, CardData>;
  cardByNumber: ReadonlyMap<number, CardData>;
  deckEntryById: ReadonlyMap<string, MerchantDeckCard>;
  ownedCardUuids: ReadonlySet<string>;
  heldDreamsignIds: ReadonlySet<string>;
  heldDreamsignFallbackNames: ReadonlySet<string>;
  /** Non-starter pool cards eligible as grant targets. */
  candidateGrantCards: readonly MerchantCatalogCard[];
  /** Unheld dreamsign templates. */
  candidateDreamsigns: readonly DreamsignTemplate[];
  fitModel?: FitModel;
  /** Baked quality/multiplicity/cluster signals; absent before the bake step. */
  merchantCorpus?: MerchantCorpus;
  /** Curated dreamsign profiles keyed by dreamsign UUID. */
  dreamsignProfiles?: ReadonlyMap<string, DreamsignProfile>;
  cardDatabase: QuestContent["cardDatabase"];
  dreamsignTemplates: readonly DreamsignTemplate[];
}

export type MerchantApplyPayload =
  | {
      kind: "add_catalog_card";
      cardUuid: string;
      cardNumber: number;
      /**
       * When set, the granted deck entry enters pre-transfigured with this
       * transfiguration. Used by `transfigured_draft`, where a composite child
       * cannot target a deck entry that does not exist yet.
       */
      transfiguration?: TransfigurationType;
    }
  | {
      kind: "add_dreamsign";
      dreamsignId: string;
      dreamsignTemplate: DreamsignTemplate;
    }
  | {
      kind: "transfigure_deck_entry";
      entryId: string;
      cardUuid: string;
      cardNumber: number;
      transfiguration: TransfigurationType;
      previewCard: CardData;
      description: string;
    }
  | {
      kind: "duplicate_deck_entry";
      entryId: string;
      cardUuid: string;
      cardNumber: number;
    }
  | {
      kind: "remove_deck_entry";
      entryId: string;
      cardUuid: string;
      cardNumber: number;
    }
  | {
      kind: "change_deck_entry_keywords";
      entryId: string;
      cardUuid: string;
      cardNumber: number;
      keywords: CardKeywordModification;
    }
  | {
      kind: "change_deck_entry_type";
      entryId: string;
      cardUuid: string;
      cardNumber: number;
      typeChange: CardTypeChange;
    }
  | {
      kind: "add_site";
      siteType: SiteType;
    }
  | {
      kind: "composite";
      children: readonly MerchantApplyPayload[];
    };

export interface MerchantChoiceRequest {
  choiceType: "catalogCard" | "dreamsign" | "replacementCard";
  prompt: string;
  candidates: readonly MerchantChoiceCandidate[];
}

export interface MerchantChoice {
  choiceId: string;
}

export interface MerchantChoiceCandidate {
  choiceId: string;
  title: string;
  summary: string;
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
  title: string;
  summary: string;
  targetKey: string;
  gameObjects: readonly MerchantGameObject[];
  applyPayload?: MerchantApplyPayload;
  choiceRequest?: MerchantChoiceRequest;
  /** Pure explanation of how this offer's target(s) were chosen; logged per offer. */
  trace?: MerchantOfferTrace;
}

/** A single merchant line hinting at one seeded-chosen offer. */
export interface MerchantDialogueLine {
  line: string;
  offerId: string;
}

export interface MerchantEncounter {
  encounterSignature: string;
  siteId: string;
  offers: readonly MerchantOffer[];
  dialogue: MerchantDialogueLine;
  /** Short reaction shown after the player accepts. */
  acceptReaction: string;
}

export interface MerchantAcceptRequest {
  encounterSignature: string;
  offerId: string;
  archetypeId: MerchantArchetypeId;
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
