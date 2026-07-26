import type {
  DreamAvatarDisplayState,
  DreamAvatarSearchScope,
  DreamAvatarSize,
  DreamAvatarSortDirection,
  DreamAvatarSortField,
} from "./dream-avatar-types";

const SORT_FIELDS = new Set<DreamAvatarSortField>([
  "sourceOrder",
  "name",
  "startingEssence",
  "rulesTextLength",
  "facetCount",
]);

const SEARCH_SCOPES = new Set<DreamAvatarSearchScope>(["name", "all"]);
const SORT_DIRECTIONS = new Set<DreamAvatarSortDirection>(["asc", "desc"]);
const SIZES = new Set<DreamAvatarSize>(["small", "medium", "large"]);

export const DEFAULT_DREAM_AVATAR_DISPLAY_STATE: DreamAvatarDisplayState = {
  searchText: "",
  searchScope: "name",
  type: "all",
  cost: "all",
  subtype: "",
  sort: "sourceOrder",
  dir: "asc",
  size: "large",
};

export function parseDreamAvatarDisplayState(search: string): DreamAvatarDisplayState {
  const params = new URLSearchParams(search);
  const scope = params.get("scope");
  const sort = params.get("sort");
  const dir = params.get("dir");
  const size = params.get("size");

  return {
    ...DEFAULT_DREAM_AVATAR_DISPLAY_STATE,
    searchText: params.get("q") ?? DEFAULT_DREAM_AVATAR_DISPLAY_STATE.searchText,
    searchScope:
      scope !== null && SEARCH_SCOPES.has(scope as DreamAvatarSearchScope)
        ? (scope as DreamAvatarSearchScope)
        : DEFAULT_DREAM_AVATAR_DISPLAY_STATE.searchScope,
    sort:
      sort !== null && SORT_FIELDS.has(sort as DreamAvatarSortField)
        ? (sort as DreamAvatarSortField)
        : DEFAULT_DREAM_AVATAR_DISPLAY_STATE.sort,
    dir:
      dir !== null && SORT_DIRECTIONS.has(dir as DreamAvatarSortDirection)
        ? (dir as DreamAvatarSortDirection)
        : DEFAULT_DREAM_AVATAR_DISPLAY_STATE.dir,
    size:
      size !== null && SIZES.has(size as DreamAvatarSize)
        ? (size as DreamAvatarSize)
        : DEFAULT_DREAM_AVATAR_DISPLAY_STATE.size,
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

export function replaceDreamAvatarDisplayStateInUrl(state: DreamAvatarDisplayState) {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  setIfChanged(params, "q", state.searchText, DEFAULT_DREAM_AVATAR_DISPLAY_STATE.searchText);
  setIfChanged(params, "scope", state.searchScope, DEFAULT_DREAM_AVATAR_DISPLAY_STATE.searchScope);
  setIfChanged(params, "sort", state.sort, DEFAULT_DREAM_AVATAR_DISPLAY_STATE.sort);
  setIfChanged(params, "dir", state.dir, DEFAULT_DREAM_AVATAR_DISPLAY_STATE.dir);
  setIfChanged(params, "size", state.size, DEFAULT_DREAM_AVATAR_DISPLAY_STATE.size);

  const nextSearch = params.toString();
  const nextUrl = `${url.pathname}${nextSearch === "" ? "" : `?${nextSearch}`}${url.hash}`;
  window.history.replaceState(null, "", nextUrl);
}
