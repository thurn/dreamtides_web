// console desk: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("6b207687-cc88-4a16-bace-158d45a59525"),
  name: "console desk",
  theme: "scifi",
  width: 5,
  height: 3,
  tilesets: [
    {
      firstGid: 1,
      name: "spaceship_6",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 256,
      columns: 16,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-goes-to-space/files/spaceship_6.png",
        width: 512,
        height: 512,
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
        0, 0, 0, 0, 0,
        130, 131, 132, 133, 134,
        146, 147, 148, 149, 150,
      ],
    },
    {
      layer: "Objects",
      gids: [
        114, 115, 116, 117, 118,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000001111111111",
  extractedFrom: {
    sheet: "lpc-goes-to-space/files/spaceship_6.png",
    rect: { from: [1,7], to: [5,9] },
  },
});
