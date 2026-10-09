import type { EngineCatalog } from "../catalog";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { stepSearch, type SearchMemo } from "../steps/feasibility";
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
   * search spent the step's budget (`BattleConfig.feasibilitySearchRuns`)
   * before finding a path, in candidate order. The driver reports them in
   * `ApplyResult.bounded`, and hosts log them as `engine.feasibility`
   * records.
   */
  readonly bounded: Step[];
}

/**
 * A play or activation a committed state's decision left out because its
 * legality search spent the step's feasibility budget before finding a path.
 */
export interface BoundedLegality {
  /** The version of the committed state whose decision left it out. */
  readonly version: number;
  /** The side deciding. */
  readonly side: Side;
  readonly step: Step;
}

/**
 * Per-engine memo of legal plays and activations, and of the feasibility
 * searches behind them, keyed by the state object. States are immutable
 * once committed, so an entry never goes stale. A step's guard reads its
 * search back when the step runs. Never persisted.
 */
export interface LegalityMemo {
  readonly moves: WeakMap<BattleState, Map<Side, LegalMoves>>;
  readonly searches: SearchMemo;
}

export function createLegalityMemo(): LegalityMemo {
  return { moves: new WeakMap(), searches: new WeakMap() };
}

function computeMoves(state: BattleState, catalog: EngineCatalog, side: Side, searches: SearchMemo): LegalMoves {
  const bounded: Step[] = [];
  /**
   * Whether some path of answers to the step's play-time prompts reaches its
   * commit point with payable costs (steps/feasibility.ts), so legality
   * never drifts from execution.
   */
  const feasible = (step: Step): boolean => {
    const outcome = stepSearch(state, step, catalog, searches).legality;
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
  let bySide = memo.moves.get(state);
  const cached = bySide?.get(side);
  if (cached !== undefined) return cached;
  const moves = computeMoves(state, catalog, side, memo.searches);
  if (bySide === undefined) {
    bySide = new Map();
    memo.moves.set(state, bySide);
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
