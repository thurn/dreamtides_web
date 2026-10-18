// The character credits workspace preparation writes to
// `public/d97/characters/credits.json` (scripts/d97/link-characters.ts): the
// Universal LPC Spritesheet Character Generator's CREDITS.csv rows for
// exactly the sheets the character recipes use, folded into their distinct
// authors, licenses and source pages (P23). The file is absent when the art
// library is; the credits screen then keeps its catalog summary. The format
// number names the JSON shape; a file of any other format parses to null.

export const CHARACTER_CREDITS_FORMAT = 1;

/** The generator's directory in the D97 art library (src/content/d97/art-sources.ts). */
export const CHARACTER_GENERATOR_DIRECTORY = "ulpc-generator";

/** Where the credits are served, under the art origin. */
export const CHARACTER_CREDITS_PATH = "/d97/characters/credits.json";

export interface CharacterCredits {
  readonly format: typeof CHARACTER_CREDITS_FORMAT;
  /** Distinct authors of the used sheets, collated case-insensitively. */
  readonly authors: readonly string[];
  /** Distinct licenses the used sheets are offered under, collated likewise. */
  readonly licenses: readonly string[];
  /** Distinct pages publishing the used sheets' sources, collated likewise. */
  readonly urls: readonly string[];
  /** How many distinct sheets the recipes use. */
  readonly sheets: number;
  /** Used sheets (spritesheets-relative) with no CREDITS.csv row. */
  readonly unmatched: readonly string[];
}

function strings(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
}

/** The credits in `json`, or null when they are malformed or of another format. */
export function parseCharacterCredits(json: unknown): CharacterCredits | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const value = json as Record<string, unknown>;
  const authors = strings(value.authors);
  const licenses = strings(value.licenses);
  const urls = strings(value.urls);
  const unmatched = strings(value.unmatched);
  if (value.format !== CHARACTER_CREDITS_FORMAT || authors === null || licenses === null || urls === null || unmatched === null) {
    return null;
  }
  if (typeof value.sheets !== "number") return null;
  return { format: CHARACTER_CREDITS_FORMAT, authors, licenses, urls, sheets: value.sheets, unmatched };
}
