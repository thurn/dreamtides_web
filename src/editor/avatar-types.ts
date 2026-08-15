import type { Tides4Role } from "../draft/pool/tides4-io";
import type { Resonance } from "../types/resonance-data";
import type { AvatarId, TideId } from "../types/identifiers";
import type { SourceRevision } from "../types/source-revision";

/** The inline-editable text fields on an Avatar record. */
export type EditableAvatarField =
  "name" | "title" | "rendered-text" | "image-number" | "starting-essence";

export type AvatarSortField =
  "sourceOrder" | "name" | "startingEssence" | "rulesTextLength" | "facetCount";
export type AvatarSortDirection = "asc" | "desc";
export type AvatarSize = "small" | "medium" | "large";
export type AvatarSearchScope = "name" | "all";

/** A tide identity (without its decklist) the editor's tide picker renders. */
export interface EditorTideOption {
  id: TideId;
  displayName: string;
  resonance: Resonance;
  role: Tides4Role;
}

/** The set of tides an Avatar's draft pool is built from. */
export interface EditorTidePool {
  starter: TideId | null;
  facets: TideId[];
  neutral: TideId[];
}

export interface EditorAvatarRecord {
  id: AvatarId;
  name: string;
  title: string;
  imageNumber: string;
  "rendered-text": string;
  startingEssence: number;
  tidePool: EditorTidePool;
  sourceIndex: number;
  source: Record<string, unknown>;
}

export interface AvatarDisplayState {
  searchText: string;
  searchScope: AvatarSearchScope;
  type: "all";
  cost: "all";
  subtype: "";
  sort: AvatarSortField;
  dir: AvatarSortDirection;
  size: AvatarSize;
}

export interface LoadEditorAvatarsResponse {
  avatars: EditorAvatarRecord[];
  tides: EditorTideOption[];
  sourceRevision: SourceRevision;
}

export interface SaveEditorAvatarFieldRequest {
  id: AvatarId;
  field: EditableAvatarField;
  value: unknown;
  clientRevision?: number;
}

export interface SaveEditorAvatarTidePoolRequest {
  id: AvatarId;
  pool: EditorTidePool;
}

export interface SaveEditorAvatarFieldResponse {
  avatar: EditorAvatarRecord;
  sourceRevision: SourceRevision;
  clientRevision?: number;
}

export interface AvatarEditorApiClient {
  loadEditorAvatars(
    signal?: AbortSignal,
  ): Promise<LoadEditorAvatarsResponse>;
  saveEditorAvatarField(
    request: SaveEditorAvatarFieldRequest,
  ): Promise<SaveEditorAvatarFieldResponse>;
  saveEditorAvatarTidePool(
    request: SaveEditorAvatarTidePoolRequest,
  ): Promise<SaveEditorAvatarFieldResponse>;
}
