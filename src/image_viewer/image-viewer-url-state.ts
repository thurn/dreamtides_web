import {
  ALL_CATEGORY,
  COLUMN_OPTIONS,
  DEFAULT_COLUMNS,
  type ColumnCount,
  type ImageViewerDisplayState,
} from "./types";

export const DEFAULT_IMAGE_VIEWER_DISPLAY_STATE: ImageViewerDisplayState = {
  category: ALL_CATEGORY,
  showUsed: false,
  onlyNamed: false,
  randomOrder: false,
  columns: DEFAULT_COLUMNS,
};

function parseColumns(raw: string | null): ColumnCount {
  const value = Number(raw);
  return (COLUMN_OPTIONS as readonly number[]).includes(value)
    ? (value as ColumnCount)
    : DEFAULT_COLUMNS;
}

/**
 * Parse the viewer's display state from a URL query string. Unknown or missing
 * parameters fall back to the defaults (all categories, used images hidden,
 * every image regardless of name, alphabetical order, four columns).
 * `category` is accepted verbatim so a literal subdirectory name round-trips;
 * the app validates it against the loaded manifest.
 */
export function parseImageViewerDisplayState(
  search: string,
): ImageViewerDisplayState {
  const params = new URLSearchParams(search);
  const category = params.get("category");
  const used = params.get("used");
  const named = params.get("named");
  const random = params.get("random");

  return {
    category:
      category !== null && category.trim() !== "" ? category : ALL_CATEGORY,
    showUsed: used === "1" || used === "true",
    onlyNamed: named === "1" || named === "true",
    randomOrder: random === "1" || random === "true",
    columns: parseColumns(params.get("cols")),
  };
}

/**
 * Serialize display state to a query string, omitting parameters that match the
 * defaults so a clean view produces a clean URL.
 */
export function serializeImageViewerDisplayState(
  state: ImageViewerDisplayState,
): string {
  const params = new URLSearchParams();
  if (state.category !== ALL_CATEGORY) {
    params.set("category", state.category);
  }
  if (state.showUsed) {
    params.set("used", "1");
  }
  if (state.onlyNamed) {
    params.set("named", "1");
  }
  if (state.randomOrder) {
    params.set("random", "1");
  }
  if (state.columns !== DEFAULT_COLUMNS) {
    params.set("cols", String(state.columns));
  }

  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}
