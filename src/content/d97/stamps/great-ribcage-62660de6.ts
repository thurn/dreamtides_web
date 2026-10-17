// great ribcage: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("62660de6-d96a-439a-a97f-544b45f24c0c"),
  name: "great ribcage",
  theme: "desert",
  width: 3,
  height: 4,
  tilesets: [
    {
      firstGid: 1,
      name: "beach-desert",
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
        path: "lpc-beach-desert/files/lpc-beach-desert/beach-desert.png",
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
        684, 685, 686,
        716, 717, 718,
        748, 0, 750,
      ],
    },
    {
      layer: "Objects",
      gids: [
        652, 653, 654,
        0, 0, 0,
        0, 0, 0,
        0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000101101101",
  extractedFrom: {
    sheet: "lpc-beach-desert/files/lpc-beach-desert/beach-desert.png",
    rect: { from: [11,20], to: [13,23] },
  },
});
