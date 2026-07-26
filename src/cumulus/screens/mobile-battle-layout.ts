/** The full desktop opening window shown before either side expands it. */
export const DESKTOP_BATTLE_STARTING_BACK_RANK_SLOTS = 10;

/** Mobile exposes the same fixed formation as every battle surface. */
export const MOBILE_BATTLE_MIN_BACK_RANK_SLOTS = 10;
export const MOBILE_BATTLE_MIN_FRONT_RANK_SLOTS = 9;

/** Mobile's maximum visible formation. */
export const MOBILE_BATTLE_MAX_BACK_RANK_SLOTS = 10;
export const MOBILE_BATTLE_MAX_FRONT_RANK_SLOTS = 9;

/** Above eight back-rank columns, mobile starts reclaiming outer and inter-slot space. */
export const MOBILE_BATTLE_COMPACT_RANK_THRESHOLD = 8;

/** Shared desktop track for the docked battle inspector. */
export const MOBILE_BATTLE_INSPECTOR_RAIL_TRACK =
  "clamp(340px, 25vw, 400px)";
