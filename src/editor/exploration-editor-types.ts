import type { CardData, CardType } from "../types/cards";
import type { Dreamsign, TransfigurationType } from "../types/journey";
import type {
  ExplorationEffectKind,
  ExplorationFixedSiteType,
  ExplorationPredicate,
} from "../data/exploration";
import type {
  RewardMechanicId,
  RewardSelectionPolicyId,
} from "../reward-selection";
import type { CardId } from "../types/card-identity";
import type { DreamsignId, ExplorationActionId } from "../types/identifiers";

export type EncounterRenderedTemplatePart =
  | { kind: "text"; text: string }
  | {
      kind: "variable";
      placeholder: string;
      variableName: string;
      value: unknown;
      text: string;
    }
  | {
      kind: "card";
      placeholder: string;
      cardId: CardId;
      cardName: string;
    }
  | {
      kind: "dreamsign";
      placeholder: string;
      dreamsignId: DreamsignId;
      dreamsignName: string;
    };

export interface EncounterRuntimeCardSelection {
  placeholder: string;
  predicate: string | null;
  cardId: CardId;
  cardName: string;
  source:
    | "player_deck"
    | "catalog_fallback"
    | "offer_pool"
    | "starter_deck"
    | "fixed_reference";
}

export type ExplorationEditorControl =
  | "number"
  | "predicate"
  | "card"
  | "dreamsign"
  | "subtype"
  | "subtype-options"
  | "transfiguration"
  | "card-type"
  | "site-type"
  | "deck-target";

export interface ExplorationEditorFieldOption {
  value: string;
  label: string;
}

export interface ExplorationEditorFieldDefinition {
  key: string;
  label: string;
  control: ExplorationEditorControl;
  defaultValue?: string | number;
  optional?: boolean;
  options?: ExplorationEditorFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  resource?: "essence" | "energy" | "spark";
}

export interface ExplorationEditorEffectSchema {
  kind: ExplorationEffectKind;
  label: string;
  fields: ExplorationEditorFieldDefinition[];
  canonicalMechanicId?: RewardMechanicId;
  defaultSelectionPolicyId?: RewardSelectionPolicyId;
  allowedSelectionPolicyIds?: RewardSelectionPolicyId[];
  requiresFollowup?: boolean;
}

export interface ExplorationEditorAction {
  id: ExplorationActionId;
  label: string;
  effectText: string;
  renderedEffectText: string;
  renderedEffectParts: EncounterRenderedTemplatePart[];
  runtimeCardSelections: EncounterRuntimeCardSelection[];
  followupTitle?: string;
  followupSubtitle?: string;
  effectKind: ExplorationEffectKind;
  canonicalMechanicId?: RewardMechanicId;
  selectionPolicyId?: RewardSelectionPolicyId;
  predicate?: ExplorationPredicate;
  count?: number;
  cardType?: CardType;
  cardId?: CardId;
  dreamsignId?: DreamsignId;
  packCount?: number;
  packSize?: number;
  offerCount?: number;
  essencePerSpark?: number;
  essencePerCard?: number;
  sparkBonus?: number;
  essence?: number;
  energyCostReduction?: number;
  subtype?: string;
  subtypeOptions?: string[];
  nightmareCount?: number;
  transfiguration?: TransfigurationType;
  deckTarget?: "chosen" | "offered";
  siteType?: ExplorationFixedSiteType;
  [key: string]: unknown;
}

export interface ExplorationEditorEncounter {
  cardId: CardId;
  cardName: string;
  cardAbilityText: string;
  imageNumber: number;
  prose: string;
  actions: ExplorationEditorAction[];
}

export interface ExplorationEditorServerData {
  encounters: ExplorationEditorEncounter[];
  effectSchemas: ExplorationEditorEffectSchema[];
  predicates: Array<{ value: string; label: string }>;
  transfigurations: TransfigurationType[];
  subtypes: string[];
  sourceRevision?: string;
}

export interface ExplorationEditorLoadResult extends ExplorationEditorServerData {
  cards: CardData[];
  dreamsigns: Dreamsign[];
}

export interface ExplorationEditorClient {
  load(signal?: AbortSignal): Promise<ExplorationEditorLoadResult>;
  saveProse(request: {
    cardId: CardId;
    value: string;
    clientRevision: number;
  }): Promise<{ data: ExplorationEditorServerData; clientRevision: number }>;
  saveAction(request: {
    cardId: CardId;
    slot: number;
    action: ExplorationEditorAction;
    clientRevision: number;
  }): Promise<{ data: ExplorationEditorServerData; clientRevision: number }>;
}
