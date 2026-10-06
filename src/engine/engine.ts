import type { EngineCatalog } from "./catalog";
import { rememberCharacteristics } from "./continuous/characteristics";
import type { EngineEvent } from "./events";
import { allowedBy, type Action, type Decision } from "./rules/actions";
import { decision, legalActions } from "./rules/decision";
import type { LegalityMemo } from "./rules/legality";
import type { Side } from "./state/ids";
import { initialState } from "./state/create";
import type { BattleInit, BattleState } from "./state/types";
import { runToDecision, stepForAction, type StepObserver } from "./steps/driver";
import type { AnswerSource, RecordedAnswer } from "./steps/types";
import { determinize, type Decklists } from "./view/determinize";
import { view, type BattleView } from "./view/view";

export interface ApplyResult {
  readonly state: BattleState;
  readonly events: readonly EngineEvent[];
  /** Every prompt answer given, including automatic ones, in order. */
  readonly answers: readonly RecordedAnswer[];
}

/**
 * The engine API over one card catalog. Every function is pure. States
 * handed to it are committed and never mutated afterwards, so it memoizes
 * their effective characteristics (continuous/characteristics.ts).
 */
export interface Engine {
  readonly catalog: EngineCatalog;
  /** Builds the battle and runs it to the first top-level decision. */
  createBattle(init: BattleInit, source: AnswerSource, observe?: StepObserver): ApplyResult;
  decision(state: BattleState): Decision | null;
  legalActions(state: BattleState, side: Side): Action[];
  /**
   * Runs a legal top-level action for the side owning the pending decision,
   * then automatic steps up to the next decision or the battle's end.
   */
  apply(
    state: BattleState,
    side: Side,
    action: Action,
    source: AnswerSource,
    observe?: StepObserver,
  ): ApplyResult;
  view(state: BattleState, side: Side): BattleView;
  /** A complete state consistent with `view` and both decklists, sampled with `random` (D22). */
  determinize(view: BattleView, decklists: Decklists, random: () => number): BattleState;
  /** The per-engine legality memo shared with the fold. Never persisted. */
  readonly memo: LegalityMemo;
}

export class IllegalAction extends Error {}

export function createEngine(catalog: EngineCatalog): Engine {
  const memo: LegalityMemo = new WeakMap();
  return {
    catalog,
    memo,
    createBattle(init, source, observe) {
      const start = initialState(init, catalog);
      return runToDecision(
        start,
        { kind: "beginBattle", dreamwell: init.dreamwell },
        source,
        catalog,
        memo,
        observe,
        true,
      );
    },
    decision(state) {
      rememberCharacteristics(state, catalog);
      return decision(state, catalog, memo);
    },
    legalActions(state, side) {
      rememberCharacteristics(state, catalog);
      return legalActions(state, catalog, side, memo);
    },
    apply(state, side, action, source, observe) {
      rememberCharacteristics(state, catalog);
      if (!legalActions(state, catalog, side, memo).some((legal) => allowedBy(legal, action, state))) {
        throw new IllegalAction(`Illegal action for ${side}: ${JSON.stringify(action)}`);
      }
      return runToDecision(state, stepForAction(state, action), source, catalog, memo, observe);
    },
    view(state, side) {
      rememberCharacteristics(state, catalog);
      return view(state, side, catalog);
    },
    determinize(seen, decklists, random) {
      return determinize(seen, decklists, random, catalog);
    },
  };
}
