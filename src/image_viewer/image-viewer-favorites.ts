const FAVORITE_IMAGE_NUMBERS_STORAGE_KEY =
  "quest-prototype-image-viewer-favorites";

interface FavoriteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): FavoriteStorage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Parse the persisted image-number array, tolerating stale or malformed data. */
export function parseFavoriteImageNumbers(raw: string | null): Set<string> {
  if (raw === null) {
    return new Set();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(
      parsed
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value !== ""),
    );
  } catch {
    return new Set();
  }
}

/** Load this browser's favorite image numbers from local storage. */
export function loadFavoriteImageNumbers(
  storage: FavoriteStorage | null = browserStorage(),
): Set<string> {
  if (storage === null) {
    return new Set();
  }
  try {
    return parseFavoriteImageNumbers(
      storage.getItem(FAVORITE_IMAGE_NUMBERS_STORAGE_KEY),
    );
  } catch {
    return new Set();
  }
}

/** Persist image numbers in a stable order for easy browser-storage inspection. */
export function persistFavoriteImageNumbers(
  imageNumbers: ReadonlySet<string>,
  storage: FavoriteStorage | null = browserStorage(),
): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(
      FAVORITE_IMAGE_NUMBERS_STORAGE_KEY,
      JSON.stringify(
        [...imageNumbers].sort((left, right) => left.localeCompare(right)),
      ),
    );
  } catch {
    // Favorites remain usable in memory when storage is unavailable or full.
  }
}
