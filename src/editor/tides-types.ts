import type {
  Tides4DeckJson,
  Tides4DreamAvatarPool,
} from "../draft/pool/tides4-io";
import type {
  DreamAvatarId,
  IdentityRecord,
  TideId,
} from "../types/identifiers";
import type { SourceRevision } from "../types/source-revision";

export type TidesCatalogFile = "tides";

/** The annotation fields the tides editor can change on a tide. */
export type EditableTideField =
  | "displayName"
  | "displayDescription"
  | "resonance";

/**
 * The full committed tides artifact as returned by the tides editor API
 * (`GET /api/editor/tides`). Carries the editable tide list and the per
 * DreamAvatar pools, plus which `file` (e.g. `tides4`) it was read from.
 */
export interface TidesArtifact {
  file: TidesCatalogFile;
  sourceRevision: SourceRevision;
  version: number;
  tides: Tides4DeckJson[];
  tidePoolByDreamAvatar: IdentityRecord<
    DreamAvatarId,
    Tides4DreamAvatarPool
  >;
}

/** A request to change one tide's annotation field. */
export interface SaveTideFieldRequest {
  file: TidesCatalogFile;
  id: TideId;
  field: EditableTideField;
  value: string;
  expectedSourceRevision: SourceRevision;
}

/** The server's confirmation after a successful annotation save. */
export interface SaveTideFieldResponse {
  file: TidesCatalogFile;
  tide: Tides4DeckJson;
  sourceRevision: SourceRevision;
}

/**
 * A DreamAvatar as served by `/dream-avatars-v2-data.json` — the identity behind a
 * signature tide. Used to render the DreamAvatar portrait and ability text.
 */
export interface EditorDreamAvatar {
  id: DreamAvatarId;
  name: string;
  title: string;
  imageNumber: string;
  renderedText: string;
  startingEssence: number;
}

/** Pluggable client surface, so the app and its tests share one shape. */
export interface TidesEditorApiClient {
  loadTidesArtifact: (
    file: TidesCatalogFile,
    signal?: AbortSignal,
  ) => Promise<TidesArtifact>;
  saveTideField: (request: SaveTideFieldRequest) => Promise<SaveTideFieldResponse>;
}
