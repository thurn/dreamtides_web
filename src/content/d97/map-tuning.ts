// D97 map tunables (decision P13): walking speed, map size classes with
// their main-route crossing targets, and door spacing. Adjusted after
// playtests; the map tools and validators read them from here.

import type { D97MapTuning } from "../../d97/map/tuning";

export const D97_MAP_TUNING: D97MapTuning = {
  walkingSpeedTilesPerSecond: 4,
  sizeClasses: [
    {
      size: "small",
      nominalSide: 60,
      maxSide: 85,
      crossingTargetSeconds: 60,
      crossingSeverity: "warning",
    },
    {
      size: "medium",
      nominalSide: 110,
      maxSide: 130,
      crossingTargetSeconds: 120,
      crossingSeverity: "error",
    },
    {
      size: "large",
      nominalSide: 150,
      maxSide: 200,
      crossingTargetSeconds: 180,
      crossingSeverity: "warning",
    },
  ],
  crossingTolerance: 0.25,
  doorMinSpacingTiles: 8,
};
