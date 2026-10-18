// The shape of the D97 map tunables (decisions P13 and P33): walking speed,
// the compact map size classes with their reach maxima, door spacing, the
// town radius, path widths and the detour ratio, and the maps whose layout
// findings are allowlisted. The values live in the catalog
// (`src/content/d97/map-tuning.ts`); the map tools and validators take them
// as input.

import type { DreamMapId } from "../../types/identifiers";

export type D97MapSize = "small" | "medium" | "large";

export interface D97MapSizeClass {
  readonly size: D97MapSize;
  /** The class's nominal side length in tiles ("about 50×50"). */
  readonly nominalSide: number;
  /** The largest map side, in tiles, that still belongs to this class. */
  readonly maxSide: number;
  /**
   * The most seconds the walk from the town door's entry to the farthest
   * anchor may take at walking speed (P13's reach). A maximum, never a target.
   */
  readonly reachMaxSeconds: number;
}

export interface D97MapTuning {
  /** Tiles walked per second. */
  readonly walkingSpeedTilesPerSecond: number;
  /** Size classes ordered by `maxSide`, smallest first. */
  readonly sizeClasses: readonly D97MapSizeClass[];
  /** The least straight-line distance, in tiles, between two door anchors. */
  readonly doorMinSpacingTiles: number;
  /** The town's radius in tiles around the town door's entry (P33). */
  readonly townRadiusTiles: number;
  /** The least path width, in tiles, on every anchor's route from the town. */
  readonly minPathWidthTiles: number;
  /** The least path width, in tiles, on the main routes out of town. */
  readonly mainRouteMinWidthTiles: number;
  /**
   * The most a route from the town may walk, as a multiple of its
   * open-ground distance (see `townLayout` in `./layout`).
   */
  readonly maxDetourRatio: number;
  /**
   * Maps whose layout findings (size, town, path width, detour and reach)
   * are reported as allowlisted warnings instead of errors. A comment beside
   * each entry names the bead that removes it.
   */
  readonly layoutAllowlist: readonly DreamMapId[];
}

/**
 * The size class of a map `width × height` tiles: the first class whose
 * `maxSide` holds the map's longer side, else the largest class.
 */
export function mapSizeClass(
  tuning: D97MapTuning,
  { width, height }: { readonly width: number; readonly height: number },
): D97MapSizeClass {
  const side = Math.max(width, height);
  const fitting = tuning.sizeClasses.find((entry) => side <= entry.maxSide);
  const largest = tuning.sizeClasses[tuning.sizeClasses.length - 1] as D97MapSizeClass | undefined;
  if (fitting !== undefined) return fitting;
  if (largest === undefined) throw new Error("the map tuning has no size classes");
  return largest;
}
