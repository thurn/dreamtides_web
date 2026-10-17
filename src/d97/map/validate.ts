// The D97 map validator (decision P12): pure rules over a compiled map, each
// a separate function returning structured findings by coordinate. The map
// inspector (`npm run d97:map -- validate`) formats and prints them, and
// exits non-zero on errors. Stand tiles, entries and the main route are
// defined in `./routes`.

import type { DreamAnchorId } from "../../types/identifiers";
import { isWalkable, type CompiledAnchor, type CompiledDreamMap } from "./compiled";
import type { DreamAnchorKind, TilePoint } from "./definition";
import {
  anchorStandTile,
  isReached,
  mainRoute,
  mapEntries,
  reachableCells,
  type MainRoute,
} from "./routes";
import { mapSizeClass, type D97MapSize, type D97MapTuning } from "./tuning";

export type DreamMapFindingSeverity = "error" | "warning";

interface AnchorRef {
  readonly anchorId: DreamAnchorId;
  readonly anchorKind: DreamAnchorKind;
  /** The anchor's stand tile. */
  readonly at: TilePoint;
}

export type DreamMapFinding =
  /** An anchor's stand tile is blocked or off the map. */
  | ({ readonly rule: "anchor-walkable"; readonly severity: "error" } & AnchorRef)
  /** The map has no door or waypoint, so nothing can be reached. */
  | { readonly rule: "no-entries"; readonly severity: "error" }
  /** No entry (other than the anchor itself) reaches an anchor, guardians beaten. */
  | ({ readonly rule: "anchor-reachable"; readonly severity: "error" } & AnchorRef)
  /** An entry reaches a guarded door, or a chest behind a guardian, while the guardian stands. */
  | ({
      readonly rule: "guard-bypassed";
      readonly severity: "error";
      readonly guardianId: DreamAnchorId;
      readonly guardianAt: TilePoint;
    } & AnchorRef)
  /** Two doors stand closer than the minimum spacing. */
  | {
      readonly rule: "door-spacing";
      readonly severity: "error";
      readonly doors: readonly [DreamAnchorId, DreamAnchorId];
      readonly at: TilePoint;
      readonly otherAt: TilePoint;
      readonly distance: number;
      readonly minimum: number;
    }
  /** Fewer than two connected doors, so the map has no main route. */
  | {
      readonly rule: "main-route-missing";
      readonly severity: DreamMapFindingSeverity;
      readonly size: D97MapSize;
    }
  /** A tileset the map draws names an image workspace preparation does not serve. */
  | {
      readonly rule: "tileset-unserved";
      readonly severity: "error";
      readonly tileset: string;
      readonly image: string;
    }
  /** The main route's crossing time strays from the size class target. */
  | {
      readonly rule: "main-route-crossing";
      readonly severity: DreamMapFindingSeverity;
      readonly size: D97MapSize;
      readonly route: MainRoute;
      readonly targetSeconds: number;
      readonly minSeconds: number;
      readonly maxSeconds: number;
    };

function anchorRef(anchor: CompiledAnchor): AnchorRef {
  return { anchorId: anchor.id, anchorKind: anchor.kind, at: anchorStandTile(anchor) };
}

/** Every anchor's stand tile is a walkable cell. */
export function validateAnchorsWalkable(map: CompiledDreamMap): DreamMapFinding[] {
  return map.anchors
    .filter((anchor) => !isWalkable(map, anchorStandTile(anchor)))
    .map((anchor) => ({ rule: "anchor-walkable", severity: "error", ...anchorRef(anchor) }));
}

/**
 * Every anchor is reachable from the entries with every guardian beaten. An
 * entry anchor (a door or a waypoint) must be reachable from another entry,
 * so a door on an island fails even though it reaches itself.
 */
export function validateAnchorsReachable(map: CompiledDreamMap): DreamMapFinding[] {
  const entries = mapEntries(map);
  if (entries.length === 0) return [{ rule: "no-entries", severity: "error" }];
  const fromAll = reachableCells(map, entries.map((entry) => entry.at));
  const findings: DreamMapFinding[] = [];
  for (const anchor of map.anchors) {
    const tile = anchorStandTile(anchor);
    const isEntry = entries.some((entry) => entry.anchorId === anchor.id);
    let reached: boolean;
    if (!isEntry) {
      reached = isReached(fromAll, map, tile);
    } else {
      const others = entries.filter((entry) => entry.anchorId !== anchor.id);
      reached = others.length === 0 || isReached(reachableCells(map, others.map((entry) => entry.at)), map, tile);
    }
    if (!reached) findings.push({ rule: "anchor-reachable", severity: "error", ...anchorRef(anchor) });
  }
  return findings;
}

