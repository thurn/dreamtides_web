import type { CardData, CardType, Rarity } from "../types/cards";

export type EditableCardField =
  | "energy-cost"
  | "subtype"
  | "name"
  | "spark"
  | "rendered-text";

export type EditorFieldValue = string | number;

export interface EditorCardRecord {
  id: string;
  cardNumber: number;
  cardType: CardType;
  rarity?: Rarity;
  "energy-cost": EditorFieldValue;
  subtype: string;
  name: string;
  spark: EditorFieldValue;
  "rendered-text": string;
  tags: string[];
  /**
   * The Magic: The Gathering card this card is derived from. Surfaced as a
   * hover tooltip in the editor for reference; it is not an editable field and
   * is not carried into the quest prototype's card data.
   */
  mtgName: string;
  source: Record<string, unknown>;
  preview: CardData;
}

/** A registry tag: a tag name paired with the color used to render its chip. */
export interface EditorTag {
  name: string;
  color: string;
}

export type EditorTypeFilter = "all" | "character" | "event";
export type EditorCostFilter =
  | "all"
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5plus"
  | "x";
export type EditorSortField =
  | "cardNumber"
  | "name"
  | "cost"
  | "type"
  | "subtype"
  | "spark";
export type EditorSortDirection = "asc" | "desc";
export type EditorCardSize = "small" | "medium" | "large";
/**
 * Which card fields the search box matches against. `name` (the default)
 * searches only card names; `all` additionally searches rules text.
 */
export type EditorSearchScope = "name" | "all";

export interface EditorDisplayState {
  searchText: string;
  searchScope: EditorSearchScope;
  type: EditorTypeFilter;
  cost: EditorCostFilter;
  subtype: string;
  /**
   * Tag names a card must all carry to remain visible (AND semantics). Empty
   * means no tag filtering.
   */
  tagFilters: string[];
  /**
   * When true the grid shows each card's tag chips with add/remove controls.
   * Inline field editing remains available regardless of this flag.
   */
  tagEditing: boolean;
  sort: EditorSortField;
  dir: EditorSortDirection;
  size: EditorCardSize;
}

export type EditorFieldSaveStatus = "idle" | "saving" | "saved" | "error";

export interface EditorFieldSaveState {
  status: EditorFieldSaveStatus;
  clientRevision: number;
  message: string | null;
}

export type EditorSaveState = Record<string, EditorFieldSaveState>;

export interface LoadEditorCardsResponse {
  cards: EditorCardRecord[];
}

export interface SaveEditorCardFieldRequest {
  id: string;
  field: EditableCardField;
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

export interface SaveEditorCardFieldResponse {
  card: EditorCardRecord;
  clientRevision?: number;
  timing: EditorSaveTiming;
}

export interface EditorApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export interface LoadEditorTagsResponse {
  tags: EditorTag[];
}

export interface SaveEditorCardTagsRequest {
  id: string;
  tags: string[];
}

export interface SaveEditorTagRegistryRequest {
  tags: EditorTag[];
}

export interface SaveEditorTagRegistryResponse {
  tags: EditorTag[];
  cards: EditorCardRecord[];
}

export interface EditorApiClient {
  loadEditorCards(signal?: AbortSignal): Promise<EditorCardRecord[]>;
  saveEditorCardField(
    request: SaveEditorCardFieldRequest,
  ): Promise<SaveEditorCardFieldResponse>;
  loadEditorTags(signal?: AbortSignal): Promise<EditorTag[]>;
  saveEditorCardTags(
    request: SaveEditorCardTagsRequest,
  ): Promise<SaveEditorCardFieldResponse>;
  saveEditorTagRegistry(
    request: SaveEditorTagRegistryRequest,
  ): Promise<SaveEditorTagRegistryResponse>;
}
