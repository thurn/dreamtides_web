// Test helpers over the D97 phase union.

import type { FoldState } from "../fold-state";
import type { D97Run } from "./d97-state";

/** `state` with its started run replaced by `run`, in the same phase. */
export function withD97Run(state: FoldState, run: D97Run): FoldState {
  const d97 = state.d97;
  if (d97 === undefined || d97.run === null) throw new Error("no D97 run");
  return { ...state, d97: { ...d97, run } };
}
