// twin headstones: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("e298cd3c-0eeb-4f2e-9380-b0cadf229938"),
  name: "twin headstones",
  theme: "graveyard",
  width: 2,
  height: 2,
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
        7, 8,
      ],
    },
    {
      layer: "Objects",
      gids: [
        2, 3,
        0, 0,
      ],
      above: true,
    },
  ],
  walkability: "0011",
  extractedFrom: {
    sheet: "source-of-tales/tiles/gravestones.png",
    rect: { from: [1,0], to: [2,1] },
  },
});
