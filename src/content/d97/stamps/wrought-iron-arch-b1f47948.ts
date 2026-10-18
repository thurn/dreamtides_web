// wrought iron arch: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("b1f47948-7fa8-4bd6-9cd8-ce41a987c5f7"),
  name: "wrought iron arch",
  theme: "graveyard",
  width: 3,
  height: 3,
  tilesets: [
    {
      firstGid: 1,
      name: "build_atlas",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 1024,
      columns: 32,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "lpc-tile-atlas2/files/build_atlas.png",
        width: 1024,
        height: 1024,
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
        0, 0, 0,
        598, 599, 600,
      ],
    },
    {
      layer: "Objects",
      gids: [
        534, 535, 536,
        566, 0, 568,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "0000.0101",
  points: {
    door: [1, 2],
  },
  extractedFrom: {
    sheet: "lpc-tile-atlas2/files/build_atlas.png",
    rect: { from: [21,16], to: [23,18] },
  },
});
