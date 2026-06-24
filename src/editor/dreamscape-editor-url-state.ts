import {
  DEFAULT_DREAMSCAPE_DISPLAY_STATE,
  type DreamscapeCardSize,
  type DreamscapeDisplayState,
} from "./dreamscape-types";

const SIZES = new Set<DreamscapeCardSize>(["small", "medium", "large"]);

export function parseDreamscapeDisplayState(search: string): DreamscapeDisplayState {
  const params = new URLSearchParams(search);
  const size = params.get("size");

  return {
    ...DEFAULT_DREAMSCAPE_DISPLAY_STATE,
    searchText: params.get("q") ?? DEFAULT_DREAMSCAPE_DISPLAY_STATE.searchText,
    size:
      size !== null && SIZES.has(size as DreamscapeCardSize)
        ? (size as DreamscapeCardSize)
        : DEFAULT_DREAMSCAPE_DISPLAY_STATE.size,
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

export function replaceDreamscapeDisplayStateInUrl(state: DreamscapeDisplayState) {
  const url = new URL(window.location.href);
  const params = url.searchParams;

  setIfChanged(params, "q", state.searchText, DEFAULT_DREAMSCAPE_DISPLAY_STATE.searchText);
  setIfChanged(params, "size", state.size, DEFAULT_DREAMSCAPE_DISPLAY_STATE.size);

  const nextSearch = params.toString();
  const nextUrl = `${url.pathname}${nextSearch === "" ? "" : `?${nextSearch}`}${url.hash}`;
  window.history.replaceState(null, "", nextUrl);
}
