/** Evaluating value expressions, for resolving effects and static abilities alike. */
import { supportersOf } from "../continuous/support";
import type { AbilitySource, Side } from "../state/ids";
import { sourceInstance } from "../state/ids";
import type { BattleState } from "../state/types";
import { resolvePlayer } from "./selectors";
import type { CardCountValue, CharacterSelector, MovedCardRef, ValueExpr } from "./types";

/**
 * What a value reads besides the state: its controller, its source, X, how to
 * count characters and cards in a zone, and, in a resolving effect, the
 * copiable costs captured for the cards its nodes moved. Outside one (a static
 * ability) no node has moved a card, so `movedCosts` is absent. A static
 * ability's counts read the characteristics of the layers before its own.
 */
export interface ValueScope {
  readonly controller: Side;
  readonly source: AbilitySource;
  readonly x: number | null;
  /** The scoring trigger's captured challenge award, absent outside its resolution. */
  readonly scored?: number | null;
  count(selector: CharacterSelector): number;
  countCards(count: CardCountValue): number;
  movedCosts?(ref: MovedCardRef): readonly number[];
  /** The source character's effective spark while it is in play, else 0; absent outside a resolving effect. */
  sourceSpark?(): number;
}

/** "This character's ✦", read as a resolving effect reads it (rules § Spark → This character's ✦). */
export function thisCharacterSpark(): ValueExpr {
  return { value: "sourceSpark" };
}

/** The number a value expression stands for now. */
export function evaluateValue(state: BattleState, value: ValueExpr, scope: ValueScope): number {
  if (typeof value === "number") return value;
  switch (value.value) {
    case "scored":
      return scope.scored ?? 0;
    case "x":
      return scope.x ?? 0;
    case "costOf":
      return (scope.movedCosts?.(value.of) ?? []).reduce((total, cost) => total + cost, 0);
    case "plus":
      return evaluateValue(state, value.of, scope) + value.amount;
    case "count":
      return scope.count(value.of);
    case "countCards":
      return scope.countCards(value);
    case "handSize":
      return state.sides[resolvePlayer(scope.controller, value.player)].hand.length;
    case "supporting": {
      const self = sourceInstance(scope.source);
      return self === null ? 0 : supportersOf(state, self).length;
    }
    case "sourceSpark":
      if (scope.sourceSpark === undefined) throw new Error("A static ability cannot read this character's ✦");
      return scope.sourceSpark();
    case "times":
      return evaluateValue(state, value.of, scope) * value.factor;
    case "locked":
      return evaluateValue(state, value.of, scope);
  }
}
