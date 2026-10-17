// straw pile: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("b0f2fe2c-2ce1-4c1d-b3fc-5b20d0ca9cf4"),
  name: "straw pile",
  theme: "dungeon",
  width: 2,
  height: 3,
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
      layer: "Objects",
      gids: [
        64, 65,
        77, 78,
        90, 91,
      ],
    },
  ],
  walkability: "111111",
  extractedFrom: {
    sheet: "source-of-tales/tiles/dungeon.png",
    rect: { from: [11,4], to: [12,6] },
  },
});
