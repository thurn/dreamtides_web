// columned portico: a D97 map stamp extracted by `npm run d97:map -- stamps cut`,
// its pillars rearranged under the pediment's ends: the sheet's own pillar
// pieces (columns 11 and 12) stand unevenly for hand composition.

import { defineD97Stamp } from "../../../d97/map/stamps";
import { parseD97StampId } from "../../../types/identifiers";

export default defineD97Stamp({
  id: parseD97StampId("4ed63fa9-0ece-432f-ac80-f317dabfbaae"),
  name: "columned portico",
  theme: "desert",
  width: 4,
  height: 5,
  tilesets: [
    {
      firstGid: 1,
      name: "adobe-2",
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
        path: "lpc-adobe-town-set/files/adobe-2.png",
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
        0, 0, 0, 0,
        0, 0, 0, 0,
        188, 0, 0, 189,
        204, 0, 0, 205,
        220, 0, 0, 221,
      ],
    },
    {
      layer: "Objects",
      gids: [
        155, 156, 157, 158,
        171, 172, 173, 174,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ],
      above: true,
    },
  ],
  walkability: "00000000100110011001",
  points: {
    passage: [1, 4],
  },
  extractedFrom: {
    sheet: "lpc-adobe-town-set/files/adobe-2.png",
    rect: { from: [10,9], to: [13,13] },
  },
});
