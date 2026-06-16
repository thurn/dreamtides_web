import type {
  DreamcallerDisplayState,
  DreamcallerSearchScope,
  DreamcallerSize,
  DreamcallerSortDirection,
  DreamcallerSortField,
} from "./dreamcaller-types";

const SORT_FIELDS = new Set<DreamcallerSortField>([
  "sourceOrder",
  "name",
  "startingEssence",
  "rulesTextLength",
  "facetCount",
]);

const SEARCH_SCOPES = new Set<DreamcallerSearchScope>(["name", "all"]);
const SORT_DIRECTIONS = new Set<DreamcallerSortDirection>(["asc", "desc"]);
const SIZES = new Set<DreamcallerSize>(["small", "medium", "large"]);

export const DEFAULT_DREAMCALLER_DISPLAY_STATE: DreamcallerDisplayState = {
  searchText: "",
  searchScope: "name",
  type: "all",
  cost: "all",
  subtype: "",
  sort: "sourceOrder",
  dir: "asc",
  size: "large",
};

export function parseDreamcallerDisplayState(search: string): DreamcallerDisplayState {
  const params = new URLSearchParams(search);
  const scope = params.get("scope");
  const sort = params.get("sort");
  const dir = params.get("dir");
  const size = params.get("size");

  return {
    ...DEFAULT_DREAMCALLER_DISPLAY_STATE,
    searchText: params.get("q") ?? DEFAULT_DREAMCALLER_DISPLAY_STATE.searchText,
    searchScope:
      scope !== null && SEARCH_SCOPES.has(scope as DreamcallerSearchScope)
        ? (scope as DreamcallerSearchScope)
        : DEFAULT_DREAMCALLER_DISPLAY_STATE.searchScope,
    sort:
      sort !== null && SORT_FIELDS.has(sort as DreamcallerSortField)
        ? (sort as DreamcallerSortField)
        : DEFAULT_DREAMCALLER_DISPLAY_STATE.sort,
    dir:
      dir !== null && SORT_DIRECTIONS.has(dir as DreamcallerSortDirection)
        ? (dir as DreamcallerSortDirection)
        : DEFAULT_DREAMCALLER_DISPLAY_STATE.dir,
    size:
      size !== null && SIZES.has(size as DreamcallerSize)
        ? (size as DreamcallerSize)
        : DEFAULT_DREAMCALLER_DISPLAY_STATE.size,
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

export function replaceDreamcallerDisplayStateInUrl(state: DreamcallerDisplayState) {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  setIfChanged(params, "q", state.searchText, DEFAULT_DREAMCALLER_DISPLAY_STATE.searchText);
  setIfChanged(params, "scope", state.searchScope, DEFAULT_DREAMCALLER_DISPLAY_STATE.searchScope);
  setIfChanged(params, "sort", state.sort, DEFAULT_DREAMCALLER_DISPLAY_STATE.sort);
  setIfChanged(params, "dir", state.dir, DEFAULT_DREAMCALLER_DISPLAY_STATE.dir);
  setIfChanged(params, "size", state.size, DEFAULT_DREAMCALLER_DISPLAY_STATE.size);

  const nextSearch = params.toString();
  const nextUrl = `${url.pathname}${nextSearch === "" ? "" : `?${nextSearch}`}${url.hash}`;
  window.history.replaceState(null, "", nextUrl);
}
