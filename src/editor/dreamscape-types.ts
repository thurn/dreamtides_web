import type { SiteType } from "../types/journey";
import type {
  AffiliationId,
  DreamAvatarId,
  DreamscapeId,
  GuideId,
} from "../types/identifiers";

/**
 * One dreamscape as the editor sees it. The kebab-case keys mirror the
 * generated Dreamscape compatibility fields so they double as the editable
 * operation identifiers passed to the save-state machine and PATCH endpoint. The
 * starter dreamscape has no resident guide or affiliation, so `guide-id` and
 * `affiliation-id` are `null` there.
 */
export interface EditorDreamscapeRecord {
  id: DreamscapeId;
  name: string;
  "signature-site": string;
  "guide-id": GuideId | null;
  "affiliation-id": AffiliationId | null;
  isStarter: boolean;
  fixedSites: string[];
  /** UUIDs of the DreamAvatars resident in this region (3-4 for non-starters). */
  dreamAvatarIds: DreamAvatarId[];
  sourceIndex: number;
}

/** A Dream Guide pickable as a dreamscape's resident guide. */
export interface GuideOption {
  id: GuideId;
  name: string;
  homeDreamscapeId: DreamscapeId | null;
  siteType: string | null;
}

/** An affiliation pickable as a dreamscape's thematic faction. */
export interface AffiliationOption {
  id: AffiliationId;
  name: string;
}

/** A DreamAvatar assignable as a resident of a dreamscape. */
export interface DreamAvatarOption {
  id: DreamAvatarId;
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
  dreamscapeId: DreamscapeId;
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
  "name" | "signature-site" | "guide-id" | "affiliation-id";

export interface SaveEditorDreamscapeFieldRequest {
  id: DreamscapeId;
  field: EditableDreamscapeField;
  value: string;
  clientRevision?: number;
}

export interface SaveEditorDreamscapeFieldResponse {
  dreamscape: EditorDreamscapeRecord;
  /** Full recomputed assignments, returned because guide/site swaps affect two regions. */
  dreamscapes?: EditorDreamscapeRecord[];
  guides?: GuideOption[];
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
