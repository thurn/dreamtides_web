// birdbath: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("e41c7674-d04d-4ef7-bb09-36ef8cce931e"),
  name: "birdbath",
  theme: "street",
  width: 1,
  height: 2,
  tilesets: [
    {
      firstGid: 1,
      name: "birdbath",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 18,
      columns: 9,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/birdbath.png",
        width: 288,
        height: 64,
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
        0,
        10,
      ],
    },
    {
      layer: "Objects",
      gids: [
        1,
        0,
      ],
      above: true,
    },
  ],
  walkability: "01",
  extractedFrom: {
    sheet: "source-of-tales/tiles/birdbath.png",
    rect: { from: [0,0], to: [0,1] },
  },
});
