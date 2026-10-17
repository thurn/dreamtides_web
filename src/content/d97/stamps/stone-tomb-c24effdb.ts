// stone tomb: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("c24effdb-72d6-437b-9c90-fcda5701f276"),
  name: "stone tomb",
  theme: "graveyard",
  width: 3,
  height: 3,
  tilesets: [
    {
      firstGid: 1,
      name: "crpyt",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 49,
      columns: 7,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/crpyt.png",
        width: 224,
        height: 224,
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
        8, 9, 10,
        15, 16, 17,
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
    sheet: "source-of-tales/tiles/crpyt.png",
    rect: { from: [0,0], to: [2,2] },
  },
});
