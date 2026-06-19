import type { DreamwellCardViewData } from "../components/DreamwellCardView";
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
 * `image-number` and the `art` crop, both set through the art-edit modal.
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
 * A Dreamwell record as the editor sees it. Keeps the TOML-facing kebab-case
 * keys (`rendered-text`, `energy-added`, `image-number`) so the save payloads
 * map straight onto the source fields.
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
   * When on, clicking a card opens the art-edit modal (mirrors the figment
   * editor's art-edit mode) instead of starting an inline text edit.
   */
  artEditing: boolean;
  sort: DreamwellSortField;
  dir: DreamwellSortDirection;
  size: DreamwellSize;
}

export interface LoadEditorDreamwellResponse {
  dreamwell: EditorDreamwellRecord[];
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
 * Build the {@link DreamwellCardViewData} the in-game Dreamwell card frame
 * renders for an editor record, so the editor preview is pixel-identical to the
 * battle card.
 */
export function dreamwellPreviewCard(
  record: EditorDreamwellRecord,
): DreamwellCardViewData {
  return {
    id: record.id,
    name: record.name,
    renderedText: record["rendered-text"],
    energyAdded: record["energy-added"],
    imageNumber: record["image-number"],
    art: record.art,
  };
}
