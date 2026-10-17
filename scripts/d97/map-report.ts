// Plain-text reports of the D97 map inspector: `inspect` summaries and
// `validate` findings, written to be read by a model as well as a person.
// Coordinates print as `x,y` tiles; rectangles as `x0,y0–x1,y1`.

import type { CompiledDreamMap } from "../../src/d97/map/compiled.ts";
import type { TilePoint } from "../../src/d97/map/definition.ts";
import { ANCHOR_LETTERS } from "../../src/d97/map/preview.ts";
import {
  anchorStandTile,
  mainRoute,
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

/** The `inspect` report of a compiled map. */
export function inspectReport(loaded: LoadedMap, tuning: D97MapTuning): string {
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
      `main-route target ${seconds(sizeClass.crossingTargetSeconds)} ±${String(Math.round(tuning.crossingTolerance * 100))}%)`,
    `Walking speed ${String(speed)} tiles/s`,
    `Layers ${String(map.layers.length)} (${String(map.layers.filter((layer) => layer.above).length)} above the player), ` +
      `tile objects ${String(map.objects.length)}, tilesets ${String(map.tilesets.length)}`,
    `Entries ${String(entries.length)}: ${entries.map((entry) => `${entry.kind} ${at(entry.at)}`).join(", ") || "none"}`,
    `Walkable ${String(walkable)}/${String(map.walkable.length)} cells (${percent(walkable, map.walkable.length)}); ` +
      `reachable from entries ${String(reachable)}/${String(walkable)}`,
    `Walkable areas ${String(components.length)}: largest ${components.slice(0, 5).map(String).join(", ") || "none"}`,
    "",
  ];

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

  const route = mainRoute(map, speed);
  lines.push(
    route === null
      ? "Main route: none (fewer than two connected doors)"
      : `Main route: door ${route.fromDoor} (${at(route.from)}) → door ${route.toDoor} (${at(route.to)}): ` +
          `${String(route.tiles)} tiles, ${seconds(route.seconds)} (target ${seconds(sizeClass.crossingTargetSeconds)})`,
  );
  lines.push("");

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
    case "main-route-missing":
      return `${head}: the ${finding.size} map has fewer than two connected doors`;
    case "main-route-crossing":
      return (
        `${head} at ${at(finding.route.from)}: the ${finding.size} map's main route to ${at(finding.route.to)} takes ` +
        `${seconds(finding.route.seconds)} (${String(finding.route.tiles)} tiles), outside ` +
        `${seconds(finding.minSeconds)}–${seconds(finding.maxSeconds)} around its ${seconds(finding.targetSeconds)} target`
      );
  }
}
