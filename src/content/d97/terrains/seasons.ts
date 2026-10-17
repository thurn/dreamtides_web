// The LPC Revised seasonal sheet families a `reseason` operation maps
// between: each family is one sheet layout drawn for every season, so a tile
// moves to the same tile of the target season's sheet.

import type { D97SeasonFamily } from "../../../d97/map/assets";

function family(name: string, stem: string): D97SeasonFamily {
  const image = (season: string) => `lpc-revised/Terrain/${stem}_${season}.png`;
  return {
    family: name,
    images: { spring: image("spring"), summer: image("summer"), autumn: image("autumn"), winter: image("winter") },
  };
}

export const D97_SEASON_FAMILIES: readonly D97SeasonFamily[] = [
  family("terrain", "terrain"),
  family("cliffs", "cliff"),
  family("plants", "plants"),
  family("trees", "trees"),
  family("wildflowers", "wildflowers"),
];
