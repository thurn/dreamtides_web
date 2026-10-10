// tutorial-only until Phase 6

import type { MarkerDiffState } from "../types";

export const BATTLE_MARKER_SET_EVENT = "battle_proto_marker_set";

export function diffMarkerValue(previous: boolean, next: boolean): MarkerDiffState {
  if (previous === next) {
    return "unchanged";
  }
  return next ? "set" : "cleared";
}
