import {
  hydrateFigmentCatalog,
  type FigmentCatalogRecord,
} from "../battle/state/figment-catalog";
import type { ArtCrop } from "../types/cards";
import { parseCardId, parseCardSubtype } from "../types/card-identity";

/**
 * The shape of a figment entry in `/figments-data.json` (generated from
 * `data/figments.toml` by `setup-assets`). Mirrors the camelCased fields
 * the figment editor writes.
 */
interface FigmentDataEntry {
  id: unknown;
  name?: string;
  subtype: unknown;
  spark?: number;
  keyword?: string;
  renderedText?: string;
  imageNumber?: number;
  artOwned?: boolean;
  art?: ArtCrop;
}

function toCatalogRecord(entry: FigmentDataEntry): FigmentCatalogRecord {
  return {
    id: parseCardId(entry.id),
    subtype: parseCardSubtype(entry.subtype),
    spark: typeof entry.spark === "number" ? entry.spark : 0,
    ...(entry.keyword === undefined ? {} : { keyword: entry.keyword }),
    ...(entry.name === undefined ? {} : { name: entry.name }),
    ...(entry.renderedText === undefined
      ? {}
      : { renderedText: entry.renderedText }),
    ...(entry.imageNumber === undefined
      ? {}
      : { imageNumber: entry.imageNumber }),
    ...(entry.artOwned === undefined ? {} : { artOwned: entry.artOwned }),
    ...(entry.art === undefined ? {} : { art: entry.art }),
  };
}

/**
 * Fetches `/figments-data.json` and hydrates the figment catalog so the battle
 * UI sources each figment type's name, character type, spark, rules text, and
 * art from `figments.toml`. A failure is non-fatal: the catalog keeps its
 * built-in rules defaults, matching pre-load rendering.
 */
export async function loadFigmentDatabase(): Promise<void> {
  const response = await fetch("/figments-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load figment data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const entries = (await response.json()) as FigmentDataEntry[];
  hydrateFigmentCatalog(entries.map(toCatalogRecord));
}
