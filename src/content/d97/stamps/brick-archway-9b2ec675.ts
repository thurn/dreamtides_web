// brick archway: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("9b2ec675-decb-4efb-8e1f-40ff794bed81"),
  name: "brick archway",
  theme: "dungeon",
  width: 3,
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
        0, 0, 0,
        21, 22, 23,
        34, 35, 36,
        47, 0, 0,
      ],
    },
    {
      layer: "Walls",
      gids: [
        8, 9, 10,
        0, 0, 0,
        0, 0, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "0001111111..",
  extractedFrom: {
    sheet: "source-of-tales/tiles/dungeon.png",
    rect: { from: [7,0], to: [9,3] },
  },
});
