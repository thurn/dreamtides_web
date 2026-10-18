// The D97 map validator (decision P12): pure rules over a compiled map, each
// a separate function returning structured findings by coordinate. The map
// inspector (`npm run d97:map -- validate`) formats and prints them, and
// exits non-zero on errors. Stand tiles and entries are defined in
// `./routes`; the town, path widths, routes from the town, reach and detour
// in `./layout`.
//
// The **layout rules** (decisions P13 and P33) are the size, town, path
// width, detour and reach rules. The town, width, detour and reach rules run
// on a dream's map, whose dream module names its town; a room (P19) or an
// example map no dream plays has no town. Layout findings are errors.

import type { DreamAnchorId } from "../../types/identifiers";
import { isWalkable, type CompiledAnchor, type CompiledDreamMap } from "./compiled";
import type { DreamAnchorKind, DreamMapNarrowCrossing, TilePoint } from "./definition";
import { anchorsOnlyThroughCrossing, townDoor, townLayout, type DreamMapTown, type TownLayout } from "./layout";
import { anchorStandTile, isReached, isRoomMap, mapEntries, reachableCells } from "./routes";
import { mapSizeClass, type D97MapSize, type D97MapTuning } from "./tuning";

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
  /** A tileset the map draws names an image workspace preparation does not serve. */
  | {
      readonly rule: "tileset-unserved";
      readonly severity: "error";
      readonly tileset: string;
      readonly image: string;
    }
  | LayoutFinding;

/** A finding of the layout rules. */
interface LayoutBase {
  readonly severity: "error";
}

type LayoutFinding =
  /** The map's longer side exceeds the largest size class's. */
  | ({ readonly rule: "map-oversize"; readonly side: number; readonly maxSide: number } & LayoutBase)
  /** The map's dream names no town. */
  | ({ readonly rule: "town-missing" } & LayoutBase)
  /** The dream's town door is not a door anchor on the map. */
  | ({ readonly rule: "town-door-unknown"; readonly doorAnchorId: DreamAnchorId } & LayoutBase)
  /** An anchor that belongs in town stands beyond the town radius. */
  | ({ readonly rule: "town-outside"; readonly distance: number; readonly radius: number } & AnchorRef & LayoutBase)
  /** A challenger, guardian, chest, quest object or the exit door stands inside the town radius. */
  | ({ readonly rule: "town-intrusion"; readonly distance: number; readonly radius: number } & AnchorRef & LayoutBase)
  /** An anchor's route from the town crosses cells narrower than its required width. */
  | ({
      readonly rule: "path-narrow";
      readonly requiredWidth: number;
      /** Whether the route is a main route out of town. */
      readonly main: boolean;
      /** The narrow cells, in walking order. */
      readonly cells: readonly TilePoint[];
    } & AnchorRef &
      LayoutBase)
  /** Blocking a narrow crossing leaves anchors without a wide route from the town. */
  | ({
      readonly rule: "crossing-only-route";
      readonly crossing: string;
      readonly cells: readonly TilePoint[];
      readonly anchors: readonly AnchorRef[];
    } & LayoutBase)
  /** An anchor's walk from the town exceeds the detour ratio. */
  | ({
      readonly rule: "detour";
      readonly tiles: number;
      readonly directTiles: number;
      readonly ratio: number;
      readonly maxRatio: number;
    } & AnchorRef &
      LayoutBase)
  /** The farthest anchor's walk from the town exceeds the size class's reach maximum. */
  | ({
      readonly rule: "reach";
      readonly size: D97MapSize;
      readonly tiles: number;
      readonly seconds: number;
      readonly maxSeconds: number;
    } & AnchorRef &
      LayoutBase);

const LAYOUT = { severity: "error" } as const;

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
 * so a door on an island fails even though it reaches itself. On a dream's
 * map a building door is no entry, so the door into each room must be
 * reached from the map's doors and waypoint; in a room (P19) the entries are
 * its building doors, so every anchor inside must be reached from its door.
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
 * A map's longer side is at most the largest size class's `maxSide` (P13).
 * A room is no dream map and has no size class.
 */
