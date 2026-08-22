import type { ArtCrop, CardData, CardType, Rarity } from "../types/cards";
import type {
  CardId,
  CardSubtype,
} from "../types/card-identity";
import type { SourceRevision } from "../types/source-revision";

export type EditableCardField =
  | "energy-cost"
  | "card-type"
  | "subtype"
  | "name"
  | "spark"
  | "rendered-text"
  | "amplified-text";

/** The card types a card may be retyped between in the focused editor. */
export const CARD_TYPE_OPTIONS: readonly CardType[] = ["Character", "Event"];

/**
 * Card fields the editor can save. Extends the inline-editable scalar fields
 * with `art` and `image-number`, both edited through the dedicated art-edit
 * modal rather than the inline field flow, and the facet lists `tags` and
 * `tides`, saved through their respective chip controls.
 */
export type SavableCardField =
  EditableCardField | "art" | "image-number" | "tags" | "tides";

export type EditorFieldValue = string | number;

export interface EditorCardRecord {
  id: CardId;
  cardNumber: number;
  cardType: CardType;
  rarity?: Rarity;
  "energy-cost": EditorFieldValue;
  subtype: CardSubtype;
  name: string;
  spark: EditorFieldValue;
  "rendered-text": string;
  "amplified-text": string;
  tags: string[];
  tides: string[];
  /**
   * The Magic: The Gathering card this card is derived from. Surfaced as a
   * reference hover tooltip in the editor; it is not an editable field. The
   * setup-assets transform also carries it onto the runtime `CardData.mtgName`,
   * where card-browsing surfaces such as the Pool Viewer show the same tooltip.
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
  "all" | "0" | "1" | "2" | "3" | "4" | "5plus" | "x";
export type EditorSortField =
  | "cardNumber"
  | "name"
  | "cost"
  | "type"
  | "subtype"
  | "spark"
  | "rulesTextLength"
  | "rulesTextFontSize"
  | "nameLength"
  | "nameSubstring"
  | "tideCount";
export type EditorSortDirection = "asc" | "desc";
export type EditorCardSize = "small" | "medium" | "large";
/**
 * Which card fields the search box matches against. `name` (the default)
 * searches only card names; `all` additionally searches rules text; `mtg`
 * searches the source Magic: The Gathering name; and `imageNumber` searches
 * the card-art image number.
 */
export type EditorSearchScope = "name" | "all" | "mtg" | "imageNumber";

export interface EditorDisplayState {
  searchText: string;
  searchScope: EditorSearchScope;
  type: EditorTypeFilter;
  cost: EditorCostFilter;
  subtype: CardSubtype;
  /**
   * Tag names a card must all carry to remain visible (AND semantics). Empty
   * means no tag filtering.
   */
  tagFilters: string[];
  /**
   * Tag names a card must NOT carry to remain visible: a card is hidden if it
   * has any of these tags. Lets you filter to cards missing a tag. A tag is
   * either an include filter or an exclude filter, never both. Empty means no
   * exclude filtering.
   */
  excludedTagFilters: string[];
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
   * mirroring tag mode.
   */
  tideEditing: boolean;
  /**
   * When true the grid enters edit mode: clicking a card opens its focused
   * editor instead of editing inline fields.
   */
  artEditing: boolean;
  /**
   * Tag name for checkbox tagging mode. When non-empty the grid renders a big
   * checkbox on each card that toggles this one tag, hiding all other tag and
   * tide chips. Empty means checkbox tagging is off. This mode coexists with
   * edit mode, so a card can be edited and checkbox-tagged at once.
   */
  checkboxTag: string;
  /**
   * When true, each card shows a button that copies its canonical art image
   * number to the clipboard.
   */
  showImageNumberCopy: boolean;
  /**
   * When true, each card shows a small overlay badge with the rules-text font
   * size (in px) the auto-shrink fitter computed to fit the rules box. A
   * diagnostic aid for spotting cards whose text was shrunk the most.
   */
  showFontSize: boolean;
  /**
   * When true, hovering a card with recognized glossary terms reveals their
   * explanatory Info Cards.
   */
  showGlossaryInfoOnHover: boolean;
  /** Render amplified rules text in each card preview instead of base rules text. */
  showAmplifiedText: boolean;
  /** Keep only cards whose canonical source defines non-blank amplified text. */
  amplifiedOnly: boolean;
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
  sourceRevision?: SourceRevision;
}

export interface SaveEditorCardFieldRequest {
  id: CardId;
  field: SavableCardField;
  value: unknown;
  clientRevision?: number;
}

/** Request to save a card's art crop through the focused editor. */
export interface SaveEditorCardArtRequest {
  id: CardId;
  art: ArtCrop;
}

/**
 * Request to point a card at a different art image through the focused editor.
 * The number is resolved to `/cards/<imageNumber>.webp` at render time.
 */
export interface SaveEditorCardImageNumberRequest {
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

export interface SaveEditorCardFieldResponse {
  card: EditorCardRecord;
  clientRevision?: number;
  sourceRevision?: SourceRevision;
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
  sourceRevision?: SourceRevision;
}

export interface SaveEditorCardTagsRequest {
  id: CardId;
  tags: string[];
}

export interface SaveEditorTagRegistryRequest {
  tags: EditorTag[];
  sourceRevision?: SourceRevision;
}

export interface SaveEditorTagRegistryResponse {
  tags: EditorTag[];
  cards: EditorCardRecord[];
  sourceRevision?: SourceRevision;
}

export interface SaveEditorCardTidesRequest {
  id: CardId;
  tides: string[];
}

export interface SaveEditorTideRegistryRequest {
  tides: EditorTag[];
  sourceRevision?: SourceRevision;
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
  loadEditorTides(signal?: AbortSignal): Promise<EditorTag[]>;
  saveEditorCardTides(
    request: SaveEditorCardTidesRequest,
  ): Promise<SaveEditorCardFieldResponse>;
  saveEditorCardArt(
    request: SaveEditorCardArtRequest,
  ): Promise<SaveEditorCardFieldResponse>;
  saveEditorCardImageNumber(
    request: SaveEditorCardImageNumberRequest,
  ): Promise<SaveEditorCardFieldResponse>;
  saveEditorTagRegistry(
    request: SaveEditorTagRegistryRequest,
  ): Promise<SaveEditorTagRegistryResponse>;
  saveEditorTideRegistry(
    request: SaveEditorTideRegistryRequest,
  ): Promise<SaveEditorTagRegistryResponse>;
}
