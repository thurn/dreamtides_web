// Plain-text reports of the D97 map inspector: `inspect` summaries and
// `validate` findings, written to be read by a model as well as a person.
// Coordinates print as `x,y` tiles; rectangles as `x0,y0–x1,y1`. `inspect`
// also lists the recipe's stamp placements and terrain edits, the tilesets
// the compiled map draws (with whether each image is served) and the unused
// tilesets the compiler dropped, and the town: each anchor's route from it
// (distance, reach time, detour and width) and the narrow passages by
// coordinate.

import type { CompiledDreamMap, CompiledTileset } from "../../src/d97/map/compiled.ts";
import type { TilePoint, TileRect } from "../../src/d97/map/definition.ts";
import { recipePlacements } from "../../src/d97/map/recipe-summary.ts";
import { compiledTilesetForGid, type D97CatalogStamp } from "../../src/d97/map/stamps.ts";
import { gidWithoutFlags } from "../../src/d97/map/tiled.ts";
import type { D97StampId, D97TerrainId } from "../../src/types/identifiers.ts";
import { ANCHOR_LETTERS } from "../../src/d97/map/preview.ts";
import { narrowCells, townLayout, widthExemptCells, type DreamMapTown } from "../../src/d97/map/layout.ts";
import {
  anchorStandTile,
  mapEntries,
  reachableCells,
  regionCenterTile,
  regionSummary,
  walkableComponentSizes,
  walkingRoute,
} from "../../src/d97/map/routes.ts";
import { mapSizeClass, type D97MapTuning } from "../../src/d97/map/tuning.ts";
import { validateAnchorsReachable, type DreamMapFinding } from "../../src/d97/map/validate.ts";
import type { LoadedMap } from "./map-load.ts";

const at = (tile: TilePoint) => `${String(tile[0])},${String(tile[1])}`;
const seconds = (value: number) => `${value.toFixed(1)} s`;
const percent = (part: number, whole: number) => (whole === 0 ? "-" : `${String(Math.round((part / whole) * 100))}%`);

function table(rows: readonly (readonly string[])[]): string[] {
  const widths = rows.reduce<number[]>(
    (acc, row) => row.map((cell, index) => Math.max(acc[index] ?? 0, cell.length)),
    [],
  );
  return rows.map((row) => `  ${row.map((cell, index) => cell.padEnd(widths[index])).join("  ")}`.trimEnd());
}

/** The catalogs and serving rules the `inspect` report names things by. */
export interface InspectContext {
  readonly stamps: ReadonlyMap<D97StampId, D97CatalogStamp>;
  readonly terrains: ReadonlyMap<D97TerrainId, { readonly name: string; readonly layer: string }>;
  /** Library-relative subtrees workspace preparation serves. */
  readonly served: readonly string[];
  /** The map's town (`catalogMapTown`): null when its dream names none, undefined when no dream plays it. */
  readonly town?: DreamMapTown | null;
}

/** Drawn cells per compiled tileset (tile layers and tile objects). */
function tilesetUse(map: CompiledDreamMap): Map<CompiledTileset, number> {
  const use = new Map<CompiledTileset, number>(map.tilesets.map((tileset) => [tileset, 0]));
  const count = (gid: number) => {
    const id = gidWithoutFlags(gid);
    if (id === 0) return;
    const owner = compiledTilesetForGid(map.tilesets, id);
    if (owner !== null) use.set(owner, (use.get(owner) ?? 0) + 1);
  };
  for (const layer of map.layers) for (const gid of layer.gids) count(gid);
  for (const object of map.objects) count(object.gid);
  return use;
}

