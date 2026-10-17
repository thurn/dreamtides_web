// Guardian chokepoints on the overworld (Appendix B §B5). An unbeaten
// guardian stands on the corridor tile in front of the door it blocks, so the
// corridor is closed in both directions, and walking toward anything beyond it
// walks to the guardian instead. Once beaten, the guardian steps aside onto a
// neighboring tile that keeps its door reachable and stays as an ordinary
// character.

import { findPath } from "../map/pathfinding";
import { isWalkable, type CompiledAnchor, type CompiledDreamMap, type WalkabilityGrid } from "../map/compiled";
import type { TilePoint } from "../map/definition";
import type { DreamAnchorId } from "../../types/identifiers";
import { movementGrid, pathBeside } from "./interactions";
import { FACING_STEPS } from "./walker";

function neighbors([x, y]: TilePoint): TilePoint[] {
  return Object.values(FACING_STEPS).map(([dx, dy]): TilePoint => [x + dx, y + dy]);
}

function withCell(grid: WalkabilityGrid, [x, y]: TilePoint, walkable: boolean): WalkabilityGrid {
  const cells = Array.from(grid.walkable);
  cells[y * grid.width + x] = walkable ? "1" : "0";
  return { ...grid, walkable: cells.join("") };
}

/**
 * The tile a beaten guardian steps aside to, or null when every neighbor
 * would cut its door off. `grid` is the movement grid with the guardian's own
 * tile open. Open ground is preferred over the corridor, and a side step over
 * stepping straight back along it.
 */
export function asideTile(
  grid: WalkabilityGrid,
  guardian: TilePoint,
  door: TilePoint | null,
): TilePoint | null {
  const open = (tile: TilePoint) =>
    neighbors(tile).filter((next) => (next[0] !== guardian[0] || next[1] !== guardian[1]) && isWalkable(grid, next)).length;
  const candidates = neighbors(guardian)
    .filter((tile) => isWalkable(grid, tile))
    .map((tile) => ({ tile, open: open(tile) }));
  const corridor = candidates.reduce<(typeof candidates)[number] | null>(
    (best, candidate) => (best === null || candidate.open < best.open ? candidate : best),
    null,
  );
  const straightBack = corridor === null ? null : [2 * guardian[0] - corridor.tile[0], 2 * guardian[1] - corridor.tile[1]];
  const ranked = candidates
    .filter((candidate) => candidate !== corridor)
    .map((candidate) => ({
      ...candidate,
      back: straightBack !== null && candidate.tile[0] === straightBack[0] && candidate.tile[1] === straightBack[1],
    }))
    .sort((a, b) => Number(a.back) - Number(b.back) || b.open - a.open);
  for (const { tile } of ranked) {
    if (door === null || pathBeside(withCell(grid, tile, false), guardian, door) !== null) return tile;
  }
  return null;
}

/**
 * The anchors where they stand: every beaten guardian moved aside off its
 * chokepoint, every other anchor on its own tile.
 */
export function standingAnchors(
  map: CompiledDreamMap,
  beatenGuardians: ReadonlySet<DreamAnchorId>,
): CompiledAnchor[] {
  let anchors = [...map.anchors];
  for (const guardian of map.anchors) {
    if (guardian.kind !== "guardian" || !beatenGuardians.has(guardian.id)) continue;
    const others = anchors.filter((anchor) => anchor.id !== guardian.id);
    const door = map.anchors.find((anchor) => anchor.id === guardian.blocksDoor)?.at ?? null;
    const tile = asideTile(movementGrid(map, others), guardian.at, door);
    if (tile !== null) anchors = [...others, { ...guardian, at: tile }];
  }
  return anchors;
}

/**
 * The unbeaten guardian standing between `from` and `target` on `grid` (a
 * movement grid), nearest first: the target is unreachable while it stands,
 * reachable once its tile opens, and the guardian itself can be reached.
 * `target` is a tile to stand on, or an anchor tile to stand beside.
 */
export function blockingGuardian(
  grid: WalkabilityGrid,
  guardians: readonly CompiledAnchor[],
  from: TilePoint,
  target: { readonly tile: TilePoint; readonly beside: boolean },
): { readonly guardian: CompiledAnchor; readonly path: TilePoint[] } | null {
  let best: { guardian: CompiledAnchor; path: TilePoint[] } | null = null;
  for (const guardian of guardians) {
    const opened = withCell(grid, guardian.at, true);
    const reachable = target.beside ? pathBeside(opened, from, target.tile) : findPath(opened, from, target.tile);
    if (reachable === null) continue;
    const path = pathBeside(grid, from, guardian.at);
    if (path !== null && (best === null || path.length < best.path.length)) best = { guardian, path };
  }
  return best;
}
