// stone cross: a D97 map stamp extracted by `npm run d97:map -- stamps cut`.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("2383b32c-510f-480c-bfd8-7a8a766ba1ad"),
  name: "stone cross",
  theme: "graveyard",
  width: 1,
  height: 2,
  tilesets: [
    {
      firstGid: 1,
      name: "gravestones",
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 15,
      columns: 5,
      spacing: 0,
      margin: 0,
      tileOffset: {
        x: 0,
        y: 0,
      },
      image: {
        path: "source-of-tales/tiles/gravestones.png",
        width: 160,
        height: 96,
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
        0,
        6,
      ],
    },
    {
      layer: "Objects",
      gids: [
        1,
        0,
      ],
      above: true,
    },
  ],
  walkability: "01",
  extractedFrom: {
    sheet: "source-of-tales/tiles/gravestones.png",
    rect: { from: [0,0], to: [0,1] },
  },
});
