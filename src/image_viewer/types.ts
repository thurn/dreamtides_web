/** One candidate image as described by the `/api/images/manifest` endpoint. */
export interface ImageManifestEntry {
  /** Subdirectory of the tagged root the file lives in (its pool). */
  category: string;
  /** Filename within the category directory. */
  filename: string;
  /** Trailing Shutterstock image number parsed from the filename. */
  imageNumber: string;
  /** True when a non-`Art Rework` card already claims this image number. */
  used: boolean;
  /** True when a curator has hand-marked this image as used from the viewer. */
  manuallyUsed: boolean;
  /** Authored card name from the metadata JSON, when present. */
  cardName: string | null;
  /** One-sentence narrative from the metadata JSON, when present. */
  narrative: string | null;
  /** Character subtype from the metadata JSON, when present. */
  subtype: string | null;
  /**
   * Every distinct name this image number has been published under in the
   * card-data TOMLs, in first-seen order. Empty when the image has never been
   * attached to a card.
   */
  cardNames: string[];
}

/** The full manifest payload returned by the image-viewer API. */
export interface ImageManifest {
  /** Every category subdirectory, alphabetically. */
  categories: string[];
  /** The subset of categories that compose the combined "Generic" pool. */
  genericSubdirs: string[];
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

/** URL-reflected display state for the image viewer. */
export interface ImageViewerDisplayState {
  /** `all`, `generic`, or a literal category subdirectory name. */
  category: string;
  /** When true, images already used by a finished card are shown too. */
  showUsed: boolean;
  /** Images tiled per row. */
  columns: ColumnCount;
}
