import type { FitModel } from "../draft/replay/fit-model";
import type { MerchantCorpus } from "../data/merchant-corpus";
import type { DreamsignProfile } from "../data/dreamsign-profiles";
import type { QuestContent } from "../data/quest-content";
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
}

export interface MerchantCatalogCard extends MerchantCardIdentity {
  objectType: "catalogCard";
  card: CardData;
  displayName: string;
  badge?: MerchantGameObjectBadge;
}

export interface MerchantContext {
  questSeed: string;
  site: SiteState;
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
  hiddenUntilCommit: boolean;
  targetKey: string;
  gameObjects: readonly MerchantGameObject[];
  applyPayload?: MerchantApplyPayload;
  choiceRequest?: MerchantChoiceRequest;
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
