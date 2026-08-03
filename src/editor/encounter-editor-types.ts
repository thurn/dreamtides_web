export type EncounterTextField = "prose" | "label" | "effect_text" | "resolution";

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
  selected?: true;
  [key: string]: unknown;
}

export interface EncounterEditorGroup {
  cardId: string;
  cardName: string;
  imageNumber: number;
  encounters: EncounterEditorCandidate[];
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
  clientRevision: number;
}

export interface EncounterEditorClient {
  load(signal?: AbortSignal): Promise<EncounterEditorGroup[]>;
  saveSelection(request: EncounterSelectionSaveRequest): Promise<{
    clientRevision: number;
    confirmation: {
      cardId: string;
      selectedTemplatePairId: string;
      selectedRank: number;
    };
  }>;
  saveText(request: EncounterTextSaveRequest): Promise<{
    clientRevision: number;
    confirmation: Omit<EncounterTextSaveRequest, "clientRevision">;
  }>;
}
