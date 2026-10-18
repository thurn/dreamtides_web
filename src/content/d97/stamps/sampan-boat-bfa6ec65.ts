// sampan boat: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("bfa6ec65-b9de-4f68-bf0a-0fb479a8567a"),
  name: "sampan boat",
  theme: "japanese",
  width: 15,
  height: 2,
  tilesets: [
    {
      firstGid: 1,
      name: "Sampan_boat",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 30,
      columns: 15,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/Sampan_boat.png",
        width: 480,
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
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 0, 0,
        16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
      ],
    },
  ],
  walkability: "111111111111...111111111111111",
  extractedFrom: {
    sheet: "source-of-tales/tiles/Sampan_boat.png",
    rect: { from: [0,0], to: [14,1] },
  },
});