function recipeLines(loaded: LoadedMap, context: InspectContext): string[] {
  const placements = recipePlacements(loaded.definition, context.stamps);
  const rect = (r: TileRect | null) => (r === null ? "whole map" : `${at(r.from)}–${at(r.to)}`);
  const lines: string[] = [];
  const stamps = placements.filter((entry) => entry.kind === "stamp");
  lines.push(`Stamp placements (${String(stamps.length)})`);
  if (stamps.length === 0) lines.push("  none");
  else {
    const rows = [["#", "op", "stamp", "theme", "footprint", "points"]];
    stamps.forEach((entry, number) => {
      const stamp = context.stamps.get(entry.stamp);
      rows.push([
        String(number + 1),
        String(entry.index),
        stamp === undefined ? `unknown ${entry.stamp}` : `${stamp.name} ${entry.stamp}`,
        stamp?.theme ?? "-",
        rect(entry.rect),
        entry.points.map((point) => `${point.name}@${at(point.at)}`).join(" ") || "-",
      ]);
    });
    lines.push(...table(rows));
  }
  lines.push("");
  const terrains = placements.filter((entry) => entry.kind === "terrain" || entry.kind === "reseason");
  lines.push(`Terrain and season edits (${String(terrains.length)})`);
  if (terrains.length === 0) lines.push("  none");
  else {
    const rows = [["op", "edit", "terrain", "layer", "area", "cells"]];
    for (const entry of terrains) {
      if (entry.kind === "reseason") {
        rows.push([String(entry.index), `reseason ${entry.season}`, "-", "-", rect(entry.rect), "-"]);
        continue;
      }
      if (entry.kind !== "terrain") continue;
      const terrain = context.terrains.get(entry.terrain);
      rows.push([
        String(entry.index),
        entry.erase ? "brush erase" : "brush",
        terrain === undefined ? `unknown ${entry.terrain}` : terrain.name,
        entry.layer ?? terrain?.layer ?? "-",
        rect(entry.rect),
        String(entry.cells),
      ]);
    }
    lines.push(...table(rows));
  }
  lines.push("");
  const prefixes = context.served.map((prefix) => `${prefix}/`);
  const use = tilesetUse(loaded.map);
  lines.push(`Tilesets drawn (${String(loaded.map.tilesets.length)})`);
  const rows = [["firstGid", "name", "image", "served", "cells"]];
  for (const tileset of loaded.map.tilesets) {
    const images = tileset.image === null ? tileset.tileImages.map((tile) => tile.image) : [tileset.image];
    const served = images.every((image) => prefixes.some((prefix) => image.startsWith(prefix)));
    rows.push([
      String(tileset.firstGid),
      tileset.name,
      tileset.image ?? `${String(images.length)} tile images`,
      served ? "yes" : "NO",
      String(use.get(tileset) ?? 0),
    ]);
  }
  lines.push(...(rows.length === 1 ? ["  none"] : table(rows)));
  lines.push(
    `Unused tilesets dropped (${String(loaded.droppedTilesets.length)}): ` +
      (loaded.droppedTilesets.map((tileset) => `${tileset.name} (${tileset.image ?? "image collection"})`).join(", ") || "none"),
  );
  lines.push("");
  return lines;
}

