import type { FitModel } from "../draft/replay/fit-model";
import type { QuestContent } from "../data/quest-content";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type { MerchantRewardFamily, MerchantRewardPrice } from "./catalog/pricing";
import type {
  CardKeywordModification,
  CardTypeChange,
  DeckEntry,
  SiteState,
  TransfigurationType,
} from "../types/quest";

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
  heldDreamsignFallbackNames: ReadonlySet<string>;
  candidateGrantCards: readonly MerchantCatalogCard[];
  candidateDreamsigns: readonly DreamsignTemplate[];
  fitModel?: FitModel;
  cardDatabase: QuestContent["cardDatabase"];
  dreamsignTemplates: readonly DreamsignTemplate[];
}

export type MerchantNeedKind =
  | "under_supported_payoff"
  | "missing_role"
  | "upgrade_target"
  | "curve_problem"
  | "weak_card"
  | "dreamsign_gap";

export type MerchantRoleNeed =
  | "draw"
  | "recursion"
  | "interaction"
  | "cheap_early_play"
  | "events"
  | "characters"
  | "abandon_outlet"
  | "finisher";

export interface MerchantNeedObservation {
  summary: string;
  subject?: string;
  roleLabel?: string;
  theme?: string;
  metric?: {
    label: string;
    value?: string | number;
    from?: string | number | null;
    to?: string | number | null;
  };
}

export interface MerchantNeedReference extends MerchantCardIdentity {
  displayName?: string;
}

export interface MerchantNeedProjection {
  transfiguration: TransfigurationType;
  description: string;
  metric?: MerchantNeedObservation["metric"];
  previewCard: CardData;
}

export interface MerchantNeedBase {
  needId: string;
  needType: "card" | "theme";
  needKind: MerchantNeedKind;
  label: string;
  score: number;
  severity: number;
  confidence: number;
  observation: MerchantNeedObservation;
  compatibleRewardBuilderIds: readonly string[];
  dreamsignId?: string;
}

export interface MerchantCardTargetNeed extends MerchantNeedBase {
  needType: "card";
  cardUuid: string;
  cardNumber: number;
  entryId: string;
  references: readonly MerchantNeedReference[];
}

export interface MerchantThemeNeed extends MerchantNeedBase {
  needType: "theme";
  themeId?: string;
}

export interface MerchantUnderSupportedPayoffNeed extends MerchantCardTargetNeed {
  needKind: "under_supported_payoff";
  themeId: string;
  support: {
    theme: string;
    tier: number;
    supportCount: number;
    adequacy: number;
  };
}

export interface MerchantUpgradeTargetNeed extends MerchantCardTargetNeed {
  needKind: "upgrade_target";
  projection: MerchantNeedProjection;
}

export interface MerchantWeakCardNeed extends MerchantCardTargetNeed {
  needKind: "weak_card";
}

export interface MerchantMissingRoleNeed extends MerchantThemeNeed {
  needKind: "missing_role";
  themeId: string;
  role?: MerchantRoleNeed;
  support: {
    theme: string;
    supportCount?: number;
    requiredCount?: number;
  };
}

export interface MerchantCurveProblemNeed extends MerchantThemeNeed {
  needKind: "curve_problem";
  themeId: "curve";
  role: "cheap_early_play";
  curveDirection: "top_heavy" | "early_plays";
  support: {
    theme: "curve";
    supportCount: number;
    requiredCount: number;
  };
}

export interface MerchantDreamsignGapNeed extends MerchantThemeNeed {
  needKind: "dreamsign_gap";
  themeId: "dreamsign";
  dreamsignId: string;
}

export type MerchantNeed =
  | MerchantUnderSupportedPayoffNeed
  | MerchantUpgradeTargetNeed
  | MerchantWeakCardNeed
  | MerchantMissingRoleNeed
  | MerchantCurveProblemNeed
  | MerchantDreamsignGapNeed;

export type MerchantRewardBuilderId =
  | "grant_support_card"
  | "grant_dreamsign"
  | "transfigure_card"
  | "purge_weak_card"
  | "duplicate_keystone"
  | "replace_weak_with_fit"
  | "gain_essence"
  | "raise_essence_cap"
  | "add_reclaim_to_event"
  | "add_fast_to_event"
  | "reduce_reclaim_cost"
  | "convert_event_to_role"
  | "grant_exact_card";

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
      kind: "change_essence";
      amount: number;
    }
  | {
      kind: "change_max_essence";
      amount: number;
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
  needId: string;
  builderId: MerchantRewardBuilderId;
  gameObjects: readonly MerchantGameObject[];
  valueEssence: number;
  applyPayload: MerchantApplyPayload;
  cardUuid?: string;
  cardNumber?: number;
  dreamsignId?: string;
}

export interface MerchantReward {
  builderId: MerchantRewardBuilderId;
  title: string;
  summary: string;
  answersNeedIds: readonly string[];
  gameObjects: readonly MerchantGameObject[];
  valueEssence: number;
  applyPayload?: MerchantApplyPayload;
  choiceRequest?: MerchantChoiceRequest;
}

export interface MerchantOffer {
  offerId: string;
  encounterSignature: string;
  rewardBuilderId: MerchantRewardBuilderId;
  needId: string;
  price: number;
  priceDetail: MerchantRewardPrice;
  locked: boolean;
  lockedReason?: MerchantRewardPrice["lockedReason"];
  reward: MerchantReward;
  rewards: readonly MerchantReward[];
  choice?: MerchantChoice;
}

export type MerchantDialogueBeatKind =
  | "greeting"
  | "observation"
  | "offer_framing"
  | "price_framing"
  | "walk_away"
  | "accept_reaction"
  | "decline_reaction";

export interface MerchantDialogueBeat {
  id: string;
  templateId: string;
  kind: MerchantDialogueBeatKind;
  text: string;
  offerId?: string;
  needId?: string;
  rewardBuilderId?: MerchantRewardBuilderId;
  rewardFamily?: MerchantRewardFamily;
  price?: number;
}

export interface MerchantEncounter {
  encounterSignature: string;
  siteId: string;
  offers: readonly MerchantOffer[];
  dialogue: readonly MerchantDialogueBeat[];
}

export interface MerchantAcceptRequest {
  encounterSignature: string;
  offerId: string;
  expectedPrice: number;
  rewardBuilderId: MerchantRewardBuilderId;
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
      badge?: MerchantGameObjectBadge;
    }
  | {
      objectType: "essence";
      amount: number;
      badge?: MerchantGameObjectBadge;
    };
