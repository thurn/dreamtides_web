// The shape of the D97 map tunables (decision P13): walking speed, the map
// size classes with their main-route crossing targets, and door spacing. The
// values live in the catalog (`src/content/d97/map-tuning.ts`); the map tools
// and validators take them as input.

export type D97MapSize = "small" | "medium" | "large";

export interface D97MapSizeClass {
  readonly size: D97MapSize;
  /** The class's nominal side length in tiles ("about 110×110"). */
  readonly nominalSide: number;
  /** The largest map side, in tiles, that still belongs to this class. */
  readonly maxSide: number;
  /** The main-route crossing time this class aims for, in seconds. */
  readonly crossingTargetSeconds: number;
  /** How a main route outside the target band is reported. */
  readonly crossingSeverity: "error" | "warning";
}

export interface D97MapTuning {
  /** Tiles walked per second. */
  readonly walkingSpeedTilesPerSecond: number;
  /** Size classes ordered by `maxSide`, smallest first. */
  readonly sizeClasses: readonly D97MapSizeClass[];
  /**
   * The fraction a main route's crossing time may stray from its class
   * target before the validator reports it.
   */
  readonly crossingTolerance: number;
  /** The least straight-line distance, in tiles, between two door anchors. */
  readonly doorMinSpacingTiles: number;
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
