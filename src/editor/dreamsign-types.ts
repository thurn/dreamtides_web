import type { EditorTag } from "./types";
import type { DreamsignId } from "../types/identifiers";
import type { SourceRevision } from "../types/source-revision";

export type EditableDreamsignField = "name" | "rendered-text";
export type SavableDreamsignField = EditableDreamsignField | "tags";
export type DreamsignSortField =
  "sourceOrder" | "name" | "rulesTextLength" | "nameLength" | "tagCount";
export type DreamsignSortDirection = "asc" | "desc";
export type DreamsignSize = "small" | "medium" | "large";
export type DreamsignSearchScope = "name" | "all";

export interface EditorDreamsignRecord {
  id: DreamsignId;
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
  sourceRevision: SourceRevision;
}

export interface SaveEditorDreamsignFieldRequest {
  id: DreamsignId;
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
  sourceRevision: SourceRevision;
  clientRevision?: number;
  timing: EditorSaveTiming;
}

export interface LoadEditorDreamsignTagsResponse {
  tags: EditorTag[];
  sourceRevision: SourceRevision;
}

export interface SaveEditorDreamsignTagsRequest {
  id: DreamsignId;
  tags: string[];
}

export interface SaveEditorDreamsignTagRegistryRequest {
  tags: EditorTag[];
}

export interface SaveEditorDreamsignTagRegistryResponse {
  tags: EditorTag[];
  dreamsigns: EditorDreamsignRecord[];
  sourceRevision: SourceRevision;
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
