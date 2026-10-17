// Where the player appears in a dream: the entry tile of its first door, or
// failing that the walkable tile nearest the map's center. Later beads replace
// this with the arrival door or waypoint the run recorded (Appendix B §B17).

import { isWalkable, type CompiledDreamMap, type WalkabilityGrid } from "../map/compiled";
import type { TilePoint } from "../map/definition";

export function spawnTile(map: CompiledDreamMap, grid: WalkabilityGrid = map): TilePoint {
  const door = map.anchors.find((anchor) => anchor.kind === "door");
  if (door?.entry !== undefined && isWalkable(grid, door.entry)) return door.entry;
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);
  let best: TilePoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const distance = Math.abs(x - cx) + Math.abs(y - cy);
      if (distance < bestDistance && isWalkable(grid, [x, y])) {
        best = [x, y];
        bestDistance = distance;
      }
    }
  }
  return best ?? [cx, cy];
}
