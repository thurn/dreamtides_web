import type { CardSizePreset } from "../card-size";

/**
 * Shared vocabulary for the card-browsing surfaces (the card editor and the
 * Pool Viewer). These types describe the read-only filter/sort/size controls
 * both surfaces render through `CardBrowserToolbar`; the editor extends the
 * display state with its own editing-only fields (tag/tide filters and editing
 * mode toggles).
 */

export type CardBrowserTypeFilter = "all" | "character" | "event";

export type CardBrowserCostFilter =
  | "all"
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5plus"
  | "x";

export type CardBrowserSortDirection = "asc" | "desc";

/**
 * Which card fields the search box matches against. `name` searches card names,
 * `all` additionally searches rules text, `mtg` searches the source Magic: The
 * Gathering name, and `imageNumber` searches the card-art image number.
 */
export type CardBrowserSearchScope = "name" | "all" | "mtg" | "imageNumber";

export type CardBrowserSize = CardSizePreset;

/**
 * Sort fields available to every card-browsing surface. The editor adds its own
 * facet-specific fields (e.g. tide count) on top of these.
 */
export type CardBrowserSortField =
  | "cardNumber"
  | "name"
  | "cost"
  | "type"
  | "subtype"
  | "spark"
  | "rulesTextLength"
  | "nameLength";

/**
 * The filter/sort/size values `CardBrowserToolbar` reads and writes. `sort` is a
 * plain string so a surface can plug in extra sort fields through its own
 * `sortOptions`; the surface validates the value against the options it passes.
 */
export interface CardBrowserToolbarValues {
  searchText: string;
  searchScope: CardBrowserSearchScope;
  type: CardBrowserTypeFilter;
  cost: CardBrowserCostFilter;
  subtype: string;
  sort: string;
  dir: CardBrowserSortDirection;
  size: CardBrowserSize;
}

export interface CardBrowserSortOption {
  value: string;
  label: string;
}

/** The common sort options every surface offers, in display order. */
export const CARD_BROWSER_SORT_OPTIONS: ReadonlyArray<{
  value: CardBrowserSortField;
  label: string;
}> = [
  { value: "name", label: "Name" },
  { value: "cardNumber", label: "Number" },
  { value: "cost", label: "Cost" },
  { value: "type", label: "Type" },
  { value: "subtype", label: "Subtype" },
  { value: "spark", label: "Spark" },
  { value: "rulesTextLength", label: "Rules Text Length" },
  { value: "nameLength", label: "Name Length" },
];

export const DEFAULT_CARD_BROWSER_VALUES: CardBrowserToolbarValues = {
  searchText: "",
  searchScope: "name",
  type: "all",
  cost: "all",
  subtype: "",
  sort: "name",
  dir: "asc",
  size: "medium",
};
