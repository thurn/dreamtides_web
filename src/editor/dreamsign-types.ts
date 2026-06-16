import type { EditorTag } from "./types";

export type EditableDreamsignField = "name" | "rendered-text";
export type SavableDreamsignField = EditableDreamsignField | "tags";
export type DreamsignSortField =
  | "sourceOrder"
  | "name"
  | "rulesTextLength"
  | "nameLength"
  | "tagCount"
  // TEMPORARY: clusters near-duplicate effects together for de-dup review.
  | "similarityGroup";
export type DreamsignSortDirection = "asc" | "desc";
export type DreamsignSize = "small" | "medium" | "large";
export type DreamsignSearchScope = "name" | "all";

export interface EditorDreamsignRecord {
  id: string;
  name: string;
  imageName: string;
  imageAlt: string;
  "rendered-text": string;
  tags: string[];
  sourceIndex: number;
  source: Record<string, unknown>;
}

export interface DreamsignDisplayState {
  searchText: string;
  searchScope: DreamsignSearchScope;
  type: "all";
  cost: "all";
  subtype: "";
  tagFilters: string[];
  excludedTagFilters: string[];
  tagEditing: boolean;
  checkboxTag: string;
  sort: DreamsignSortField;
  dir: DreamsignSortDirection;
  size: DreamsignSize;
}

export interface LoadEditorDreamsignsResponse {
  dreamsigns: EditorDreamsignRecord[];
}

export interface SaveEditorDreamsignFieldRequest {
  id: string;
  field: SavableDreamsignField;
  value: unknown;
  clientRevision?: number;
}

export interface EditorSaveTiming {
  readMs: number;
  patchMs: number;
  refreshMs: number;
  confirmMs: number;
  totalMs: number;
}

export interface SaveEditorDreamsignFieldResponse {
  dreamsign: EditorDreamsignRecord;
  clientRevision?: number;
  timing: EditorSaveTiming;
}

export interface LoadEditorDreamsignTagsResponse {
  tags: EditorTag[];
}

export interface SaveEditorDreamsignTagsRequest {
  id: string;
  tags: string[];
}

export interface SaveEditorDreamsignTagRegistryRequest {
  tags: EditorTag[];
}

export interface SaveEditorDreamsignTagRegistryResponse {
  tags: EditorTag[];
  dreamsigns: EditorDreamsignRecord[];
}

export interface DreamsignEditorApiClient {
  loadEditorDreamsigns(signal?: AbortSignal): Promise<EditorDreamsignRecord[]>;
  saveEditorDreamsignField(
    request: SaveEditorDreamsignFieldRequest,
  ): Promise<SaveEditorDreamsignFieldResponse>;
  loadEditorDreamsignTags(signal?: AbortSignal): Promise<EditorTag[]>;
  saveEditorDreamsignTags(
    request: SaveEditorDreamsignTagsRequest,
  ): Promise<SaveEditorDreamsignFieldResponse>;
  saveEditorDreamsignTagRegistry(
    request: SaveEditorDreamsignTagRegistryRequest,
  ): Promise<SaveEditorDreamsignTagRegistryResponse>;
}
