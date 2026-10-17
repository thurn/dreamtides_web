// `npm run d97:map -- compose`: scaffold a blank-canvas map module for a
// theme no source map covers (decision P11's third path). The scaffold is
// built only from brushes and stamps: the theme's base fill and cover, a
// winding path between two doors, a pond, up to three of the theme's stamps
// in the open corners, and a reseason when the theme has a season. It names
// two regions, a landmark per door, the doors and a waypoint, so it
// compiles and validates at once; the author then edits it.

import type { TilePoint } from "../../src/d97/map/definition.ts";
import type { D97CatalogStamp } from "../../src/d97/map/stamps.ts";
import type { D97MapTheme } from "../../src/content/d97/terrains/themes.ts";
import type { DreamAnchorId, DreamMapId, D97TerrainId } from "../../src/types/identifiers.ts";

export interface ComposeRequest {
  readonly id: DreamMapId;
  readonly anchors: { readonly westDoor: DreamAnchorId; readonly eastDoor: DreamAnchorId; readonly waypoint: DreamAnchorId };
  readonly width: number;
  readonly height: number;
  readonly theme: D97MapTheme;
  /** The theme's catalog stamps, in catalog order. */
  readonly stamps: readonly D97CatalogStamp[];
  readonly terrainName: (id: D97TerrainId) => string;
  /** Import specifiers of `src/d97/map/definition` and `src/types/identifiers` from the module. */
  readonly imports: { readonly definition: string; readonly identifiers: string };
}

/** The smallest side a scaffold lays out. */
const COMPOSE_MIN_SIDE = 24;

const point = ([x, y]: TilePoint) => `[${String(x)}, ${String(y)}]`;

/** The TypeScript text of a scaffolded map module. */
export function composeMapSource(request: ComposeRequest): string {
  const { width: w, height: h, theme } = request;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < COMPOSE_MIN_SIDE || h < COMPOSE_MIN_SIDE) {
    throw new RangeError(`compose wants whole sides of at least ${String(COMPOSE_MIN_SIDE)} tiles`);
  }
  const mid = Math.floor(h / 2);
  const top = Math.floor(h / 4);
  const bottom = Math.floor((3 * h) / 4);
  const x1 = Math.floor(w / 4);
  const x2 = Math.floor(w / 2);
  const x3 = Math.floor((3 * w) / 4);
  const path: TilePoint[] = [[1, mid], [x1, mid], [x1, top], [x2, top], [x2, bottom], [x3, bottom], [x3, mid], [w - 2, mid]];
  const whole = `{ kind: "rect", from: [0, 0], to: ${point([w - 1, h - 1])} }`;

  const terrains = new Map<D97TerrainId, string>();
  const terrain = (id: D97TerrainId) => {
    if (!terrains.has(id)) terrains.set(id, `TERRAIN_${String(terrains.size + 1)}`);
    return terrains.get(id) ?? "";
  };
  const recipe: string[] = [
    `    // The ${request.terrainName(theme.base)} base, filling the map.`,
    `    { op: "brush", terrain: ${terrain(theme.base)}, shape: ${whole} },`,
  ];
  if (theme.cover !== undefined) {
    recipe.push(`    { op: "brush", terrain: ${terrain(theme.cover)}, shape: ${whole} },`);
  }
  recipe.push(
    "    // A winding path from the west door to the east door.",
    `    { op: "brush", terrain: ${terrain(theme.path.terrain)},${theme.path.erase ? " erase: true," : ""} ` +
      `shape: { kind: "path", width: 2, points: [${path.map(point).join(", ")}] } },`,
  );
  if (theme.water !== undefined && x1 - 3 >= 4 && mid - 3 >= 4) {
    recipe.push(
      "    // A pond in the north-west corner.",
      `    { op: "brush", terrain: ${terrain(theme.water)}, shape: { kind: "ellipse", from: [2, 2], to: ${point([x1 - 3, mid - 3])} } },`,
    );
  }
  // Open corners, clear of the path and the pond: north-east, south-west, south-east.
  const areas: { from: TilePoint; to: TilePoint }[] = [
    { from: [x2 + 3, 1], to: [w - 2, top - 2] },
    { from: [1, mid + 3], to: [x2 - 3, h - 2] },
    { from: [x3 + 3, mid + 3], to: [w - 2, h - 2] },
  ];
  const stamps: { stamp: D97CatalogStamp; at: TilePoint }[] = [];
  for (const area of areas) {
    const stamp = request.stamps.find(
      (candidate) =>
        !stamps.some((placed) => placed.stamp === candidate) &&
        candidate.width <= area.to[0] - area.from[0] + 1 &&
        candidate.height <= area.to[1] - area.from[1] + 1,
    );
    if (stamp !== undefined) stamps.push({ stamp, at: area.from });
  }
  if (stamps.length > 0) recipe.push(`    // ${theme.theme} stamps in the open corners.`);
  stamps.forEach(({ at }, index) => {
    recipe.push(`    { op: "stamp", stamp: STAMP_${String(index + 1)}, at: ${point(at)} },`);
  });
  if (theme.season !== undefined) {
    recipe.push(`    { op: "reseason", season: "${theme.season}" },`);
  }

  const identifiers = ["parseD97StampId", "parseD97TerrainId", "parseDreamAnchorId", "parseDreamMapId"].filter(
    (name) => name !== "parseD97StampId" || stamps.length > 0,
  );
  return [
    `// A ${theme.theme} map scaffolded by \`npm run d97:map -- compose\`: a blank`,
    "// canvas built from brushes and stamps. Edit the recipe, regions, landmarks",
    "// and anchors, then run `inspect`, `preview` and `validate` until it reads well.",
    "",
    `import { defineDreamMap } from "${request.imports.definition}";`,
    `import { ${identifiers.join(", ")} } from "${request.imports.identifiers}";`,
    "",
    ...[...terrains].map(([id, name]) => `const ${name} = parseD97TerrainId("${id}"); // ${request.terrainName(id)}`),
    ...stamps.map(({ stamp }, index) => `const STAMP_${String(index + 1)} = parseD97StampId("${stamp.id}"); // ${stamp.name}`),
    "",
    "export default defineDreamMap({",
    `  id: parseDreamMapId("${request.id}"),`,
    `  source: { kind: "blank", width: ${String(w)}, height: ${String(h)}, tileWidth: 32, tileHeight: 32 },`,
    "  recipe: [",
    ...recipe,
    "  ],",
    "  regions: [",
    `    { name: "the west half", from: [0, 0], to: ${point([x2 - 1, h - 1])} },`,
    `    { name: "the east half", from: ${point([x2, 0])}, to: ${point([w - 1, h - 1])} },`,
    "  ],",
    "  landmarks: [",
    `    { name: "the west door", at: ${point([0, mid])} },`,
    `    { name: "the east door", at: ${point([w - 1, mid])} },`,
    "  ],",
    "  anchors: [",
    `    { id: parseDreamAnchorId("${request.anchors.westDoor}"), kind: "door", at: { landmark: "the west door" }, entry: ${point([1, mid])} },`,
    `    { id: parseDreamAnchorId("${request.anchors.eastDoor}"), kind: "door", at: { landmark: "the east door" }, entry: ${point([w - 2, mid])} },`,
    `    { id: parseDreamAnchorId("${request.anchors.waypoint}"), kind: "waypoint", at: ${point([x2, mid])} },`,
    "  ],",
    "});",
    "",
  ].join("\n");
}
