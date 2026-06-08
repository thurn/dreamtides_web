import type { FitModel } from "../draft/replay/fit-model";
import type { QuestContent } from "../data/quest-content";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type { DeckEntry, SiteState, TransfigurationType } from "../types/quest";

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
