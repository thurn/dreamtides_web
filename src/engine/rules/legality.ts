import type { EngineCatalog } from "../catalog";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { EmptyPrompt, Feasible } from "../steps/errors";
import { runStep } from "../steps/runner";
import { FIRST_LEGAL } from "../steps/sources";
import { canPlayFromHand } from "./timing";

/**
 * Per-engine memo of legal plays, keyed by the state object. States are
 * immutable once committed, so an entry never goes stale. Never persisted.
 */
export type LegalityMemo = WeakMap<BattleState, Map<Side, InstanceId[]>>;

/**
 * Whether playing `card` can reach its commit point: every required
 * play-time choice has a legal answer and the costs are payable. A dry run
 * of the play step answers each prompt with its first legal answer and stops
 * at the commit point, so legality never drifts from execution.
 */
function playIsFeasible(state: BattleState, catalog: EngineCatalog, card: InstanceId): boolean {
  try {
    runStep(state, { kind: "play", card }, FIRST_LEGAL, catalog, { dryRun: true });
    return true;
  } catch (error) {
    if (error instanceof Feasible) return true;
    if (error instanceof EmptyPrompt) return false;
    throw error;
  }
}

/** The cards `side` may legally play from hand now. */
export function legalPlays(
  state: BattleState,
  catalog: EngineCatalog,
  side: Side,
  memo: LegalityMemo,
): InstanceId[] {
  let bySide = memo.get(state);
  const cached = bySide?.get(side);
  if (cached !== undefined) return cached;
  const plays = state.sides[side].hand.filter(
    (card) => canPlayFromHand(state, catalog, side, card) && playIsFeasible(state, catalog, card),
  );
  if (bySide === undefined) {
    bySide = new Map();
    memo.set(state, bySide);
  }
  bySide.set(side, plays);
  return plays;
}
