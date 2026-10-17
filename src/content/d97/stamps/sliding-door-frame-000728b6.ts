// sliding door frame: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("000728b6-63a8-4308-be21-4a952e39b943"),
  name: "sliding door frame",
  theme: "scifi",
  width: 6,
  height: 3,
  tilesets: [
    {
      firstGid: 1,
      name: "scifi_space_rpg_tiles_lpcized_0",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 112,
      columns: 14,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-goes-to-space/files/scifi_space_rpg_tiles_lpcized_0.png",
        width: 448,
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
        0, 0, 0, 0, 0, 0,
        21, 22, 23, 24, 25, 26,
        35, 36, 37, 38, 39, 40,
      ],
    },
    {
      layer: "Walls",
      gids: [
        7, 8, 9, 10, 11, 12,
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000000111111111011",
  points: {
    door: [3, 2],
  },
  extractedFrom: {
    sheet: "lpc-goes-to-space/files/scifi_space_rpg_tiles_lpcized_0.png",
    rect: { from: [6,0], to: [11,2] },
  },
});