export function validateMapSize(map: CompiledDreamMap, tuning: D97MapTuning): DreamMapFinding[] {
  if (isRoomMap(map)) return [];
  const side = Math.max(map.width, map.height);
  const maxSide = Math.max(...tuning.sizeClasses.map((entry) => entry.maxSide));
  return side > maxSide ? [{ rule: "map-oversize", ...LAYOUT, side, maxSide }] : [];
}

/** The town rules' layout, or the finding that stops them. */
function layoutOrFinding(
  map: CompiledDreamMap,
  tuning: D97MapTuning,
  town: DreamMapTown | null,
  crossings: readonly DreamMapNarrowCrossing[],
): TownLayout | DreamMapFinding {
  if (town === null) return { rule: "town-missing", ...LAYOUT };
  return townLayout(map, tuning, town, crossings) ?? { rule: "town-door-unknown", ...LAYOUT, doorAnchorId: town.doorAnchorId };
}

const HOSTILE_KINDS: ReadonlySet<DreamAnchorKind> = new Set(["challenger", "guardian", "chest", "object"]);

/**
 * The town (P33): within the town radius of the town door's entry stand the
 * waypoint, every anchor of the town cluster and the dream's town anchors
 * (the shop and quest givers, or the building doors to their rooms); outside
 * it stand every challenger, guardian, chest and quest object, and the exit
 * door. Distances are straight lines between stand tiles. `town` null is a
 * dream that names no town.
 */
export function validateTown(map: CompiledDreamMap, tuning: D97MapTuning, town: DreamMapTown | null): DreamMapFinding[] {
  const layout = layoutOrFinding(map, tuning, town, []);
  if (!("routes" in layout)) return [layout];
  const radius = tuning.townRadiusTiles;
  const required = new Set(town?.townAnchorIds ?? []);
  const findings: DreamMapFinding[] = [];
  for (const route of layout.routes) {
    const { anchor, distance } = route;
    const belongsInTown =
      anchor.kind === "waypoint" || (anchor.cluster !== undefined && anchor.cluster === town?.cluster) || required.has(anchor.id);
    const staysOut = HOSTILE_KINDS.has(anchor.kind) || anchor.id === town?.exitDoorAnchorId;
    if (belongsInTown && distance > radius) {
      findings.push({ rule: "town-outside", ...LAYOUT, ...anchorRef(anchor), distance, radius });
    } else if (staysOut && distance <= radius) {
      findings.push({ rule: "town-intrusion", ...LAYOUT, ...anchorRef(anchor), distance, radius });
    }
  }
  return findings;
}

/**
 * Path widths (P33): every anchor's route from the town crosses no cell
 * narrower than `minPathWidthTiles`, and every main route out of town none
 * narrower than `mainRouteMinWidthTiles` (widths and routes as `./layout`
 * defines them). A narrow crossing's cells are exempt, but it is never the
 * only route: blocking it must leave every anchor it serves a wide route.
 */
export function validatePathWidths(
  map: CompiledDreamMap,
  tuning: D97MapTuning,
  town: DreamMapTown | null,
  crossings: readonly DreamMapNarrowCrossing[] = [],
): DreamMapFinding[] {
  const layout = layoutOrFinding(map, tuning, town, crossings);
  if (!("routes" in layout)) return [layout];
  const findings: DreamMapFinding[] = [];
  for (const route of layout.routes) {
    if (route.narrowCells.length === 0) continue;
    findings.push({
      rule: "path-narrow",
      ...LAYOUT,
      ...anchorRef(route.anchor),
      requiredWidth: route.requiredWidth,
      main: route.main,
      cells: route.narrowCells,
    });
  }
  for (const crossing of crossings) {
    const stranded = anchorsOnlyThroughCrossing(map, layout, crossings, crossing);
    if (stranded.length === 0) continue;
    findings.push({
      rule: "crossing-only-route",
      ...LAYOUT,
      crossing: crossing.name,
      cells: crossing.cells,
      anchors: stranded.map(anchorRef),
    });
  }
  return findings;
}

