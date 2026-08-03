import type { CardData } from "../types/cards";
import type { Dreamsign } from "../types/journey";

export type EncounterCandidateTextField = "prose" | "label" | "resolution";
export type EncounterEditableTextField = EncounterCandidateTextField | "template";
export type EncounterSelectionKind = "prose" | "actions";

export type EncounterRenderedTemplatePart =
  | { kind: "text"; text: string }
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

export interface EncounterEditorLoadResult {
  groups: EncounterEditorGroup[];
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

export interface EncounterEditorAction {
  template_id: number;
  template: string;
  rendered_template: string;
  rendered_template_parts: EncounterRenderedTemplatePart[];
  runtime_card_selections: EncounterRuntimeCardSelection[];
  variables: Record<string, unknown>;
  label: string;
  resolution: string;
  [key: string]: unknown;
}

export interface EncounterEditorCandidate {
  template_pair_id: string;
  prose: string;
  actions: [EncounterEditorAction, EncounterEditorAction];
  rank: number;
  selected?: Partial<Record<EncounterSelectionKind, true>>;
  [key: string]: unknown;
}

export interface EncounterEditorGroup {
  cardId: string;
  cardName: string;
  cardAbilityText: string;
  imageNumber: number;
  encounters: EncounterEditorCandidate[];
}

export type EncounterTemplateHealthStatus =
  | "hidden"
  | "warning"
  | "reintroduced"
  | "unused"
  | "available";

export type EncounterTemplateHealthReason = "rank_1" | "overall";

export interface EncounterTemplateHealthEntry {
  templateId: number;
  template: string;
  usageCount: number;
  rankOneUsageCount: number;
  status: EncounterTemplateHealthStatus;
  reasons: EncounterTemplateHealthReason[];
}

export interface EncounterTemplateHealth {
  completedCards: number;
  recordedTemplateUses: number;
  catalogTemplateCount: number;
  meanUsesPerTemplate: number;
  softWarningThreshold: number;
  omissionThreshold: number;
  recordedRankOneTemplateUses: number;
  meanRankOneUsesPerTemplate: number;
  rankOneSoftWarningThreshold: number;
  rankOneOmissionThreshold: number;
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

export interface EncounterEditorClient {
  load(signal?: AbortSignal): Promise<EncounterEditorLoadResult>;
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
  saveTemplate(request: EncounterTemplateSaveRequest): Promise<{
    clientRevision: number;
    confirmation: {
      templateId: number;
      template: string;
    };
    groups: EncounterEditorGroup[];
  }>;
}
