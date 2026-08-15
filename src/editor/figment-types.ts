import {
  parseCardId,
  type CardName,
  type CardId,
  type CardSubtype,
} from "../types/card-identity";
import type { ArtCrop, CardData } from "../types/cards";
import { figmentCardDisplayName } from "../data/figment-card-display";
import { semanticEntityId } from "../types/semantic-identity";
import type { SourceRevision } from "../types/source-revision";

/** Figment fields edited inline through the card frame. */
export type EditableFigmentField =
  "name" | "subtype" | "spark" | "rendered-text";

/**
 * All figment fields the editor can save. Extends the inline-editable fields
 * with `image-number` and the `art` crop, both edited through the art-edit
 * modal.
 */
export type SavableFigmentField = EditableFigmentField | "image-number" | "art";

export type FigmentSortField = "sourceOrder" | "name" | "subtype" | "spark";
export type FigmentSortDirection = "asc" | "desc";
export type FigmentSize = "small" | "medium" | "large";

export interface EditorFigmentRecord {
  id: CardId;
  name: CardName;
  subtype: CardSubtype;
  spark: number;
  /** Implicit combat keyword carried by the type; not edited in the UI. */
  keyword: string;
  "rendered-text": string;
  "image-number": number;
  art: ArtCrop | null;
  sourceIndex: number;
  source: Record<string, unknown>;
}

export interface FigmentDisplayState {
  searchText: string;
  artEditing: boolean;
  sort: FigmentSortField;
  dir: FigmentSortDirection;
  size: FigmentSize;
}

export interface LoadEditorFigmentsResponse {
  figments: EditorFigmentRecord[];
  sourceRevision: SourceRevision;
}

export interface SaveEditorFigmentFieldRequest {
  id: CardId;
  field: SavableFigmentField;
  value: unknown;
  clientRevision?: number;
}

/** Request to save a figment's art crop through the focused editor. */
export interface SaveEditorFigmentArtRequest {
  id: CardId;
  art: ArtCrop;
}

/** Request to point a figment at a different art image. */
export interface SaveEditorFigmentImageNumberRequest {
  id: CardId;
  imageNumber: number;
}

export interface EditorSaveTiming {
  readMs: number;
  patchMs: number;
  refreshMs: number;
  confirmMs: number;
  totalMs: number;
}

export interface SaveEditorFigmentFieldResponse {
  figment: EditorFigmentRecord;
  sourceRevision: SourceRevision;
  clientRevision?: number;
  timing: EditorSaveTiming;
}

export interface FigmentEditorApiClient {
  loadEditorFigments(signal?: AbortSignal): Promise<EditorFigmentRecord[]>;
  saveEditorFigmentField(
    request: SaveEditorFigmentFieldRequest,
  ): Promise<SaveEditorFigmentFieldResponse>;
  saveEditorFigmentArt(
    request: SaveEditorFigmentArtRequest,
  ): Promise<SaveEditorFigmentFieldResponse>;
  saveEditorFigmentImageNumber(
    request: SaveEditorFigmentImageNumberRequest,
  ): Promise<SaveEditorFigmentFieldResponse>;
}

/**
 * Build the `CardData` the character card frame renders for a figment. Figments
 * are 0-cost characters with no energy orb (the figment frame drops it); art is
 * keyed by image number with the saved crop.
 */
export function figmentPreviewCard(record: EditorFigmentRecord): CardData {
  return {
    name: figmentCardDisplayName(record.name, record.subtype),
    id: parseCardId(semanticEntityId("figment", record.id)),
    cardNumber: record.sourceIndex,
    cardType: "Character",
    subtype: record.subtype,
    isStarter: false,
    energyCost: 0,
    spark: record.spark,
    isFast: false,
    renderedText: record["rendered-text"],
    imageNumber: record["image-number"],
    artOwned: record["image-number"] > 0,
    ...(record.art !== null ? { art: record.art } : {}),
  };
}