/** The town section of `inspect`: routes from the town, reach and narrow passages. */
function townLines(loaded: LoadedMap, tuning: D97MapTuning, town: DreamMapTown | null | undefined): string[] {
  const map = loaded.map;
  const crossings = loaded.definition.narrowCrossings ?? [];
  const lines: string[] = [];
  const narrowMask = narrowCells(map, tuning.minPathWidthTiles, widthExemptCells(map, crossings));
  const narrowCount = narrowMask.reduce((sum, cell) => sum + cell, 0);
  lines.push(
    `Walkable cells narrower than ${String(tuning.minPathWidthTiles)} tiles: ${String(narrowCount)} ` +
      "(orange in previews; narrow crossings and guardian tiles exempt)",
  );
  lines.push(
    `Narrow crossings (${String(crossings.length)}): ` +
      (crossings.map((crossing) => `${crossing.name} ${crossing.cells.map(at).join(" ")}`).join("; ") || "none"),
  );
  if (town === undefined) {
    lines.push("Town: none (no dream plays this map); reach and route widths are not measured", "");
    return lines;
  }
  if (town === null) {
    lines.push("Town: the map's dream names none; reach and route widths are not measured", "");
    return lines;
  }
  const layout = townLayout(map, tuning, town, crossings);
  if (layout === null) {
    lines.push(`Town: door ${town.doorAnchorId} is not a door on this map`, "");
    return lines;
  }
  const sizeClass = mapSizeClass(tuning, map);
  lines.push(
    `Town: door ${layout.door.id} entry ${at(layout.entry)}, cluster ${town.cluster}, radius ${String(tuning.townRadiusTiles)} tiles`,
  );
  lines.push("");
  lines.push(
    `Routes from the town (guardians beaten; width ${String(tuning.minPathWidthTiles)}, ` +
      `main routes out of town ${String(tuning.mainRouteMinWidthTiles)}; detour at most ${String(tuning.maxDetourRatio)})`,
  );
  const rows = [["letter", "kind", "id", "stand", "distance", "town", "tiles", "time", "detour", "width", "narrow cells"]];
  for (const route of layout.routes) {
    rows.push([
      ANCHOR_LETTERS[route.anchor.kind],
      route.main ? "door (main)" : route.anchor.kind,
      route.anchor.id,
      at(route.stand),
      route.distance.toFixed(1),
      route.distance <= tuning.townRadiusTiles ? "in" : "out",
      route.tiles === null ? "-" : String(route.tiles),
      route.seconds === null ? "unreachable" : seconds(route.seconds),
      route.detourRatio === null ? "-" : route.detourRatio.toFixed(2),
      String(route.requiredWidth),
      String(route.narrowCells.length),
    ]);
  }
  lines.push(...(rows.length === 1 ? ["  none"] : table(rows)));
  const reached = layout.routes.filter((route) => route.tiles !== null);
  const farthest = reached.reduce<(typeof reached)[number] | null>(
    (best, route) => (best === null || (route.tiles ?? 0) > (best.tiles ?? 0) ? route : best),
    null,
  );
  lines.push(
    farthest === null || farthest.seconds === null
      ? "Reach: no anchor reached from the town"
      : `Reach: ${seconds(farthest.seconds)} to ${farthest.anchor.kind} ${farthest.anchor.id} at ${at(farthest.stand)} ` +
          `(${String(farthest.tiles)} tiles; the ${sizeClass.size} class allows ${seconds(sizeClass.reachMaxSeconds)})`,
  );
  lines.push("");
  const narrowRoutes = layout.routes.filter((route) => route.narrowCells.length > 0);
  lines.push(`Narrow passages on routes from the town (${String(narrowRoutes.length)} routes; red crosses in previews)`);
  if (narrowRoutes.length === 0) lines.push("  none");
  for (const route of narrowRoutes) {
    lines.push(
      `  ${route.anchor.kind} ${route.anchor.id} (needs ${String(route.requiredWidth)} wide): ${route.narrowCells.map(at).join(" ")}`,
    );
  }
  lines.push("");
  return lines;
}

