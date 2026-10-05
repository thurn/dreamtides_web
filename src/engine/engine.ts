import type { EngineCatalog } from "./catalog";
import type { EngineEvent } from "./events";
import { actionsEqual, type Action, type Decision } from "./rules/actions";
import { decision, legalActions } from "./rules/decision";
import type { Side } from "./state/ids";
import { initialState } from "./state/create";
import type { BattleInit, BattleState } from "./state/types";
import { runToDecision, stepForAction, type StepObserver } from "./steps/driver";
import type { AnswerSource } from "./steps/types";
import { view, type BattleView } from "./view/view";

export interface ApplyResult {
  readonly state: BattleState;
  readonly events: readonly EngineEvent[];
}

/** The engine API over one card catalog. Every function is pure. */
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
}

export class IllegalAction extends Error {}

export function createEngine(catalog: EngineCatalog): Engine {
  return {
    catalog,
    createBattle(init, source, observe) {
      const start = initialState(init, catalog);
      return runToDecision(
        start,
        { kind: "beginBattle", dreamwell: init.dreamwell },
        source,
        catalog,
        observe,
      );
    },
    decision(state) {
      return decision(state, catalog);
    },
    legalActions(state, side) {
      return legalActions(state, catalog, side);
    },
    apply(state, side, action, source, observe) {
      if (!legalActions(state, catalog, side).some((legal) => actionsEqual(legal, action))) {
        throw new IllegalAction(`Illegal action for ${side}: ${JSON.stringify(action)}`);
      }
      return runToDecision(state, stepForAction(state, action), source, catalog, observe);
    },
    view(state, side) {
      return view(state, side);
    },
  };
}
