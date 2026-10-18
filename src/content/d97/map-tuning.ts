// D97 map tunables (decisions P13 and P33): walking speed, the compact map
// size classes with their reach maxima, door spacing, the town radius, path
// widths and the detour ratio. Adjusted after playtests; the map tools and
// validators read them from here.

import type { D97MapTuning } from "../../d97/map/tuning";
import { parseDreamMapId } from "../../types/identifiers";

export const D97_MAP_TUNING: D97MapTuning = {
  walkingSpeedTilesPerSecond: 4,
  sizeClasses: [
    { size: "small", nominalSide: 32, maxSide: 40, reachMaxSeconds: 20 },
    { size: "medium", nominalSide: 50, maxSide: 56, reachMaxSeconds: 30 },
    { size: "large", nominalSide: 70, maxSide: 80, reachMaxSeconds: 45 },
  ],
  doorMinSpacingTiles: 8,
  townRadiusTiles: 12,
  minPathWidthTiles: 2,
  mainRouteMinWidthTiles: 3,
  maxDetourRatio: 1.6,
  layoutAllowlist: [
    // The first dream predates the compact sizes and the starting town. PT.2
    // (hv-j1n2.68) rebuilds it around its well square and removes this entry.
    parseDreamMapId("3229d6c7-0700-4f37-9b07-921e3dccb8b6"),
  ],
};
