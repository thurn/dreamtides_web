// timber hut: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("68b342a5-5252-4242-b73d-1661bff1131c"),
  name: "timber hut",
  theme: "building",
  width: 3,
  height: 3,
  tilesets: [
    {
      firstGid: 1,
      name: "wood_and_bronze_house",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 9,
      columns: 3,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/wood_and_bronze_house.png",
        width: 96,
        height: 96,
      },
      tiles: [],
      properties: {},
      externalPath: null,
    },
  ],
  layers: [
    {
      layer: "Buildings",
      gids: [
        0, 0, 0,
        4, 5, 6,
        7, 8, 9,
      ],
    },
    {
      layer: "Buildings",
      gids: [
        1, 2, 3,
        0, 0, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000111111",
  extractedFrom: {
    sheet: "source-of-tales/tiles/wood_and_bronze_house.png",
    rect: { from: [0,0], to: [2,2] },
  },
});
