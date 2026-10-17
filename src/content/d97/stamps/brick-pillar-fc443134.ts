// brick pillar: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("fc443134-96f9-4143-a2a6-572243a5f053"),
  name: "brick pillar",
  theme: "dungeon",
  width: 1,
  height: 4,
  tilesets: [
    {
      firstGid: 1,
      name: "dungeon",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 104,
      columns: 13,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/dungeon.png",
        width: 416,
        height: 256,
      },
      tiles: [],
      properties: {},
      externalPath: null,
    },
  ],
  layers: [
    {
      layer: "Walls",
      gids: [
        0,
        18,
        31,
        44,
      ],
    },
    {
      layer: "Walls",
      gids: [
        5,
        0,
        0,
        0,
      ],
      above: true,
    },
  ],
  walkability: "0111",
  extractedFrom: {
    sheet: "source-of-tales/tiles/dungeon.png",
    rect: { from: [4,0], to: [4,3] },
  },
});