/** The `inspect` report of a compiled map. */
export function inspectReport(loaded: LoadedMap, tuning: D97MapTuning, context: InspectContext): string {
  const map: CompiledDreamMap = loaded.map;
  const speed = tuning.walkingSpeedTilesPerSecond;
  const sizeClass = mapSizeClass(tuning, map);
  const entries = mapEntries(map);
  const reached = reachableCells(map, entries.map((entry) => entry.at));
  let walkable = 0;
  let reachable = 0;
  for (let cell = 0; cell < map.walkable.length; cell += 1) {
    if (map.walkable[cell] !== "1") continue;
    walkable += 1;
    if (reached[cell] === 1) reachable += 1;
  }
  const components = walkableComponentSizes(map);
  const source = loaded.definition.source;
  const lines: string[] = [
    `Map ${map.id} (${loaded.argument})`,
    source.kind === "tiled" ? `Source ${source.path} sha256 ${source.sha256}` : "Source blank canvas",
    `Size ${String(map.width)}×${String(map.height)} tiles of ${String(map.tileWidth)}×${String(map.tileHeight)} px: ` +
      `${sizeClass.size} class (about ${String(sizeClass.nominalSide)}×${String(sizeClass.nominalSide)}, ` +
      `largest side ${String(sizeClass.maxSide)}, reach at most ${seconds(sizeClass.reachMaxSeconds)})`,
    `Walking speed ${String(speed)} tiles/s`,
    `Layers ${String(map.layers.length)} (${String(map.layers.filter((layer) => layer.above).length)} above the player), ` +
      `tile objects ${String(map.objects.length)}, tilesets ${String(map.tilesets.length)}`,
    `Entries ${String(entries.length)}: ${entries.map((entry) => `${entry.kind} ${at(entry.at)}`).join(", ") || "none"}`,
    `Walkable ${String(walkable)}/${String(map.walkable.length)} cells (${percent(walkable, map.walkable.length)}); ` +
      `reachable from entries ${String(reachable)}/${String(walkable)}`,
    `Walkable areas ${String(components.length)}: largest ${components.slice(0, 5).map(String).join(", ") || "none"}`,
    "",
  ];

  lines.push(...recipeLines(loaded, context));

  lines.push(`Regions (${String(map.regions.length)})`);
  if (map.regions.length === 0) lines.push("  none");
  else {
    const rows = [["#", "name", "rect", "walkable/cells", "reachable/walkable", "center"]];
    map.regions.forEach((region, index) => {
      const summary = regionSummary(map, region, reached);
      const center = regionCenterTile(map, region, reached);
      rows.push([
        String(index + 1),
        region.name,
        `${at(region.from)}–${at(region.to)}`,
        `${String(summary.walkable)}/${String(summary.cells)} (${percent(summary.walkable, summary.cells)})`,
        `${String(summary.reachable)}/${String(summary.walkable)}`,
        center === null ? "-" : at(center),
      ]);
    });
    lines.push(...table(rows));
  }
  lines.push("");

  lines.push(`Landmarks (${String(map.landmarks.length)})`);
  lines.push(...(map.landmarks.length === 0 ? ["  none"] : table(map.landmarks.map((landmark) => [landmark.name, at(landmark.at)]))));
  lines.push("");

  lines.push(`Anchors (${String(map.anchors.length)})`);
  if (map.anchors.length === 0) lines.push("  none");
  else {
    const unreachable = new Set(
      validateAnchorsReachable(map).flatMap((finding) => (finding.rule === "anchor-reachable" ? [finding.anchorId] : [])),
    );
    const rows = [["letter", "kind", "id", "at", "stand", "walkable", "reachable", "detail"]];
    for (const anchor of map.anchors) {
      const stand = anchorStandTile(anchor);
      const detail = [
        anchor.blocksDoor === undefined ? "" : `blocks door ${anchor.blocksDoor}`,
        anchor.behindGuardian === undefined ? "" : `behind guardian ${anchor.behindGuardian}`,
        anchor.cluster === undefined ? "" : `cluster ${anchor.cluster}`,
      ]
        .filter((part) => part !== "")
        .join("; ");
      rows.push([
        ANCHOR_LETTERS[anchor.kind],
        anchor.kind,
        anchor.id,
        at(anchor.at),
        at(stand),
        map.walkable[stand[1] * map.width + stand[0]] === "1" ? "yes" : "NO",
        entries.length > 0 && !unreachable.has(anchor.id) ? "yes" : "NO",
        detail,
      ]);
    }
    lines.push(...table(rows));
  }
  lines.push("");

  lines.push(...townLines(loaded, tuning, context.town));

  lines.push("Crossing times between regions (center to center, guardians beaten)");
  const centers = map.regions.map((region) => regionCenterTile(map, region, reached));
  const rows = [["from", "to", "tiles", "time"]];
  for (let i = 0; i < map.regions.length; i += 1) {
    for (let j = i + 1; j < map.regions.length; j += 1) {
      const a = centers[i];
      const b = centers[j];
      const walk = a === null || b === null ? null : walkingRoute(map, a, b, speed);
      rows.push([
        `${String(i + 1)} ${map.regions[i].name}`,
        `${String(j + 1)} ${map.regions[j].name}`,
        walk === null ? "-" : String(walk.tiles),
        walk === null ? "unreachable" : seconds(walk.seconds),
      ]);
    }
  }
  lines.push(...(rows.length === 1 ? ["  fewer than two regions"] : table(rows)));
  return `${lines.join("\n")}\n`;
}

