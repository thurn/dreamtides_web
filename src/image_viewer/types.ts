import type { CardName, CardSubtype } from "../types/card-identity";

declare const imageCategoryBrand: unique symbol;
declare const imageFileNameBrand: unique symbol;
declare const imageNumberBrand: unique symbol;

export type ImageCategory = string & {
  readonly [imageCategoryBrand]: "ImageCategory";
};
export type ImageFileName = string & {
  readonly [imageFileNameBrand]: "ImageFileName";
};
export type ImageNumber = string & {
  readonly [imageNumberBrand]: "ImageNumber";
};

function parsePathSegment(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    throw new Error(`${label} must be one non-empty path segment.`);
  }
  return value;
}

export function parseImageCategory(value: unknown): ImageCategory {
  return parsePathSegment(value, "Image category") as ImageCategory;
}

export function parseImageFileName(value: unknown): ImageFileName {
  return parsePathSegment(value, "Image filename") as ImageFileName;
}

export function parseImageNumber(value: unknown): ImageNumber {
  if (typeof value !== "string" || !/^\d+$/u.test(value)) {
    throw new Error("Image number must contain decimal digits only.");
  }
  return value as ImageNumber;
}

/** One candidate image as described by the `/api/images/manifest` endpoint. */
export interface ImageManifestEntry {
  /** Subdirectory of the tagged root the file lives in (its pool). */
  category: ImageCategory;
  /** Filename within the category directory. */
  filename: ImageFileName;
  /** Trailing Shutterstock image number parsed from the filename. */
  imageNumber: ImageNumber;
  /** True when a non-`Art Rework` card already claims this image number. */
  used: boolean;
  /** True when the curator has favorited this image in tracked editor state. */
  favorite: boolean;
  /** True when a curator has hand-marked this image as used from the viewer. */
  manuallyUsed: boolean;
  /** Authored card name from the metadata JSON, when present. */
  cardName: CardName | null;
  /** One-sentence narrative from the metadata JSON, when present. */
  narrative: string | null;
  /** Character subtype from the metadata JSON, when present. */
  subtype: CardSubtype | null;
  /**
   * Every distinct name this image number has been published under in the
   * card-data TOMLs, in first-seen order. Empty when the image has never been
   * attached to a card.
   */
  cardNames: CardName[];
}

/** The full manifest payload returned by the image-viewer API. */
export interface ImageManifest {
  /** Every category subdirectory, alphabetically. */
  categories: ImageCategory[];
  /** The subset of categories that compose the combined "Generic" pool. */
  genericSubdirs: ImageCategory[];
  /** Every candidate image across all categories. */
  images: ImageManifestEntry[];
}

/** Number of images tiled per row; the viewer's "size" control. */
export const COLUMN_OPTIONS = [2, 3, 4, 6, 8] as const;
export type ColumnCount = (typeof COLUMN_OPTIONS)[number];

/** Default tiling: four images per row on the developer's display. */
export const DEFAULT_COLUMNS: ColumnCount = 4;

/**
 * Synthetic category selections. `all` shows every category; `generic` shows
 * the union of the generic character subdirectories. Any other value is a
 * literal subdirectory name.
 */
export const ALL_CATEGORY = "all";
export const GENERIC_CATEGORY = "generic";
export type ImageViewerCategory =
  | typeof ALL_CATEGORY
  | typeof GENERIC_CATEGORY
  | ImageCategory;

export function parseImageViewerCategory(value: unknown): ImageViewerCategory {
  if (value === ALL_CATEGORY || value === GENERIC_CATEGORY) return value;
  return parseImageCategory(value);
}

/** URL-reflected display state for the image viewer. */
export interface ImageViewerDisplayState {
  /** `all`, `generic`, or a literal category subdirectory name. */
  category: ImageViewerCategory;
  /** When true, images already used by a finished card are shown too. */
  showUsed: boolean;
  /**
   * When true, only images that have been published under at least one card
   * name (the orange `cardNames` overlay) are shown.
   */
  onlyNamed: boolean;
  /** When true, the visible images are shuffled instead of shown alphabetically. */
  randomOrder: boolean;
  /** Images tiled per row. */
  columns: ColumnCount;
}
