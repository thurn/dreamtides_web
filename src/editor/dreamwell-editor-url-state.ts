import type {
  DreamwellDisplayState,
  DreamwellSize,
  DreamwellSortDirection,
  DreamwellSortField,
} from "./dreamwell-types";

const SORT_FIELDS = new Set<DreamwellSortField>([
  "sourceOrder",
  "name",
  "energyAdded",
  "order",
]);

const SORT_DIRECTIONS = new Set<DreamwellSortDirection>(["asc", "desc"]);
const SIZES = new Set<DreamwellSize>(["small", "medium", "large"]);

export const DEFAULT_DREAMWELL_DISPLAY_STATE: DreamwellDisplayState = {
  searchText: "",
  artEditing: false,
  sort: "sourceOrder",
  dir: "asc",
  size: "large",
};

export function parseDreamwellDisplayState(search: string): DreamwellDisplayState {
  const params = new URLSearchParams(search);
  const sort = params.get("sort");
  const dir = params.get("dir");
  const size = params.get("size");

  return {
    ...DEFAULT_DREAMWELL_DISPLAY_STATE,
    searchText: params.get("q") ?? DEFAULT_DREAMWELL_DISPLAY_STATE.searchText,
    artEditing: params.get("edit") === "1",
    sort:
      sort !== null && SORT_FIELDS.has(sort as DreamwellSortField)
        ? (sort as DreamwellSortField)
        : DEFAULT_DREAMWELL_DISPLAY_STATE.sort,
    dir:
      dir !== null && SORT_DIRECTIONS.has(dir as DreamwellSortDirection)
        ? (dir as DreamwellSortDirection)
        : DEFAULT_DREAMWELL_DISPLAY_STATE.dir,
    size:
      size !== null && SIZES.has(size as DreamwellSize)
        ? (size as DreamwellSize)
        : DEFAULT_DREAMWELL_DISPLAY_STATE.size,
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

export function replaceDreamwellDisplayStateInUrl(state: DreamwellDisplayState) {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  setIfChanged(params, "q", state.searchText, DEFAULT_DREAMWELL_DISPLAY_STATE.searchText);
  setIfChanged(params, "edit", state.artEditing ? "1" : "", "");
  setIfChanged(params, "sort", state.sort, DEFAULT_DREAMWELL_DISPLAY_STATE.sort);
  setIfChanged(params, "dir", state.dir, DEFAULT_DREAMWELL_DISPLAY_STATE.dir);
  setIfChanged(params, "size", state.size, DEFAULT_DREAMWELL_DISPLAY_STATE.size);

  const nextSearch = params.toString();
  const nextUrl = `${url.pathname}${nextSearch === "" ? "" : `?${nextSearch}`}${url.hash}`;
  window.history.replaceState(null, "", nextUrl);
}
