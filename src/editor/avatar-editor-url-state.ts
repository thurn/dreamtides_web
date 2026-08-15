import type {
  AvatarDisplayState,
  AvatarSearchScope,
  AvatarSize,
  AvatarSortDirection,
  AvatarSortField,
} from "./avatar-types";

const SORT_FIELDS = new Set<AvatarSortField>([
  "sourceOrder",
  "name",
  "startingEssence",
  "rulesTextLength",
  "facetCount",
]);

const SEARCH_SCOPES = new Set<AvatarSearchScope>(["name", "all"]);
const SORT_DIRECTIONS = new Set<AvatarSortDirection>(["asc", "desc"]);
const SIZES = new Set<AvatarSize>(["small", "medium", "large"]);

export const DEFAULT_AVATAR_DISPLAY_STATE: AvatarDisplayState = {
  searchText: "",
  searchScope: "name",
  type: "all",
  cost: "all",
  subtype: "",
  sort: "sourceOrder",
  dir: "asc",
  size: "large",
};

export function parseAvatarDisplayState(search: string): AvatarDisplayState {
  const params = new URLSearchParams(search);
  const scope = params.get("scope");
  const sort = params.get("sort");
  const dir = params.get("dir");
  const size = params.get("size");

  return {
    ...DEFAULT_AVATAR_DISPLAY_STATE,
    searchText: params.get("q") ?? DEFAULT_AVATAR_DISPLAY_STATE.searchText,
    searchScope:
      scope !== null && SEARCH_SCOPES.has(scope as AvatarSearchScope)
        ? (scope as AvatarSearchScope)
        : DEFAULT_AVATAR_DISPLAY_STATE.searchScope,
    sort:
      sort !== null && SORT_FIELDS.has(sort as AvatarSortField)
        ? (sort as AvatarSortField)
        : DEFAULT_AVATAR_DISPLAY_STATE.sort,
    dir:
      dir !== null && SORT_DIRECTIONS.has(dir as AvatarSortDirection)
        ? (dir as AvatarSortDirection)
        : DEFAULT_AVATAR_DISPLAY_STATE.dir,
    size:
      size !== null && SIZES.has(size as AvatarSize)
        ? (size as AvatarSize)
        : DEFAULT_AVATAR_DISPLAY_STATE.size,
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

export function replaceAvatarDisplayStateInUrl(state: AvatarDisplayState) {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  setIfChanged(params, "q", state.searchText, DEFAULT_AVATAR_DISPLAY_STATE.searchText);
  setIfChanged(params, "scope", state.searchScope, DEFAULT_AVATAR_DISPLAY_STATE.searchScope);
  setIfChanged(params, "sort", state.sort, DEFAULT_AVATAR_DISPLAY_STATE.sort);
  setIfChanged(params, "dir", state.dir, DEFAULT_AVATAR_DISPLAY_STATE.dir);
  setIfChanged(params, "size", state.size, DEFAULT_AVATAR_DISPLAY_STATE.size);

  const nextSearch = params.toString();
  const nextUrl = `${url.pathname}${nextSearch === "" ? "" : `?${nextSearch}`}${url.hash}`;
  window.history.replaceState(null, "", nextUrl);
}
