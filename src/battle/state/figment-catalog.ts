/**
 * The 14-type figment catalog (rules §Figments). Each figment type has a base
 * spark and may carry a single implicit keyword. Creating a figment of a given
 * type yields these defaults instead of free-typed values: the base spark seeds
 * the new figment's spark and the keyword is stamped onto its status.
 *
 * This module is plain data. It is consumed by `CREATE_FIGMENT` (catalog
 * defaults for the base spark and keyword) and by the figment-creator UI.
 */

/**
 * A keyword a figment type carries implicitly. `support` is the +1✦ Support
 * benefit a Synth grants; the other four map onto the combat-keyword `granted*`
 * status flags.
 */
export type FigmentKeyword =
  | "unstoppable"
  | "support"
  | "preeminence"
  | "vengeful"
  | "awakened";

export interface FigmentCatalogEntry {
  /** The normalized lookup key (`normalizeFigmentCatalogKey(subtype)`). */
  key: string;
  /** The figment type as printed (display form). */
  subtype: string;
  /** The base spark of a single figment of this type. */
  baseSpark: number;
  /** The implicit keyword this type carries, if any. */
  keyword?: FigmentKeyword;
}

/**
 * Normalizes a figment subtype to its catalog lookup key: trimmed and
 * lower-cased. Mirrors the normalization used elsewhere for figment subtypes.
 */
export function normalizeFigmentCatalogKey(subtype: string): string {
  return subtype.trim().toLowerCase();
}

function entry(
  subtype: string,
  baseSpark: number,
  keyword?: FigmentKeyword,
): FigmentCatalogEntry {
  return {
    key: normalizeFigmentCatalogKey(subtype),
    subtype,
    baseSpark,
    ...(keyword === undefined ? {} : { keyword }),
  };
}

/**
 * The 14 figment types in rules-table order (rules §Figments). Base spark and
 * implicit keyword are taken directly from that table.
 */
export const FIGMENT_CATALOG_ENTRIES: readonly FigmentCatalogEntry[] = [
  entry("Warrior", 1),
  entry("Ancient", 4, "unstoppable"),
  entry("Enigma", 0),
  entry("Shadow", 2),
  entry("Spirit Animal", 1),
  entry("Synth", 0, "support"),
  entry("Monstrosity", 4),
  entry("Survivor", 1),
  entry("Celestial", 2, "preeminence"),
  entry("Wraith", 0, "vengeful"),
  entry("Ethereal", 1),
  entry("Radiant", 2),
  entry("Ember", 1, "awakened"),
  entry("Outsider", 1),
];

/**
 * The catalog keyed by normalized subtype. Use `lookupFigmentCatalogEntry` for
 * tolerant (non-normalized) lookups.
 */
export const FIGMENT_CATALOG: Readonly<Record<string, FigmentCatalogEntry>> =
  Object.fromEntries(FIGMENT_CATALOG_ENTRIES.map((item) => [item.key, item]));

/**
 * Looks up the catalog entry for a (possibly non-normalized) subtype. Returns
 * `undefined` when the subtype is not one of the 14 figment types.
 */
export function lookupFigmentCatalogEntry(
  subtype: string,
): FigmentCatalogEntry | undefined {
  return FIGMENT_CATALOG[normalizeFigmentCatalogKey(subtype)];
}
