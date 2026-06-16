import type {
  DreamsignDisplayState,
  DreamsignSearchScope,
  DreamsignSize,
  DreamsignSortDirection,
  DreamsignSortField,
} from "./dreamsign-types";

const SORT_FIELDS = new Set<DreamsignSortField>([
  "sourceOrder",
  "name",
  "rulesTextLength",
  "nameLength",
  "tagCount",
  "similarityGroup",
]);

const SEARCH_SCOPES = new Set<DreamsignSearchScope>(["name", "all"]);
const SORT_DIRECTIONS = new Set<DreamsignSortDirection>(["asc", "desc"]);
const SIZES = new Set<DreamsignSize>(["small", "medium", "large"]);

export const DEFAULT_DREAMSIGN_DISPLAY_STATE: DreamsignDisplayState = {
  searchText: "",
  searchScope: "name",
  type: "all",
  cost: "all",
  subtype: "",
  tagFilters: [],
  excludedTagFilters: [],
  tagEditing: false,
  checkboxTag: "",
  sort: "sourceOrder",
  dir: "asc",
  size: "large",
};

function listParam(params: URLSearchParams, key: string): string[] {
  const value = params.get(key);
  if (value === null || value.trim() === "") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

export function parseDreamsignDisplayState(search: string): DreamsignDisplayState {
  const params = new URLSearchParams(search);
  const scope = params.get("scope");
  const sort = params.get("sort");
  const dir = params.get("dir");
  const size = params.get("size");

  return {
    ...DEFAULT_DREAMSIGN_DISPLAY_STATE,
    searchText: params.get("q") ?? DEFAULT_DREAMSIGN_DISPLAY_STATE.searchText,
    searchScope:
      scope !== null && SEARCH_SCOPES.has(scope as DreamsignSearchScope)
        ? (scope as DreamsignSearchScope)
        : DEFAULT_DREAMSIGN_DISPLAY_STATE.searchScope,
    tagFilters: listParam(params, "tags"),
    excludedTagFilters: listParam(params, "notTags"),
    tagEditing: params.get("editTags") === "1",
    checkboxTag: params.get("checkboxTag") ?? "",
    sort:
      sort !== null && SORT_FIELDS.has(sort as DreamsignSortField)
        ? (sort as DreamsignSortField)
        : DEFAULT_DREAMSIGN_DISPLAY_STATE.sort,
    dir:
      dir !== null && SORT_DIRECTIONS.has(dir as DreamsignSortDirection)
        ? (dir as DreamsignSortDirection)
        : DEFAULT_DREAMSIGN_DISPLAY_STATE.dir,
    size:
      size !== null && SIZES.has(size as DreamsignSize)
        ? (size as DreamsignSize)
        : DEFAULT_DREAMSIGN_DISPLAY_STATE.size,
  };
}

function setIfChanged(
  params: URLSearchParams,
  key: string,
  value: string,
  defaultValue: string,
) {
  if (value === defaultValue || value === "") {
    params.delete(key);
  } else {
    params.set(key, value);
  }
}

function setListIfChanged(params: URLSearchParams, key: string, values: string[]) {
  if (values.length === 0) {
    params.delete(key);
  } else {
    params.set(key, values.join(","));
  }
}

export function replaceDreamsignDisplayStateInUrl(state: DreamsignDisplayState) {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  setIfChanged(params, "q", state.searchText, DEFAULT_DREAMSIGN_DISPLAY_STATE.searchText);
  setIfChanged(params, "scope", state.searchScope, DEFAULT_DREAMSIGN_DISPLAY_STATE.searchScope);
  setListIfChanged(params, "tags", state.tagFilters);
  setListIfChanged(params, "notTags", state.excludedTagFilters);
  setIfChanged(params, "editTags", state.tagEditing ? "1" : "", "");
  setIfChanged(params, "checkboxTag", state.checkboxTag, "");
  setIfChanged(params, "sort", state.sort, DEFAULT_DREAMSIGN_DISPLAY_STATE.sort);
  setIfChanged(params, "dir", state.dir, DEFAULT_DREAMSIGN_DISPLAY_STATE.dir);
  setIfChanged(params, "size", state.size, DEFAULT_DREAMSIGN_DISPLAY_STATE.size);

  const nextSearch = params.toString();
  const nextUrl = `${url.pathname}${nextSearch === "" ? "" : `?${nextSearch}`}${url.hash}`;
  window.history.replaceState(null, "", nextUrl);
}
