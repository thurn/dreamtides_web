import type { EngineCatalog } from "../catalog";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { searchCommitPoint } from "../steps/feasibility";
import type { Step } from "../steps/kinds";
import { abilitySources, canActivate, abilityOrigin, originAbilities } from "./activation";
import { canPlay, type PlayZone } from "./timing";

/** An activated ability a side may activate now. */
export interface LegalActivation {
  readonly source: AbilitySource;
  readonly ability: number;
}

/** A card a side may play now, and where it plays it from. */
export interface LegalPlay {
  readonly card: InstanceId;
  readonly from: PlayZone;
}

/** The plays and activations open to one side in one state. */
export interface LegalMoves {
  readonly plays: LegalPlay[];
  readonly activations: LegalActivation[];
  /**
   * The `play` and `activate` steps left out because their feasibility
   * search ran out of runs (`BattleConfig.feasibilitySearchRuns`) before
   * finding a path, in candidate order; hosts log them as
   * `engine.feasibility` records.
   */
  readonly bounded: Step[];
}

/**
 * Per-engine memo of legal plays and activations, keyed by the state
 * object. States are immutable once committed, so an entry never goes
 * stale. Never persisted.
 */
export type LegalityMemo = WeakMap<BattleState, Map<Side, LegalMoves>>;

function computeMoves(state: BattleState, catalog: EngineCatalog, side: Side): LegalMoves {
  const bounded: Step[] = [];
  /**
   * Whether some path of answers to the step's play-time prompts reaches its
   * commit point with payable costs (steps/feasibility.ts), so legality
   * never drifts from execution.
   */
  const feasible = (step: Step): boolean => {
    const outcome = searchCommitPoint(state, step, catalog, []);
    if (outcome.exhausted) bounded.push(step);
    return outcome.feasible;
  };
  const zones: readonly PlayZone[] = ["hand", "void"];
  const plays = zones.flatMap((from) =>
    state.sides[side][from]
      .filter((card) => canPlay(state, catalog, side, card, from) && feasible({ kind: "play", card, from }))
      .map((card) => ({ card, from })),
  );
  const activations: LegalActivation[] = [];
  for (const source of abilitySources(state, side)) {
    const origin = abilityOrigin(state, source);
    if (origin === null) continue;
    originAbilities(catalog, origin).forEach((ability, index) => {
      if (
        ability.kind === "activated" &&
        canActivate(state, catalog, side, source, index) &&
        feasible({ kind: "activate", source, ability: index })
      ) {
        activations.push({ source, ability: index });
      }
    });
  }
  return { plays, activations, bounded };
}

/** The cards `side` may play and the abilities it may activate now. */
export function legalMoves(
  state: BattleState,
  catalog: EngineCatalog,
  side: Side,
  memo: LegalityMemo,
): LegalMoves {
  let bySide = memo.get(state);
  const cached = bySide?.get(side);
  if (cached !== undefined) return cached;
  const moves = computeMoves(state, catalog, side);
  if (bySide === undefined) {
    bySide = new Map();
    memo.set(state, bySide);
  }
  bySide.set(side, moves);
  return moves;
}

/** The cards `side` may legally play now, from its hand or by Reclaim from its void. */
export function legalPlays(
  state: BattleState,
  catalog: EngineCatalog,
  side: Side,
  memo: LegalityMemo,
): LegalPlay[] {
  return legalMoves(state, catalog, side, memo).plays;
}
