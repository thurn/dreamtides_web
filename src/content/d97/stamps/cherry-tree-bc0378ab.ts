// cherry tree: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("bc0378ab-3c59-4577-86cf-7623227c4584"),
  name: "cherry tree",
  theme: "japanese",
  width: 4,
  height: 4,
  tilesets: [
    {
      firstGid: 1,
      name: "cherry_blossom_trees",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 28,
      columns: 7,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/cherry_blossom_trees.png",
        width: 224,
        height: 128,
      },
      tiles: [],
      properties: {},
      externalPath: null,
    },
  ],
  layers: [
    {
      layer: "Trees",
      gids: [
        0, 0, 0, 0,
        0, 0, 0, 0,
        15, 16, 17, 18,
        22, 23, 24, 25,
      ],
    },
    {
      layer: "Trees",
      gids: [
        1, 2, 3, 4,
        8, 9, 10, 11,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "000000001111.1..",
  extractedFrom: {
    sheet: "source-of-tales/tiles/cherry_blossom_trees.png",
    rect: { from: [0,0], to: [3,3] },
  },
});
