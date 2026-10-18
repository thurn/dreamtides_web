// junk heap: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("85ab0875-7237-4451-84f8-8846b13a968c"),
  name: "junk heap",
  theme: "scifi",
  width: 2,
  height: 2,
  tilesets: [
    {
      firstGid: 1,
      name: "obj_misk_atlas",
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
        path: "lpc-tile-atlas2/files/obj_misk_atlas.png",
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
        599, 600,
        631, 632,
      ],
    },
  ],
  walkability: "1111",
  extractedFrom: {
    sheet: "lpc-tile-atlas2/files/obj_misk_atlas.png",
    rect: { from: [22,18], to: [23,19] },
  },
});
