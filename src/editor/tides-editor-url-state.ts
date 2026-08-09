import type { CardSizePreset } from "./card-size";

/**
 * All tides-editor view state lives in the URL so a view is shareable and
 * survives reload:
 *   - `file`  the canonical tides catalog.
 *   - `tide`  the selected tide id; absent means the list view.
 *   - `size`  the detail card-grid size preset (default `medium`).
 */
export interface TidesEditorUrlState {
  file: typeof DEFAULT_TIDES_FILE;
  tideId: string | null;
  size: CardSizePreset;
}

export const DEFAULT_TIDES_FILE = "tides";
const DEFAULT_SIZE: CardSizePreset = "medium";

function isSize(value: string | null): value is CardSizePreset {
  return value === "small" || value === "medium" || value === "large";
}

export function parseTidesEditorUrlState(search: string): TidesEditorUrlState {
  const params = new URLSearchParams(search);
  const tideId = params.get("tide");
  const size = params.get("size");
  return {
    file: DEFAULT_TIDES_FILE,
    tideId: tideId !== null && tideId !== "" ? tideId : null,
    size: isSize(size) ? size : DEFAULT_SIZE,
  };
}

export function serializeTidesEditorUrlState(state: TidesEditorUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.tideId !== null) params.set("tide", state.tideId);
  if (state.size !== DEFAULT_SIZE) params.set("size", state.size);
  return params;
}

function urlFor(state: TidesEditorUrlState): string {
  const params = serializeTidesEditorUrlState(state);
  const query = params.toString();
  return `${window.location.pathname}${query === "" ? "" : `?${query}`}${window.location.hash}`;
}

/** Replace the current history entry (filters/size changes; no new back step). */
export function replaceTidesEditorUrlState(state: TidesEditorUrlState): void {
  window.history.replaceState(window.history.state, "", urlFor(state));
}

/** Push a new history entry (opening a tide adds a Back step to the list). */
export function pushTidesEditorUrlState(state: TidesEditorUrlState): void {
  window.history.pushState({ tidesEditorPushed: true }, "", urlFor(state));
}

/** Whether the current entry was pushed by opening a tide (so Back returns). */
export function isPushedTidesEditorEntry(): boolean {
  const state: unknown = window.history.state;
  return (
    state !== null &&
    typeof state === "object" &&
    "tidesEditorPushed" in state &&
    (state as { tidesEditorPushed?: unknown }).tidesEditorPushed === true
  );
}
