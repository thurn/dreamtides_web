// stone idol: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("fa6bcf41-92e7-4422-8f59-79e9f2c7bcd9"),
  name: "stone idol",
  theme: "dungeon",
  width: 2,
  height: 3,
  tilesets: [
    {
      firstGid: 1,
      name: "terrain_atlas",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 1024,
      columns: 32,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-tile-atlas/files/terrain_atlas.png",
        width: 1024,
        height: 1024,
      },
      tiles: [],
      properties: {},
      externalPath: null,
    },
  ],
  layers: [
    {
      layer: "Objects",
      gids: [
        0, 0,
        432, 433,
        464, 465,
      ],
    },
    {
      layer: "Objects",
      gids: [
        400, 401,
        0, 0,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "001111",
  extractedFrom: {
    sheet: "lpc-tile-atlas/files/terrain_atlas.png",
    rect: { from: [15,12], to: [16,14] },
  },
});
