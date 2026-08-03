export type EncounterTextField = "prose" | "label" | "effect_text" | "resolution";
export type EncounterSelectionKind = "prose" | "actions";

export interface EncounterEditorAction {
  template_id: number;
  label: string;
  effect_text: string;
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
  field: EncounterTextField;
  actionTemplateId?: number;
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
  load(signal?: AbortSignal): Promise<EncounterEditorGroup[]>;
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
}
