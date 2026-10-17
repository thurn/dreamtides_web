// stalagmites: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("1801f4e9-db0a-4e6a-a909-1de53bc71f99"),
  name: "stalagmites",
  theme: "dungeon",
  width: 3,
  height: 1,
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
        257, 258, 259,
      ],
    },
  ],
  walkability: "111",
  extractedFrom: {
    sheet: "lpc-tile-atlas/files/terrain_atlas.png",
    rect: { from: [0,8], to: [2,8] },
  },
});
