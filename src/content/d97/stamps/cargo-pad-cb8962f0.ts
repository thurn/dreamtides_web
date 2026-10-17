// cargo pad: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("cb8962f0-5259-49c0-891c-4a49374a3f1e"),
  name: "cargo pad",
  theme: "scifi",
  width: 5,
  height: 5,
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
      layer: "Floor",
      gids: [
        167, 168, 169, 170, 171,
        183, 184, 185, 186, 187,
        199, 200, 201, 202, 203,
        215, 216, 217, 218, 219,
        231, 232, 233, 234, 235,
      ],
    },
  ],
  walkability: "0000000000000000000000000",
  extractedFrom: {
    sheet: "lpc-goes-to-space/files/spaceship_6.png",
    rect: { from: [6,10], to: [10,14] },
  },
});
