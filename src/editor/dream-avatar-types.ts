import type { Tides4Color, Tides4Role } from "../draft/pool/tides4-io";

/** The inline-editable text fields on a DreamAvatar record. */
export type EditableDreamAvatarField =
  | "name"
  | "title"
  | "rendered-text"
  | "image-number"
  | "starting-essence";

export type DreamAvatarSortField =
  | "sourceOrder"
  | "name"
  | "startingEssence"
  | "rulesTextLength"
  | "facetCount";
export type DreamAvatarSortDirection = "asc" | "desc";
export type DreamAvatarSize = "small" | "medium" | "large";
export type DreamAvatarSearchScope = "name" | "all";

/** A tide identity (without its decklist) the editor's tide picker renders. */
export interface EditorTideOption {
  id: string;
  name: string;
  shortName: string;
  displayName: string;
  color: Tides4Color;
  role: Tides4Role;
}

/** The set of tides a DreamAvatar's draft pool is built from. */
export interface EditorTidePool {
  starter: string | null;
  facets: string[];
  neutral: string[];
}

export interface EditorDreamAvatarRecord {
  id: string;
  name: string;
  title: string;
  imageNumber: string;
  "rendered-text": string;
  startingEssence: number;
  tidePool: EditorTidePool;
  sourceIndex: number;
  source: Record<string, unknown>;
}

export interface DreamAvatarDisplayState {
  searchText: string;
  searchScope: DreamAvatarSearchScope;
  type: "all";
  cost: "all";
  subtype: "";
  sort: DreamAvatarSortField;
  dir: DreamAvatarSortDirection;
  size: DreamAvatarSize;
}

export interface LoadEditorDreamAvatarsResponse {
  dreamAvatars: EditorDreamAvatarRecord[];
  tides: EditorTideOption[];
}

export interface SaveEditorDreamAvatarFieldRequest {
  id: string;
  field: EditableDreamAvatarField;
  value: unknown;
  clientRevision?: number;
}

export interface SaveEditorDreamAvatarTidePoolRequest {
  id: string;
  pool: EditorTidePool;
}

export interface SaveEditorDreamAvatarFieldResponse {
  dreamAvatar: EditorDreamAvatarRecord;
  clientRevision?: number;
}

export interface DreamAvatarEditorApiClient {
  loadEditorDreamAvatars(signal?: AbortSignal): Promise<LoadEditorDreamAvatarsResponse>;
  saveEditorDreamAvatarField(
    request: SaveEditorDreamAvatarFieldRequest,
  ): Promise<SaveEditorDreamAvatarFieldResponse>;
  saveEditorDreamAvatarTidePool(
    request: SaveEditorDreamAvatarTidePoolRequest,
  ): Promise<SaveEditorDreamAvatarFieldResponse>;
}