/**
 * While a guardian stands (its tile blocked), the door it guards is
 * unreachable from the map's other entries (Appendix B §B5), and so is every
 * chest that names it. The guarded door's own entry is behind the guardian,
 * so it is not a start.
 */
export function validateGuardedAnchors(map: CompiledDreamMap): DreamMapFinding[] {
  const entries = mapEntries(map);
  const findings: DreamMapFinding[] = [];
  for (const guardian of map.anchors) {
    if (guardian.kind !== "guardian") continue;
    const guarded = map.anchors.filter(
      (anchor) =>
        (anchor.kind === "door" && anchor.id === guardian.blocksDoor) ||
        (anchor.kind === "chest" && anchor.behindGuardian === guardian.id),
    );
    // Arriving through the guarded door itself puts the player behind the guardian.
    const starts = entries.filter((entry) => entry.anchorId !== guardian.blocksDoor).map((entry) => entry.at);
    const reached = reachableCells(map, starts, [guardian.at]);
    for (const anchor of guarded) {
      if (!isReached(reached, map, anchorStandTile(anchor))) continue;
      findings.push({
        rule: "guard-bypassed",
        severity: "error",
        guardianId: guardian.id,
        guardianAt: guardian.at,
        ...anchorRef(anchor),
      });
    }
  }
  return findings;
}

/** Door anchors stand at least the tuned straight-line distance apart. */
export function validateDoorSpacing(map: CompiledDreamMap, tuning: D97MapTuning): DreamMapFinding[] {
  const doors = map.anchors.filter((anchor) => anchor.kind === "door");
  const minimum = tuning.doorMinSpacingTiles;
  const findings: DreamMapFinding[] = [];
  for (let i = 0; i < doors.length; i += 1) {
    for (let j = i + 1; j < doors.length; j += 1) {
      const a = doors[i].at;
      const b = doors[j].at;
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (distance >= minimum) continue;
      findings.push({
        rule: "door-spacing",
        severity: "error",
        doors: [doors[i].id, doors[j].id],
        at: a,
        otherAt: b,
        distance,
        minimum,
      });
    }
  }
  return findings;
}

/**
 * The main route's crossing time at walking speed lies within the size
 * class's target band, `target × (1 ± tolerance)`. The class's
 * `crossingSeverity` grades a miss: P12 holds medium maps to the target.
 */
export function validateMainRouteCrossing(map: CompiledDreamMap, tuning: D97MapTuning): DreamMapFinding[] {
  const sizeClass = mapSizeClass(tuning, map);
  const severity = sizeClass.crossingSeverity;
  const route = mainRoute(map, tuning.walkingSpeedTilesPerSecond);
  if (route === null) return [{ rule: "main-route-missing", severity, size: sizeClass.size }];
  const targetSeconds = sizeClass.crossingTargetSeconds;
  const minSeconds = targetSeconds * (1 - tuning.crossingTolerance);
  const maxSeconds = targetSeconds * (1 + tuning.crossingTolerance);
  if (route.seconds >= minSeconds && route.seconds <= maxSeconds) return [];
  return [
    {
      rule: "main-route-crossing",
      severity,
      size: sizeClass.size,
      route,
      targetSeconds,
      minSeconds,
      maxSeconds,
    },
  ];
}

/**
 * Every image a compiled tileset names (its sheet, or an image collection's
 * tile images) lies under a served library subtree, so the browser can load
 * it. `served` lists library-relative directory prefixes such as
 * `source-of-tales/tiles` (the art manifest's `directory/served` pairs).
 */
export function validateTilesetsServed(map: CompiledDreamMap, served: readonly string[]): DreamMapFinding[] {
  const prefixes = served.map((prefix) => (prefix.endsWith("/") ? prefix : `${prefix}/`));
  const isServed = (image: string) => prefixes.some((prefix) => image.startsWith(prefix));
  const findings: DreamMapFinding[] = [];
  for (const tileset of map.tilesets) {
    const images = tileset.image === null ? tileset.tileImages.map((tile) => tile.image) : [tileset.image];
    for (const image of new Set(images)) {
      if (!isServed(image)) findings.push({ rule: "tileset-unserved", severity: "error", tileset: tileset.name, image });
    }
  }
  return findings;
}

/**
 * Every validator rule, in a stable order. `served` (the served library
 * subtrees) enables the tileset check.
 */
export function validateDreamMap(
  map: CompiledDreamMap,
  tuning: D97MapTuning,
  served?: readonly string[],
): DreamMapFinding[] {
  return [
    ...validateAnchorsWalkable(map),
    ...validateAnchorsReachable(map),
    ...validateGuardedAnchors(map),
    ...validateDoorSpacing(map, tuning),
    ...validateMainRouteCrossing(map, tuning),
    ...(served === undefined ? [] : validateTilesetsServed(map, served)),
  ];
}
