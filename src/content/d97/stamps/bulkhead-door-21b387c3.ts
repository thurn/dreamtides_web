// bulkhead door: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("21b387c3-bda9-4422-ab01-f5da33108d35"),
  name: "bulkhead door",
  theme: "scifi",
  width: 12,
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
      layer: "Walls",
      gids: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95,
        100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
      ],
    },
    {
      layer: "Walls",
      gids: [
        68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000000000000111101111111000000000001",
  points: {
    door: [4, 1],
    "door-entry": [4, 2],
  },
  extractedFrom: {
    sheet: "lpc-goes-to-space/files/spaceship_6.png",
    rect: { from: [3,4], to: [14,6] },
  },
});
