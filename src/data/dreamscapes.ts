import type {
  AffiliationContent,
  DreamGuideContent,
  DreamscapeContent,
} from "../types/content";
import type { SiteType } from "../types/quest";

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

// ---------------------------------------------------------------------------
// Dreamscape -> guide -> signature site helpers
// ---------------------------------------------------------------------------
//
// Every non-starter dreamscape has a resident Dream Guide whose home specialty
// is a single signature site type. Site composition treats that signature site
// as the dreamscape's enhanced site and draws fill from the *other* dreamscapes'
// signature sites, so these helpers centralise the dreamscape -> signature-site
// mapping the generator relies on.

/**
 * The signature site types of every non-starter dreamscape. Each is a distinct
 * site type (the 10 guide site types), so the result has no duplicates. This is
 * the universe the composition fill pool draws the "other guides' signature
 * sites" from.
 */
function guideSignatureSites(
  dreamscapes: readonly DreamscapeContent[],
): SiteType[] {
  const sites: SiteType[] = [];
  for (const dreamscape of dreamscapes) {
    if (dreamscape.isStarter) {
      continue;
    }
    if (!sites.includes(dreamscape.signatureSite)) {
      sites.push(dreamscape.signatureSite);
    }
  }
  return sites;
}

/**
 * The signature sites of every non-starter dreamscape *except* `homeSite`,
 * i.e. the fill candidates for a dreamscape whose own enhanced site is
 * `homeSite`. The home site is excluded so the dreamscape's signature site is
 * never duplicated by the fill.
 */
export function otherGuideSignatureSites(
  dreamscapes: readonly DreamscapeContent[],
  homeSite: SiteType,
): SiteType[] {
  return guideSignatureSites(dreamscapes).filter((site) => site !== homeSite);
}
