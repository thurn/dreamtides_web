import type {
  EditorCardSize,
  EditorCostFilter,
  EditorDisplayState,
  EditorSortDirection,
  EditorSortField,
  EditorTypeFilter,
} from "./types";

export const DEFAULT_EDITOR_DISPLAY_STATE: EditorDisplayState = {
  searchText: "",
  type: "all",
  cost: "all",
  subtype: "",
  sort: "name",
  dir: "asc",
  size: "medium",
};

const TYPE_VALUES = new Set<EditorTypeFilter>(["all", "character", "event"]);
const COST_VALUES = new Set<EditorCostFilter>([
  "all",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5plus",
  "x",
]);
const SORT_PARAM_TO_FIELD = new Map<string, EditorSortField>([
  ["number", "cardNumber"],
  ["name", "name"],
  ["cost", "cost"],
  ["type", "type"],
  ["subtype", "subtype"],
  ["spark", "spark"],
]);
const SORT_FIELD_TO_PARAM: Record<EditorSortField, string> = {
  cardNumber: "number",
  name: "name",
  cost: "cost",
  type: "type",
  subtype: "subtype",
  spark: "spark",
};
const DIR_VALUES = new Set<EditorSortDirection>(["asc", "desc"]);
const SIZE_VALUES = new Set<EditorCardSize>(["small", "medium", "large"]);

function paramsFromSearch(search: string | URLSearchParams): URLSearchParams {
  return new URLSearchParams(search);
}

function parseType(value: string | null): EditorTypeFilter {
  return value !== null && TYPE_VALUES.has(value as EditorTypeFilter)
    ? (value as EditorTypeFilter)
    : DEFAULT_EDITOR_DISPLAY_STATE.type;
}

function parseCost(value: string | null): EditorCostFilter {
  if (value === null) {
    return DEFAULT_EDITOR_DISPLAY_STATE.cost;
  }

  const normalized = value.trim().toLowerCase();
  return COST_VALUES.has(normalized as EditorCostFilter)
    ? (normalized as EditorCostFilter)
    : DEFAULT_EDITOR_DISPLAY_STATE.cost;
}

function parseSort(value: string | null): EditorSortField {
  if (value === null) {
    return DEFAULT_EDITOR_DISPLAY_STATE.sort;
  }

  return SORT_PARAM_TO_FIELD.get(value) ?? DEFAULT_EDITOR_DISPLAY_STATE.sort;
}

function parseDir(value: string | null): EditorSortDirection {
  return value !== null && DIR_VALUES.has(value as EditorSortDirection)
    ? (value as EditorSortDirection)
    : DEFAULT_EDITOR_DISPLAY_STATE.dir;
}

function parseSize(value: string | null): EditorCardSize {
  return value !== null && SIZE_VALUES.has(value as EditorCardSize)
    ? (value as EditorCardSize)
    : DEFAULT_EDITOR_DISPLAY_STATE.size;
}

export function parseEditorDisplayState(
  search: string | URLSearchParams = window.location.search,
): EditorDisplayState {
  const params = paramsFromSearch(search);

  return {
    searchText: params.get("q") ?? DEFAULT_EDITOR_DISPLAY_STATE.searchText,
    type: parseType(params.get("type")),
    cost: parseCost(params.get("cost")),
    subtype: params.get("subtype") ?? DEFAULT_EDITOR_DISPLAY_STATE.subtype,
    sort: parseSort(params.get("sort")),
    dir: parseDir(params.get("dir")),
    size: parseSize(params.get("size")),
  };
}

export function serializeEditorDisplayState(
  state: EditorDisplayState,
): URLSearchParams {
  const params = new URLSearchParams();

  if (state.searchText !== DEFAULT_EDITOR_DISPLAY_STATE.searchText) {
    params.set("q", state.searchText);
  }
  if (state.type !== DEFAULT_EDITOR_DISPLAY_STATE.type) {
    params.set("type", state.type);
  }
  if (state.cost !== DEFAULT_EDITOR_DISPLAY_STATE.cost) {
    params.set("cost", state.cost);
  }
  if (state.subtype !== DEFAULT_EDITOR_DISPLAY_STATE.subtype) {
    params.set("subtype", state.subtype);
  }
  if (state.sort !== DEFAULT_EDITOR_DISPLAY_STATE.sort) {
    params.set("sort", SORT_FIELD_TO_PARAM[state.sort]);
  }
  if (state.dir !== DEFAULT_EDITOR_DISPLAY_STATE.dir) {
    params.set("dir", state.dir);
  }
  if (state.size !== DEFAULT_EDITOR_DISPLAY_STATE.size) {
    params.set("size", state.size);
  }

  return params;
}

export function replaceEditorDisplayStateInUrl(
  state: EditorDisplayState,
  history: History = window.history,
  location: Location = window.location,
): void {
  const url = new URL(location.href);
  const params = serializeEditorDisplayState(state);
  const query = params.toString();

  url.search = query.length > 0 ? `?${query}` : "";
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
