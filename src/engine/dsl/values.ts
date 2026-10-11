/** Evaluating value expressions, for resolving effects and static abilities alike. */
import { supportersOf } from "../continuous/support";
import type { AbilitySource, Side } from "../state/ids";
import { sourceInstance } from "../state/ids";
import type { BattleState } from "../state/types";
import { resolvePlayer } from "./selectors";
import type { CharacterSelector, MovedCardRef, ValueExpr } from "./types";

/**
 * What a value reads besides the state: its controller, its source, X, how to
 * count characters, and, in a resolving effect, the copiable costs captured for
 * the cards its nodes moved. Outside one (a static ability) no node has moved
 * a card, so `movedCosts` is absent.
 */
export interface ValueScope {
  readonly controller: Side;
  readonly source: AbilitySource;
  readonly x: number | null;
  count(selector: CharacterSelector): number;
  movedCosts?(ref: MovedCardRef): readonly number[];
}

/** The number a value expression stands for now. */
export function evaluateValue(state: BattleState, value: ValueExpr, scope: ValueScope): number {
  if (typeof value === "number") return value;
  switch (value.value) {
    case "x":
      return scope.x ?? 0;
    case "costOf":
      return (scope.movedCosts?.(value.of) ?? []).reduce((total, cost) => total + cost, 0);
    case "plus":
      return evaluateValue(state, value.of, scope) + value.amount;
    case "count":
      return scope.count(value.of);
    case "handSize":
      return state.sides[resolvePlayer(scope.controller, value.player)].hand.length;
    case "supporting": {
      const self = sourceInstance(scope.source);
      return self === null ? 0 : supportersOf(state, self).length;
    }
    case "times":
      return evaluateValue(state, value.of, scope) * value.factor;
    case "locked":
      return evaluateValue(state, value.of, scope);
  }
}
