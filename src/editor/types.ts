import type { ArtCrop, CardData, CardType, Rarity } from "../types/cards";

export type EditableCardField =
  | "energy-cost"
  | "subtype"
  | "name"
  | "spark"
  | "rendered-text";

/** The three tide "kinds"; a tide's kind selects which card field holds it. */
export type TideKind = "large" | "medium" | "small";

/** Card field that holds tides of a given kind. */
export const TIDE_FIELD_BY_KIND: Record<TideKind, "large-tides" | "medium-tides" | "small-tides"> = {
  large: "large-tides",
  medium: "medium-tides",
  small: "small-tides",
};

/** Editor-record key holding the tides of a given kind. */
export const TIDE_RECORD_FIELD_BY_KIND: Record<
  TideKind,
  "largeTides" | "mediumTides" | "smallTides"
> = {
  large: "largeTides",
  medium: "mediumTides",
  small: "smallTides",
};

/**
 * Card fields the editor can save. Extends the inline-editable scalar fields
 * with `art`, which is edited through the dedicated art-edit modal rather than
 * the inline field flow, the `tags` list, and the three per-kind tide lists,
 * all saved through their respective chip controls.
 */
export type SavableCardField =
  | EditableCardField
  | "art"
  | "tags"
  | "large-tides"
  | "medium-tides"
  | "small-tides";

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
  /** Large-kind tides on this card. */
  largeTides: string[];
  /** Medium-kind tides on this card. */
  mediumTides: string[];
  /** Small-kind tides on this card. */
  smallTides: string[];
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

/** A registry tide: a tag plus the kind that selects which card field holds it. */
export interface EditorTide extends EditorTag {
  kind: TideKind;
}

/**
 * A draft registry entry as edited in the Manage tags/tides modal. `kind` is
 * present for the kinded tide facet and absent for tags.
 */
export interface ManageFacetEntry extends EditorTag {
  kind?: TideKind;
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
  | "spark"
  | "rulesTextLength"
  | "nameLength"
  | "tideCount";
export type EditorSortDirection = "asc" | "desc";
export type EditorCardSize = "small" | "medium" | "large";
/**
 * Which card fields the search box matches against. `name` (the default)
 * searches only card names; `all` additionally searches rules text; `mtg`
 * searches the source Magic: The Gathering name.
 */
export type EditorSearchScope = "name" | "all" | "mtg";

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
   * Tide names to filter by. Single-select: selecting a tide replaces any prior
   * selection, so this holds at most one name. Empty means no tide filtering.
   */
  tideFilters: string[];
  /**
   * When true the grid shows each card's tag chips with add/remove controls.
   * Inline field editing remains available regardless of this flag.
   */
  tagEditing: boolean;
  /**
   * When true the grid shows each card's tide chips with add/remove controls,
   * scoped to the {@link tideKind} kind: only that kind's chips appear and the
   * add control offers only tides of that kind.
   */
  tideEditing: boolean;
  /**
   * Which tide kind the tide-editing UI operates on. Selecting a kind from the
   * Tides dropdown turns tide editing on; turning it off leaves the last kind
   * in place so reopening returns to it.
   */
  tideKind: TideKind;
  /**
   * When true the grid enters art-edit mode: clicking a card opens the art crop
   * editor instead of editing inline fields.
   */
  artEditing: boolean;
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
  field: SavableCardField;
  value: unknown;
  clientRevision?: number;
}

/** Request to save a card's art crop through the art-edit modal. */
export interface SaveEditorCardArtRequest {
  id: string;
  art: ArtCrop;
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

export interface SaveEditorCardTidesRequest {
  id: string;
  kind: TideKind;
  tides: string[];
}

export interface SaveEditorTideRegistryRequest {
  tides: EditorTide[];
}

export interface SaveEditorTideRegistryResponse {
  tags: EditorTide[];
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
  loadEditorTides(signal?: AbortSignal): Promise<EditorTide[]>;
  saveEditorCardTides(
    request: SaveEditorCardTidesRequest,
  ): Promise<SaveEditorCardFieldResponse>;
  saveEditorCardArt(
    request: SaveEditorCardArtRequest,
  ): Promise<SaveEditorCardFieldResponse>;
  saveEditorTagRegistry(
    request: SaveEditorTagRegistryRequest,
  ): Promise<SaveEditorTagRegistryResponse>;
  saveEditorTideRegistry(
    request: SaveEditorTideRegistryRequest,
  ): Promise<SaveEditorTideRegistryResponse>;
}
