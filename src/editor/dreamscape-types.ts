import type { SiteType } from "../types/journey";
import type {
  AffiliationId,
  AvatarId,
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
  /** UUIDs of the Avatars resident in this region (3-4 for non-starters). */
  avatarIds: AvatarId[];
  sourceIndex: number;
}

/** A Dream Guide pickable as a dreamscape's resident guide. */
export interface GuideOption {
  id: GuideId;
  name: string;
  homeDreamscapeId: DreamscapeId | null;
  siteType: SiteType | null;
}

/** An affiliation pickable as a dreamscape's thematic faction. */
export interface AffiliationOption {
  id: AffiliationId;
  name: string;
}

/** A Avatar assignable as a resident of a dreamscape. */
export interface AvatarOption {
  id: AvatarId;
  name: string;
  title: string;
  imageNumber: string;
  /** The Avatar's ability text, shown in the resident hover popover. */
  renderedText: string;
}

export interface LoadEditorDreamscapesResponse {
  dreamscapes: EditorDreamscapeRecord[];
  guides: GuideOption[];
  affiliations: AffiliationOption[];
  avatars: AvatarOption[];
  siteTypes: SiteType[];
}

/** The catalog data the editor loads alongside the dreamscapes themselves. */
export interface DreamscapeCatalog {
  dreamscapes: EditorDreamscapeRecord[];
  guides: GuideOption[];
  affiliations: AffiliationOption[];
  avatars: AvatarOption[];
  siteTypes: SiteType[];
}

export type AvatarAssignmentAction = "replace" | "add" | "remove";

export interface AvatarAssignmentRequest {
  dreamscapeId: DreamscapeId;
  action: AvatarAssignmentAction;
  /** The incoming Avatar (for "replace" / "add"). */
  inId?: AvatarId;
  /** The resident being displaced (for "replace" / "remove"). */
  outId?: AvatarId;
}

export interface AvatarAssignmentResponse {
  dreamscapes: EditorDreamscapeRecord[];
  changed: DreamscapeId[];
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
  assignDreamscapeAvatar: (
    request: AvatarAssignmentRequest,
  ) => Promise<AvatarAssignmentResponse>;
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
