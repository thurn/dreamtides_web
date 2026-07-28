import type { SiteType } from "../types/journey";

/**
 * One dreamscape as the editor sees it. The kebab-case keys mirror the
 * `dreamscapes.toml` field names so they double as the editable-field
 * identifiers passed to the save-state machine and the PATCH endpoint. The
 * starter dreamscape has no resident guide or affiliation, so `guide-id` and
 * `affiliation-id` are `null` there.
 */
export interface EditorDreamscapeRecord {
  id: string;
  name: string;
  aesthetic: string;
  "signature-site": string;
  "guide-id": string | null;
  "affiliation-id": string | null;
  "site-icon": string;
  isStarter: boolean;
  fixedSites: string[];
  /** UUIDs of the DreamAvatars resident in this region (3-4 for non-starters). */
  dreamAvatarIds: string[];
  sourceIndex: number;
}

/** A Dream Guide pickable as a dreamscape's resident guide. */
export interface GuideOption {
  id: string;
  name: string;
  homeDreamscapeId: string | null;
  siteType: string | null;
}

/** An affiliation pickable as a dreamscape's thematic faction. */
export interface AffiliationOption {
  id: string;
  name: string;
}

/** A DreamAvatar assignable as a resident of a dreamscape. */
export interface DreamAvatarOption {
  id: string;
  name: string;
  title: string;
  imageNumber: string;
  /** The DreamAvatar's ability text, shown in the resident hover popover. */
  renderedText: string;
}

export interface LoadEditorDreamscapesResponse {
  dreamscapes: EditorDreamscapeRecord[];
  guides: GuideOption[];
  affiliations: AffiliationOption[];
  dreamAvatars: DreamAvatarOption[];
  siteTypes: SiteType[];
}

/** The catalog data the editor loads alongside the dreamscapes themselves. */
export interface DreamscapeCatalog {
  dreamscapes: EditorDreamscapeRecord[];
  guides: GuideOption[];
  affiliations: AffiliationOption[];
  dreamAvatars: DreamAvatarOption[];
  siteTypes: string[];
}

export type DreamAvatarAssignmentAction = "replace" | "add" | "remove";

export interface DreamAvatarAssignmentRequest {
  dreamscapeId: string;
  action: DreamAvatarAssignmentAction;
  /** The incoming DreamAvatar (for "replace" / "add"). */
  inId?: string;
  /** The resident being displaced (for "replace" / "remove"). */
  outId?: string;
}

export interface DreamAvatarAssignmentResponse {
  dreamscapes: EditorDreamscapeRecord[];
  changed: string[];
}

export type EditableDreamscapeField =
  | "name"
  | "aesthetic"
  | "signature-site"
  | "guide-id"
  | "affiliation-id"
  | "site-icon";

export interface SaveEditorDreamscapeFieldRequest {
  id: string;
  field: EditableDreamscapeField;
  value: string;
  clientRevision?: number;
}

export interface SaveEditorDreamscapeFieldResponse {
  dreamscape: EditorDreamscapeRecord;
  clientRevision?: number;
}

export interface DreamscapeEditorApiClient {
  loadEditorDreamscapes: (signal?: AbortSignal) => Promise<DreamscapeCatalog>;
  saveEditorDreamscapeField: (
    request: SaveEditorDreamscapeFieldRequest,
  ) => Promise<SaveEditorDreamscapeFieldResponse>;
  assignDreamscapeDreamAvatar: (
    request: DreamAvatarAssignmentRequest,
  ) => Promise<DreamAvatarAssignmentResponse>;
}

export type DreamscapeCardSize = "small" | "medium" | "large";

export interface DreamscapeDisplayState {
  searchText: string;
  size: DreamscapeCardSize;
}

export const DEFAULT_DREAMSCAPE_DISPLAY_STATE: DreamscapeDisplayState = {
  searchText: "",
  size: "medium",
};
