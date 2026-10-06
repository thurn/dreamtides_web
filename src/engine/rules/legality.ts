import type { EngineCatalog } from "../catalog";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { EmptyPrompt, Feasible } from "../steps/errors";
import type { Step } from "../steps/kinds";
import { runStep } from "../steps/runner";
import { FIRST_LEGAL } from "../steps/sources";
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
}

/**
 * Per-engine memo of legal plays and activations, keyed by the state
 * object. States are immutable once committed, so an entry never goes
 * stale. Never persisted.
 */
export type LegalityMemo = WeakMap<BattleState, Map<Side, LegalMoves>>;

/**
 * Whether a `play` or `activate` step can reach its commit point: every
 * required play-time choice has a legal answer and the costs are payable. A
 * dry run answers each prompt with its first legal answer and stops at the
 * commit point, so legality never drifts from execution.
 */
function isFeasible(state: BattleState, catalog: EngineCatalog, step: Step): boolean {
  try {
    runStep(state, step, FIRST_LEGAL, catalog, { dryRun: true });
    return true;
  } catch (error) {
    if (error instanceof Feasible) return true;
    if (error instanceof EmptyPrompt) return false;
    throw error;
  }
}

function computeMoves(state: BattleState, catalog: EngineCatalog, side: Side): LegalMoves {
  const zones: readonly PlayZone[] = ["hand", "void"];
  const plays = zones.flatMap((from) =>
    state.sides[side][from]
      .filter((card) => canPlay(state, catalog, side, card, from) && isFeasible(state, catalog, { kind: "play", card, from }))
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
        isFeasible(state, catalog, { kind: "activate", source, ability: index })
      ) {
        activations.push({ source, ability: index });
      }
    });
  }
  return { plays, activations };
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
