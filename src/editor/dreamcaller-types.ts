import type { Tides4Color, Tides4Role } from "../draft/pool/tides4-io";

/** The inline-editable text fields on a Dreamcaller record. */
export type EditableDreamcallerField =
  | "name"
  | "title"
  | "rendered-text"
  | "image-number"
  | "starting-essence";

export type DreamcallerSortField =
  | "sourceOrder"
  | "name"
  | "startingEssence"
  | "rulesTextLength"
  | "facetCount";
export type DreamcallerSortDirection = "asc" | "desc";
export type DreamcallerSize = "small" | "medium" | "large";
export type DreamcallerSearchScope = "name" | "all";

/** A tide identity (without its decklist) the editor's tide picker renders. */
export interface EditorTideOption {
  id: string;
  name: string;
  shortName: string;
  displayName: string;
  color: Tides4Color;
  role: Tides4Role;
}

/** The set of tides a Dreamcaller's draft pool is built from. */
export interface EditorTidePool {
  starter: string | null;
  facets: string[];
  neutral: string[];
}

export interface EditorDreamcallerRecord {
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

export interface DreamcallerDisplayState {
  searchText: string;
  searchScope: DreamcallerSearchScope;
  type: "all";
  cost: "all";
  subtype: "";
  sort: DreamcallerSortField;
  dir: DreamcallerSortDirection;
  size: DreamcallerSize;
}

export interface LoadEditorDreamcallersResponse {
  dreamcallers: EditorDreamcallerRecord[];
  tides: EditorTideOption[];
}

export interface SaveEditorDreamcallerFieldRequest {
  id: string;
  field: EditableDreamcallerField;
  value: unknown;
  clientRevision?: number;
}

export interface SaveEditorDreamcallerTidePoolRequest {
  id: string;
  pool: EditorTidePool;
}

export interface SaveEditorDreamcallerFieldResponse {
  dreamcaller: EditorDreamcallerRecord;
  clientRevision?: number;
}

export interface DreamcallerEditorApiClient {
  loadEditorDreamcallers(signal?: AbortSignal): Promise<LoadEditorDreamcallersResponse>;
  saveEditorDreamcallerField(
    request: SaveEditorDreamcallerFieldRequest,
  ): Promise<SaveEditorDreamcallerFieldResponse>;
  saveEditorDreamcallerTidePool(
    request: SaveEditorDreamcallerTidePoolRequest,
  ): Promise<SaveEditorDreamcallerFieldResponse>;
}