/**
 * The detour ratio (P33): no anchor's shortest walk from the town is longer
 * than `maxDetourRatio` times its open-ground distance (`./layout`).
 */
export function validateDetours(map: CompiledDreamMap, tuning: D97MapTuning, town: DreamMapTown | null): DreamMapFinding[] {
  const layout = layoutOrFinding(map, tuning, town, []);
  if (!("routes" in layout)) return [layout];
  const maxRatio = tuning.maxDetourRatio;
  return layout.routes.flatMap((route): DreamMapFinding[] =>
    route.tiles === null || route.detourRatio === null || route.detourRatio <= maxRatio
      ? []
      : [
          {
            rule: "detour",
            ...LAYOUT,
            ...anchorRef(route.anchor),
            tiles: route.tiles,
            directTiles: route.directTiles,
            ratio: route.detourRatio,
            maxRatio,
          },
        ],
  );
}

/**
 * Reach (P13): the walk from the town door's entry to the farthest anchor,
 * at walking speed with guardians beaten, takes at most the size class's
 * `reachMaxSeconds`. Unreached anchors are the reachability rule's.
 */
export function validateReach(map: CompiledDreamMap, tuning: D97MapTuning, town: DreamMapTown | null): DreamMapFinding[] {
  const layout = layoutOrFinding(map, tuning, town, []);
  if (!("routes" in layout)) return [layout];
  const sizeClass = mapSizeClass(tuning, map);
  let farthest: TownLayout["routes"][number] | null = null;
  for (const route of layout.routes) {
    if (route.tiles !== null && (farthest === null || route.tiles > (farthest.tiles ?? 0))) farthest = route;
  }
  if (farthest === null || farthest.tiles === null || farthest.seconds === null) return [];
  if (farthest.seconds <= sizeClass.reachMaxSeconds) return [];
  return [
    {
      rule: "reach",
      ...LAYOUT,
      ...anchorRef(farthest.anchor),
      size: sizeClass.size,
      tiles: farthest.tiles,
      seconds: farthest.seconds,
      maxSeconds: sizeClass.reachMaxSeconds,
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

/** What the validator knows about a map beyond its compiled form. */
export interface DreamMapValidationContext {
  /** The served library subtrees; enables the tileset rule. */
  readonly served?: readonly string[];
  /**
   * The map's town from its dream module, or null for a dream's map whose
   * dream names none. Omitted for a map no dream plays (a room, an example
   * map), which skips the town, width, detour and reach rules.
   */
  readonly town?: DreamMapTown | null;
  /** The map definition's narrow crossings. */
  readonly narrowCrossings?: readonly DreamMapNarrowCrossing[];
}

/** Every validator rule, in a stable order. */
export function validateDreamMap(
  map: CompiledDreamMap,
  tuning: D97MapTuning,
  context: DreamMapValidationContext = {},
): DreamMapFinding[] {
  const { served, town, narrowCrossings = [] } = context;
  return [
    ...validateAnchorsWalkable(map),
    ...validateAnchorsReachable(map),
    ...validateGuardedAnchors(map),
    ...validateDoorSpacing(map, tuning),
    ...validateMapSize(map, tuning),
    ...(town === undefined
      ? []
      : town === null || townDoor(map, town) === null
        ? // The rule that stops the town rules, reported once.
          validateTown(map, tuning, town)
        : [
            ...validateTown(map, tuning, town),
            ...validatePathWidths(map, tuning, town, narrowCrossings),
            ...validateDetours(map, tuning, town),
            ...validateReach(map, tuning, town),
          ]),
    ...(served === undefined ? [] : validateTilesetsServed(map, served)),
  ];
}
