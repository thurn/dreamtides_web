/**
 * The 14-type figment catalog (rules §Figments). Each figment type has a base
 * spark and may carry a single implicit keyword. Creating a figment of a given
 * type yields these defaults instead of free-typed values: the base spark seeds
 * the new figment's spark and the keyword is stamped onto its status.
 *
 * A Legion is a Warrior whose spark equals the number of allied warriors,
 * counting itself; its catalog `baseSpark` of 1 is the per-warrior rate, and the
 * live spark is computed from the board (see `countAlliedWarriors` in
 * `figments.ts`).
 *
 * This module is plain data. It is consumed by `CREATE_FIGMENT` (catalog
 * defaults for the base spark and keyword) and by the figment-creator UI.
 */

import type { ArtCrop } from "../../types/cards";

/**
 * A keyword a figment type carries implicitly. Each maps onto the matching
 * combat-keyword `granted*` status flag, carried by every figment of that type.
 */
export type FigmentKeyword =
  | "unstoppable"
  | "vengeful"
  | "awakened";

export interface FigmentCatalogEntry {
  /** Stable identity for this authored figment type. */
  id: string;
  /** The normalized lookup key (`normalizeFigmentCatalogKey(subtype)`). */
  key: string;
  /** The figment type as printed (display form). */
  subtype: string;
  /** The base spark of a single figment of this type. */
  baseSpark: number;
  /** The implicit keyword this type carries, if any. */
  keyword?: FigmentKeyword;
  /**
   * The figment's display name, sourced from `figments.toml` once the catalog
   * is hydrated. Absent on the built-in defaults, where callers fall back to a
   * `"<Type> Figment"` derivation.
   */
  name?: string;
  /** The figment's rules text, sourced from `figments.toml` when hydrated. */
  renderedText?: string;
  /** The figment's art image number, sourced from `figments.toml` when hydrated. */
  imageNumber?: number;
  /** Whether the assigned art is owned, sourced from `figments.toml`. */
  artOwned?: boolean;
  /** The authored crop applied to the figment's art. */
  art?: ArtCrop;
}

/**
 * A figment record as loaded from `figments.toml` (camelCased by
 * `transformFigment`). Hydrating the catalog from these records is what carries
 * the figment editor's edits to spark, character type, name, rules text, and
 * art into the battle UI.
 */
export interface FigmentCatalogRecord {
  id: string;
  subtype: string;
  spark: number;
  keyword?: string;
  name?: string;
  renderedText?: string;
  imageNumber?: number;
  artOwned?: boolean;
  art?: ArtCrop;
}

function normalizeHydratedKeyword(keyword: string | undefined): FigmentKeyword | undefined {
  if (keyword === "unstoppable" || keyword === "vengeful" || keyword === "awakened") {
    return keyword;
  }
  return undefined;
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
    id: `builtin:${normalizeFigmentCatalogKey(subtype)}`,
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
  entry("Monstrosity", 4),
  entry("Survivor", 1),
  entry("Celestial", 2),
  entry("Wraith", 0, "vengeful"),
  entry("Ethereal", 1),
  entry("Radiant", 2),
  entry("Ember", 1, "awakened"),
  entry("Outsider", 1),
  entry("Legion", 1),
];

/**
 * The catalog keyed by normalized subtype. Use `lookupFigmentCatalogEntry` for
 * tolerant (non-normalized) lookups.
 */
export const FIGMENT_CATALOG: Readonly<Record<string, FigmentCatalogEntry>> =
  Object.fromEntries(FIGMENT_CATALOG_ENTRIES.map((item) => [item.key, item]));

/**
 * The catalog hydrated from `figments.toml`, or `null` before the figment
 * database has loaded (the default in tests and on first paint). When present it
 * takes precedence over the built-in defaults, so a figment renders with the
 * name, character type, spark, rules text, and art the figment editor saved.
 */
let hydratedCatalog: Readonly<Record<string, FigmentCatalogEntry>> | null = null;
let hydratedEntries: readonly FigmentCatalogEntry[] | null = null;

/**
 * Replaces the live figment catalog with entries built from `figments.toml`
 * records. Each record's subtype is the lookup key; its base spark, keyword,
 * name, rules text, and image number become the entry the battle UI reads when
 * creating and rendering a figment of that type.
 */
export function hydrateFigmentCatalog(records: readonly FigmentCatalogRecord[]): void {
  const entries = records.map((record) => {
    const keyword = normalizeHydratedKeyword(record.keyword);
    return {
      id: record.id,
      key: normalizeFigmentCatalogKey(record.subtype),
      subtype: record.subtype,
      baseSpark: Number.isFinite(record.spark) ? record.spark : 0,
      ...(keyword === undefined ? {} : { keyword }),
      ...(record.name === undefined ? {} : { name: record.name }),
      ...(record.renderedText === undefined
        ? {}
        : { renderedText: record.renderedText }),
      ...(record.imageNumber === undefined
        ? {}
        : { imageNumber: record.imageNumber }),
      ...(record.artOwned === undefined ? {} : { artOwned: record.artOwned }),
      ...(record.art === undefined ? {} : { art: record.art }),
    } satisfies FigmentCatalogEntry;
  });
  hydratedEntries = entries;
  hydratedCatalog = Object.fromEntries(entries.map((item) => [item.key, item]));
}

/**
 * The live figment catalog entries — the hydrated set from `figments.toml` when
 * loaded, otherwise the built-in defaults. The figment-creator UI lists these.
 */
export function figmentCatalogEntries(): readonly FigmentCatalogEntry[] {
  return hydratedEntries ?? FIGMENT_CATALOG_ENTRIES;
}

/** Looks up one exact authored figment type by its stable identity. */
export function lookupFigmentCatalogEntryById(
  id: string,
): FigmentCatalogEntry | undefined {
  return figmentCatalogEntries().find((entry) => entry.id === id);
}

/** Restore the built-in catalog, primarily for isolated consumers and tests. */
export function resetFigmentCatalogHydration(): void {
  hydratedEntries = null;
  hydratedCatalog = null;
}

/**
 * Looks up the catalog entry for a (possibly non-normalized) subtype. Returns
 * `undefined` when the subtype is not one of the figment types. Reads the
 * hydrated catalog when loaded, falling back to the built-in defaults.
 */
export function lookupFigmentCatalogEntry(
  subtype: string,
): FigmentCatalogEntry | undefined {
  const key = normalizeFigmentCatalogKey(subtype);
  if (hydratedCatalog !== null) {
    return hydratedCatalog[key] ?? FIGMENT_CATALOG[key];
  }
  return FIGMENT_CATALOG[key];
}
