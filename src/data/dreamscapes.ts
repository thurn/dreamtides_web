import type {
  AffiliationContent,
  DreamGuideContent,
  DreamscapeContent,
} from "../types/content";

// Re-export the content types so callers can import dreamscape/guide/affiliation
// shapes alongside their loaders from one module.
export type {
  AffiliationContent,
  DreamGuideContent,
  DreamscapeContent,
} from "../types/content";

const DREAMSCAPES_JSON_PATH = "/dreamscapes-data.json";
const DREAM_GUIDES_JSON_PATH = "/dream-guides-data.json";
const AFFILIATIONS_JSON_PATH = "/affiliations-data.json";

async function fetchJson<T>(path: string, label: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(
      `Failed to load ${label}: ${String(response.status)} ${response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

/** Fetches the dreamscape definitions from the asset pipeline output. */
export async function loadDreamscapes(): Promise<DreamscapeContent[]> {
  return fetchJson<DreamscapeContent[]>(
    DREAMSCAPES_JSON_PATH,
    "dreamscape data",
  );
}

/** Fetches the Dream Guide definitions from the asset pipeline output. */
export async function loadDreamGuides(): Promise<DreamGuideContent[]> {
  return fetchJson<DreamGuideContent[]>(
    DREAM_GUIDES_JSON_PATH,
    "dream guide data",
  );
}

/** Fetches the affiliation definitions from the asset pipeline output. */
export async function loadAffiliations(): Promise<AffiliationContent[]> {
  return fetchJson<AffiliationContent[]>(
    AFFILIATIONS_JSON_PATH,
    "affiliation data",
  );
}
