import type {
  Tides4DeckJson,
  Tides4DreamAvatarPool,
} from "../draft/pool/tides4-io";

/** The annotation fields the tides editor can change on a tide. */
export type EditableTideField = "displayName" | "displayDescription" | "color";

/**
 * The full committed tides artifact as returned by the tides editor API
 * (`GET /api/editor/tides`). Carries the editable tide list and the per
 * DreamAvatar pools, plus which `file` (e.g. `tides4`) it was read from.
 */
export interface TidesArtifact {
  file: string;
  sourceRevision: string;
  version: number;
  tides: Tides4DeckJson[];
  tidePoolByDreamAvatar: Record<string, Tides4DreamAvatarPool>;
}

/** A request to change one tide's annotation field. */
export interface SaveTideFieldRequest {
  file: string;
  id: string;
  field: EditableTideField;
  value: string;
  expectedSourceRevision: string;
}

/** The server's confirmation after a successful annotation save. */
export interface SaveTideFieldResponse {
  file: string;
  tide: Tides4DeckJson;
  sourceRevision: string;
}

/**
 * A DreamAvatar as served by `/dream-avatars-v2-data.json` — the identity behind a
 * signature tide. Used to render the DreamAvatar portrait and ability text.
 */
export interface EditorDreamAvatar {
  id: string;
  name: string;
  title: string;
  imageNumber: string;
  renderedText: string;
  startingEssence: number;
}

/** Pluggable client surface, so the app and its tests share one shape. */
export interface TidesEditorApiClient {
  loadTidesArtifact: (
    file: string,
    signal?: AbortSignal,
  ) => Promise<TidesArtifact>;
  saveTideField: (request: SaveTideFieldRequest) => Promise<SaveTideFieldResponse>;
}
