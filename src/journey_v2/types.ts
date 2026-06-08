import type { FitModel } from "../draft/replay/fit-model";
import type { QuestContent } from "../data/quest-content";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type { DeckEntry, SiteState } from "../types/quest";

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
}

export interface MerchantCatalogCard extends MerchantCardIdentity {
  objectType: "catalogCard";
  card: CardData;
  displayName: string;
}

export interface MerchantSupportNeed {
  theme: string;
  tier: number;
}

export interface MerchantSupportMeta {
  name?: string;
  needs?: readonly MerchantSupportNeed[];
  supports?: readonly string[];
}

export interface MerchantContext {
  questSeed: string;
  site: SiteState;
  essence: number;
  essenceCap: number;
  deckCards: readonly MerchantDeckCard[];
  cardByUuid: ReadonlyMap<string, CardData>;
  cardByNumber: ReadonlyMap<number, CardData>;
  deckEntryById: ReadonlyMap<string, MerchantDeckCard>;
  supportMetaByUuid: ReadonlyMap<string, MerchantSupportMeta>;
  ownedCardUuids: ReadonlySet<string>;
  heldDreamsignIds: ReadonlySet<string>;
  candidateGrantCards: readonly MerchantCatalogCard[];
  candidateDreamsigns: readonly DreamsignTemplate[];
  fitModel?: FitModel;
  cardDatabase: QuestContent["cardDatabase"];
  dreamsignTemplates: readonly DreamsignTemplate[];
}

export type MerchantNeed =
  | {
      needId: string;
      needType: "card";
      label: string;
      score: number;
      cardUuid: string;
      cardNumber: number;
      entryId?: string;
      dreamsignId?: string;
    }
  | {
      needId: string;
      needType: "theme";
      themeId: string;
      label: string;
      score: number;
      cardUuid?: string;
      cardNumber?: number;
      entryId?: string;
      dreamsignId?: string;
    };

export type MerchantReward =
  | ({
      rewardBuilderId: string;
      rewardType: "cardGrant";
      card: CardData;
      displayName: string;
    } & MerchantCardIdentity)
  | {
      rewardBuilderId: string;
      rewardType: "dreamsign";
      dreamsignId: string;
      dreamsignTemplate: DreamsignTemplate;
      displayName: string;
    }
  | {
      rewardBuilderId: string;
      rewardType: "essence";
      amount: number;
    };

export interface MerchantChoiceRequest {
  context: MerchantContext;
  need: MerchantNeed;
  rewardBuilderId: string;
  choiceCount: number;
}

export interface MerchantChoice {
  choiceId: string;
  needId: string;
  rewardBuilderId: string;
  reward: MerchantReward;
}

export interface MerchantOffer {
  offerId: string;
  encounterSignature: string;
  rewardBuilderId: string;
  needId: string;
  price: number;
  rewards: readonly MerchantReward[];
  choice?: MerchantChoice;
}

export interface MerchantEncounter {
  encounterSignature: string;
  siteId: string;
  offers: readonly MerchantOffer[];
}

export interface MerchantAcceptRequest {
  encounterSignature: string;
  offerId: string;
  expectedPrice: number;
  rewardBuilderId: string;
  needId: string;
  choice?: MerchantChoice;
}

export interface MerchantDeclineRequest {
  encounterSignature: string;
  offerId: string;
  needId?: string;
  rewardBuilderId?: string;
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
    }
  | {
      objectType: "essence";
      amount: number;
    };
