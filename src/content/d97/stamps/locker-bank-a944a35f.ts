// locker bank: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("a944a35f-4f40-4dc2-b169-cffa6395a862"),
  name: "locker bank",
  theme: "scifi",
  width: 3,
  height: 7,
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
        0, 0, 0,
        173, 174, 175,
        189, 190, 191,
        205, 206, 207,
        221, 222, 223,
        237, 238, 239,
        253, 254, 255,
      ],
    },
    {
      layer: "Objects",
      gids: [
        157, 158, 159,
        0, 0, 0,
        0, 0, 0,
        0, 0, 0,
        0, 0, 0,
        0, 0, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000111111111111111111",
  extractedFrom: {
    sheet: "lpc-goes-to-space/files/spaceship_6.png",
    rect: { from: [12,9], to: [14,15] },
  },
});
