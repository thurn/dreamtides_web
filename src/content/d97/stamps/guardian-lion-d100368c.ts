// guardian lion: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("d100368c-074a-4821-bb96-219ec04da10d"),
  name: "guardian lion",
  theme: "japanese",
  width: 2,
  height: 3,
  tilesets: [
    {
      firstGid: 1,
      name: "foodog_statue",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 6,
      columns: 2,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/foodog_statue.png",
        width: 64,
        height: 96,
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
        3, 4,
        5, 6,
      ],
    },
    {
      layer: "Objects",
      gids: [
        1, 2,
        0, 0,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "001111",
  extractedFrom: {
    sheet: "source-of-tales/tiles/foodog_statue.png",
    rect: { from: [0,0], to: [1,2] },
  },
});