/** One validator finding as a line. */
export function formatFinding(finding: DreamMapFinding): string {
  const head = `${finding.severity} ${finding.rule}`;
  const cells = (tiles: readonly TilePoint[]) => tiles.map(at).join(" ");
  switch (finding.rule) {
    case "anchor-walkable":
      return `${head} at ${at(finding.at)}: ${finding.anchorKind} ${finding.anchorId} stands on a blocked cell`;
    case "anchor-reachable":
      return `${head} at ${at(finding.at)}: no entry reaches ${finding.anchorKind} ${finding.anchorId}`;
    case "no-entries":
      return `${head}: the map has no door or waypoint to arrive at`;
    case "guard-bypassed":
      return (
        `${head} at ${at(finding.at)}: ${finding.anchorKind} ${finding.anchorId} is reachable while ` +
        `guardian ${finding.guardianId} stands at ${at(finding.guardianAt)}`
      );
    case "door-spacing":
      return (
        `${head} at ${at(finding.at)}: doors ${finding.doors[0]} and ${finding.doors[1]} (${at(finding.otherAt)}) ` +
        `are ${finding.distance.toFixed(1)} tiles apart, under ${String(finding.minimum)}`
      );
    case "tileset-unserved":
      return `${head}: tileset ${finding.tileset} draws ${finding.image}, which workspace preparation does not serve`;
    case "map-oversize":
      return `${head}: the map's longer side is ${String(finding.side)} tiles, over the largest class's ${String(finding.maxSide)}`;
    case "town-missing":
      return `${head}: the map's dream names no town door and cluster`;
    case "town-door-unknown":
      return `${head}: town door ${finding.doorAnchorId} is not a door on this map`;
    case "town-outside":
      return (
        `${head} at ${at(finding.at)}: ${finding.anchorKind} ${finding.anchorId} belongs in town but stands ` +
        `${finding.distance.toFixed(1)} tiles from the town door's entry, beyond ${String(finding.radius)}`
      );
    case "town-intrusion":
      return (
        `${head} at ${at(finding.at)}: ${finding.anchorKind} ${finding.anchorId} stands ` +
        `${finding.distance.toFixed(1)} tiles from the town door's entry, inside the ${String(finding.radius)}-tile town`
      );
    case "path-narrow":
      return (
        `${head} at ${at(finding.at)}: the ${finding.main ? "main route out of town" : "route from the town"} to ` +
        `${finding.anchorKind} ${finding.anchorId} needs ${String(finding.requiredWidth)} wide but crosses narrow cells ` +
        cells(finding.cells)
      );
    case "crossing-only-route":
      return (
        `${head} at ${cells(finding.cells)}: narrow crossing ${finding.crossing} is the only wide route from the town to ` +
        finding.anchors.map((anchor) => `${anchor.anchorKind} ${anchor.anchorId} (${at(anchor.at)})`).join(", ")
      );
    case "detour":
      return (
        `${head} at ${at(finding.at)}: the walk from the town to ${finding.anchorKind} ${finding.anchorId} takes ` +
        `${String(finding.tiles)} tiles for ${String(finding.directTiles)} on open ground, ratio ${finding.ratio.toFixed(2)} over ${String(finding.maxRatio)}`
      );
    case "reach":
      return (
        `${head} at ${at(finding.at)}: the ${finding.size} map's farthest anchor, ${finding.anchorKind} ${finding.anchorId}, ` +
        `is ${seconds(finding.seconds)} (${String(finding.tiles)} tiles) from the town, over ${seconds(finding.maxSeconds)}`
      );
  }
}
