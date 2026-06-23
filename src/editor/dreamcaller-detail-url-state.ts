// URL synchronisation for the Dreamcaller editor's full-screen detail view.
//
// Opening a Dreamcaller's detail screen records the selected id in a `detail`
// query parameter so the screen is shareable, bookmarkable, and survives a page
// reload, and so the browser Back button closes the overlay. The detail
// parameter is layered on top of the list display-state parameters
// (`q`, `sort`, `dir`, ...) without disturbing them.

const DETAIL_PARAM = "detail";

// Marker stored on history entries this module pushes, so closing the overlay
// can pop our own entry (restoring the prior list URL) instead of stepping off
// the page when the detail screen was reached directly via a shared link.
interface DreamcallerDetailHistoryState {
  dreamcallerDetailPushed?: boolean;
}

export function parseDetailIdFromUrl(search: string): string | null {
  const value = new URLSearchParams(search).get(DETAIL_PARAM);
  return value === null || value === "" ? null : value;
}

function buildDetailUrl(detailId: string | null): string {
  const url = new URL(window.location.href);
  if (detailId === null) {
    url.searchParams.delete(DETAIL_PARAM);
  } else {
    url.searchParams.set(DETAIL_PARAM, detailId);
  }
  const search = url.searchParams.toString();
  return `${url.pathname}${search === "" ? "" : `?${search}`}${url.hash}`;
}

export function pushDetailIdInUrl(detailId: string) {
  const state: DreamcallerDetailHistoryState = { dreamcallerDetailPushed: true };
  window.history.pushState(state, "", buildDetailUrl(detailId));
}

export function replaceDetailIdInUrl(detailId: string | null) {
  window.history.replaceState(null, "", buildDetailUrl(detailId));
}

// True when the current history entry is one this module pushed when opening a
// detail screen, meaning a Back step will return to the originating list URL.
export function isPushedDetailHistoryEntry(): boolean {
  const state = window.history.state as DreamcallerDetailHistoryState | null;
  return (
    state !== null && typeof state === "object" && state.dreamcallerDetailPushed === true
  );
}
