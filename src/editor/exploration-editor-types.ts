import type { CardData } from "../types/cards";
import type { Dreamsign, TransfigurationType } from "../types/journey";
import type {
  ExplorationEffectKind,
  ExplorationPredicate,
} from "../data/exploration";
import type {
  RewardMechanicId,
  RewardSelectionPolicyId,
} from "../reward-selection";

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
    cardId: string;
    cardName: string;
  }
  | {
    kind: "dreamsign";
    placeholder: string;
    dreamsignId: string;
    dreamsignName: string;
  };

export interface EncounterRuntimeCardSelection {
  placeholder: string;
  predicate: string | null;
  cardId: string;
  cardName: string;
  source: "player_deck" | "catalog_fallback" | "offer_pool" | "starter_deck";
}

export type ExplorationEditorControl =
  | "number"
  | "predicate"
  | "card"
  | "dreamsign"
  | "subtype"
  | "subtype-options"
  | "transfiguration"
  | "deck-target";

export interface ExplorationEditorFieldDefinition {
  key: string;
  label: string;
  control: ExplorationEditorControl;
  defaultValue?: string | number;
  optional?: boolean;
  min?: number;
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
}

export interface ExplorationEditorAction {
  id: string;
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
  cardId?: string;
  dreamsignId?: string;
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
  [key: string]: unknown;
}

export interface ExplorationEditorEncounter {
  cardId: string;
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
    cardId: string;
    value: string;
    clientRevision: number;
  }): Promise<{ data: ExplorationEditorServerData; clientRevision: number }>;
  saveAction(request: {
    cardId: string;
    slot: number;
    action: ExplorationEditorAction;
    clientRevision: number;
  }): Promise<{ data: ExplorationEditorServerData; clientRevision: number }>;
}
