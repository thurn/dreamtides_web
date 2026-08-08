import type { DreamwellEditorPreviewData } from "./DreamwellEditorPreview";
import type { ArtCrop } from "../types/cards";

/**
 * Dreamwell fields edited inline by double-clicking the card (the name heading,
 * the rules box, the energy orb) or the tier caption beneath it.
 */
export type EditableDreamwellField =
  | "name"
  | "rendered-text"
  | "energy-added"
  | "order";

/**
 * All Dreamwell fields the editor can save: the inline-editable fields plus
 * `image-number` and the `art` crop, both set through the focused editor.
 */
export type SavableDreamwellField =
  | EditableDreamwellField
  | "image-number"
  | "art";

export type DreamwellSortField =
  | "sourceOrder"
  | "name"
  | "energyAdded"
  | "order";
export type DreamwellSortDirection = "asc" | "desc";
export type DreamwellSize = "small" | "medium" | "large";

/**
 * The highest deck `order` slot a Dreamwell card may occupy. Mirrors
 * `MAX_DREAMWELL_ORDER` in `scripts/dreamwell-editor-data.mjs`; the order
 * selector offers slots 0-4.
 */
export const MAX_DREAMWELL_ORDER = 4;

/**
 * A Dreamwell record as the editor sees it. Keeps the generated compatibility
 * keys (`rendered-text`, `energy-added`, `image-number`) used by the UI; the
 * typed editor adapter maps them to canonical RON fields.
 */
export interface EditorDreamwellRecord {
  id: string;
  name: string;
  "rendered-text": string;
  "energy-added": number;
  order: number;
  "image-number": number;
  /** Curated pan/zoom crop framing the card art; absent until the card is framed. */
  art?: ArtCrop;
  "card-number": number;
  sourceIndex: number;
  source: Record<string, unknown>;
}

export interface DreamwellDisplayState {
  searchText: string;
  /**
   * When on, clicking a card opens its focused editor (mirrors the figment
   * editor's edit mode) instead of starting an inline text edit.
   */
  artEditing: boolean;
  sort: DreamwellSortField;
  dir: DreamwellSortDirection;
  size: DreamwellSize;
}

export interface LoadEditorDreamwellResponse {
  dreamwell: EditorDreamwellRecord[];
  sourceRevision: string;
}

export interface SaveEditorDreamwellFieldRequest {
  id: string;
  field: SavableDreamwellField;
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

export interface SaveEditorDreamwellFieldResponse {
  dreamwell: EditorDreamwellRecord;
  sourceRevision: string;
  clientRevision?: number;
  timing: EditorSaveTiming;
}

export interface DreamwellEditorApiClient {
  loadEditorDreamwell(signal?: AbortSignal): Promise<EditorDreamwellRecord[]>;
  saveEditorDreamwellField(
    request: SaveEditorDreamwellFieldRequest,
  ): Promise<SaveEditorDreamwellFieldResponse>;
}

/**
 * Build the data the editor-owned Dreamwell preview renders for an editor
 * record. The preview retains inline mutation affordances that belong solely to
 * the editor surface.
 */
export function dreamwellPreviewCard(
  record: EditorDreamwellRecord,
): DreamwellEditorPreviewData {
  return {
    id: record.id,
    name: record.name,
    renderedText: record["rendered-text"],
    energyAdded: record["energy-added"],
    imageNumber: record["image-number"],
    art: record.art,
  };
}
