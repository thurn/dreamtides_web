import type { CardData } from "../types/cards";
import type { Dreamsign } from "../types/journey";

export type EncounterCandidateTextField = "prose" | "label";
export type EncounterEditableTextField = EncounterCandidateTextField | "template";
export type EncounterSelectionKind = "prose" | "actions";

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

export interface ExplorationCandidatesEditorLoadResult {
  groups: ExplorationCandidatesEditorGroup[];
  cards: CardData[];
  dreamsigns: Dreamsign[];
}

export interface EncounterRuntimeCardSelection {
  placeholder: string;
  predicate: string | null;
  cardId: string;
  cardName: string;
  source: "player_deck" | "catalog_fallback" | "offer_pool" | "starter_deck";
}

export interface ExplorationCandidatesEditorAction {
  template_id: number;
  template: string;
  rendered_template: string;
  rendered_template_parts: EncounterRenderedTemplatePart[];
  runtime_card_selections: EncounterRuntimeCardSelection[];
  variables: Record<string, unknown>;
  label: string;
  [key: string]: unknown;
}

export interface ExplorationCandidatesEditorCandidate {
  template_pair_id: string;
  prose: string;
  actions: [ExplorationCandidatesEditorAction, ExplorationCandidatesEditorAction];
  rank: number;
  selected?: Partial<Record<EncounterSelectionKind, true>>;
  [key: string]: unknown;
}

export interface ExplorationCandidatesEditorGroup {
  cardId: string;
  cardName: string;
  cardAbilityText: string;
  imageNumber: number;
  encounters: ExplorationCandidatesEditorCandidate[];
}

export type EncounterTemplateHealthStatus =
  | "hidden"
  | "warning"
  | "reintroduced"
  | "unused"
  | "available";

export type EncounterTemplateHealthReason = "production";

export interface EncounterTemplateHealthEntry {
  templateId: number;
  template: string;
  usageCount: number;
  status: EncounterTemplateHealthStatus;
  reasons: EncounterTemplateHealthReason[];
}

export interface EncounterTemplateHealth {
  productionEncounters: number;
  recordedTemplateUses: number;
  catalogTemplateCount: number;
  meanUsesPerTemplate: number;
  softWarningThreshold: number;
  omissionThreshold: number;
  guidance: string;
  templates: EncounterTemplateHealthEntry[];
}

export interface EncounterTextSaveRequest {
  cardId: string;
  templatePairId: string;
  field: EncounterCandidateTextField;
  actionTemplateId?: number;
  value: string;
  clientRevision: number;
}

export interface EncounterTemplateSaveRequest {
  templateId: number;
  value: string;
  clientRevision: number;
}

export interface EncounterSelectionSaveRequest {
  cardId: string;
  templatePairId: string;
  selectionKind: EncounterSelectionKind;
  clientRevision: number;
}

export interface EncounterVariableSaveRequest {
  cardId: string;
  templatePairId: string;
  actionTemplateId: number;
  variableName: string;
  value: number;
  clientRevision: number;
}

export interface ExplorationCandidatesEditorClient {
  load(signal?: AbortSignal): Promise<ExplorationCandidatesEditorLoadResult>;
  loadTemplateHealth(signal?: AbortSignal): Promise<EncounterTemplateHealth>;
  saveSelection(request: EncounterSelectionSaveRequest): Promise<{
    clientRevision: number;
    confirmation: {
      cardId: string;
      selectionKind: EncounterSelectionKind;
      selectedTemplatePairId: string;
      selectedRank: number;
    };
  }>;
  saveText(request: EncounterTextSaveRequest): Promise<{
    clientRevision: number;
    confirmation: Omit<EncounterTextSaveRequest, "clientRevision">;
  }>;
  saveVariable(request: EncounterVariableSaveRequest): Promise<{
    clientRevision: number;
    confirmation: Omit<EncounterVariableSaveRequest, "clientRevision">;
  }>;
  saveTemplate(request: EncounterTemplateSaveRequest): Promise<{
    clientRevision: number;
    confirmation: {
      templateId: number;
      template: string;
    };
    groups: ExplorationCandidatesEditorGroup[];
  }>;
}
