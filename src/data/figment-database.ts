import {
  hydrateFigmentCatalog,
  type FigmentCatalogRecord,
} from "../battle/state/figment-catalog";
import type { ArtCrop } from "../types/cards";
import { parseCardId, parseCardSubtype } from "../types/card-identity";
import { figmentsDocument } from "../content/documents";

/** The shape of a figment entry in the `src/content/figments/` modules. */
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
 * Hydrates the figment catalog so the battle UI sources each figment type's
 * name, character type, spark, rules text, and art from the content modules.
 */
export function loadFigmentDatabase(): void {
  const entries: readonly FigmentDataEntry[] = figmentsDocument();
  hydrateFigmentCatalog(entries.map(toCatalogRecord));
}
