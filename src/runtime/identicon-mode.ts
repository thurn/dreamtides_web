/**
 * `identicons=1` URL parameter handling.
 *
 * When present, every card renders its generated identicon art instead of its
 * assigned image. Both the quest prototype and the standalone card editor
 * render cards through `CardView`, so a single shared reader covers both
 * surfaces. Like the other quest runtime parameters this is read once per page
 * load and is not reactive; changing it requires a reload.
 */

/** Whether `identicons=1` forces identicon art for the given query string. */
export function parseIdenticonsParam(
  search: string = window.location.search,
): boolean {
  return new URLSearchParams(search).get("identicons") === "1";
}

let cached: boolean | null = null;

/**
 * Cached read of the `identicons=1` URL parameter from the current location.
 * Read once on first access and memoized for the lifetime of the page load.
 */
export function identiconsForced(): boolean {
  cached ??= parseIdenticonsParam();
  return cached;
}
