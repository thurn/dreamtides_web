// iron grate: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("aeebd9a9-7b5b-44ba-9b8b-f4555a30cb9e"),
  name: "iron grate",
  theme: "dungeon",
  width: 1,
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
      layer: "Walls",
      gids: [
        53,
        66,
        79,
      ],
    },
  ],
  walkability: "111",
  extractedFrom: {
    sheet: "source-of-tales/tiles/dungeon.png",
    rect: { from: [0,4], to: [0,6] },
  },
});
