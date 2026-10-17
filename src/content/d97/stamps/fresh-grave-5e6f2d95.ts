// fresh grave: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("5e6f2d95-6317-4e77-ab4e-bbfbcbafdeb0"),
  name: "fresh grave",
  theme: "graveyard",
  width: 2,
  height: 3,
  tilesets: [
    {
      firstGid: 1,
      name: "gravestones",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 15,
      columns: 5,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/gravestones.png",
        width: 160,
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
        9, 10,
        14, 15,
      ],
    },
    {
      layer: "Objects",
      gids: [
        4, 5,
        0, 0,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "001111",
  extractedFrom: {
    sheet: "source-of-tales/tiles/gravestones.png",
    rect: { from: [3,0], to: [4,2] },
  },
});
