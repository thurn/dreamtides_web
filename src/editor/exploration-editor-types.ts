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
import type {
  EncounterRenderedTemplatePart,
  EncounterRuntimeCardSelection,
  EncounterTemplateHealth,
} from "./exploration-candidates-editor-types";

export type ExplorationEditorControl =
  | "number"
  | "predicate"
  | "card"
  | "dreamsign"
  | "subtype"
  | "subtype-options"
  | "transfiguration";

export interface ExplorationEditorFieldDefinition {
  key: string;
  label: string;
  control: ExplorationEditorControl;
  defaultValue?: string | number;
  optional?: boolean;
  min?: number;
  step?: number;
  templateIds?: number[];
  resource?: "essence" | "energy" | "spark";
}

export interface ExplorationEditorEffectDefinition {
  kind: ExplorationEffectKind;
  label: string;
  templateIds: number[];
  fields: ExplorationEditorFieldDefinition[];
  canonicalMechanicId?: RewardMechanicId;
  defaultSelectionPolicyId?: RewardSelectionPolicyId;
  allowedSelectionPolicyIds?: RewardSelectionPolicyId[];
}

export interface ExplorationEditorTemplate {
  id: number;
  text: string;
}

export interface ExplorationEditorAction {
  id: string;
  label: string;
  effectText: string;
  renderedEffectText: string;
  renderedEffectParts: EncounterRenderedTemplatePart[];
  runtimeCardSelections: EncounterRuntimeCardSelection[];
  templateId: number;
  template: string;
  templateVariables: Record<string, unknown>;
  selection?: Record<string, { predicate: string }>;
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
  [key: string]: unknown;
}

export interface ExplorationEditorEncounter {
  cardId: string;
  cardName: string;
  cardAbilityText: string;
  imageNumber: number;
  prose: string;
  actions: [ExplorationEditorAction, ExplorationEditorAction];
}

export interface ExplorationEditorServerData {
  encounters: ExplorationEditorEncounter[];
  templates: ExplorationEditorTemplate[];
  effectDefinitions: ExplorationEditorEffectDefinition[];
  predicates: Array<{ value: string; label: string }>;
  transfigurations: TransfigurationType[];
  subtypes: string[];
}

export interface ExplorationEditorLoadResult extends ExplorationEditorServerData {
  cards: CardData[];
  dreamsigns: Dreamsign[];
}

export interface ExplorationEditorClient {
  load(signal?: AbortSignal): Promise<ExplorationEditorLoadResult>;
  loadTemplateHealth(signal?: AbortSignal): Promise<EncounterTemplateHealth>;
  saveProse(request: {
    cardId: string;
    value: string;
    clientRevision: number;
  }): Promise<{ data: ExplorationEditorServerData; clientRevision: number }>;
  saveAction(request: {
    cardId: string;
    slot: 0 | 1;
    action: ExplorationEditorAction;
    clientRevision: number;
  }): Promise<{ data: ExplorationEditorServerData; clientRevision: number }>;
  saveTemplate(request: {
    templateId: number;
    value: string;
    clientRevision: number;
  }): Promise<{ data: ExplorationEditorServerData; clientRevision: number }>;
}
