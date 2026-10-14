/** Evaluating value expressions, for resolving effects and static abilities alike. */
import { playedThisTurn, charactersPlayedCountThisTurn, discardedCountThisTurn, leftPlayCountThisTurn, dissolvedCountThisTurn, abandonedCountThisTurn, materializedCountThisTurn } from "../rules/turn-log";
import { supportersOf } from "../continuous/support";
import type { AbilitySource, Side } from "../state/ids";
import { sourceInstance } from "../state/ids";
import type { BattleState } from "../state/types";
import { resolvePlayer, type SourceSparkReader } from "./selectors";
import type { CardCountValue, CharacterSelector, DiscardCountValue, MovedCardRef, SourceSparkValue, ValueExpr } from "./types";

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
  /** The discard trigger's captured occasion count; absent outside its resolution. */
  readonly discardedCount?: number | null;
  /** Present only in a resolving context; null means no captured subject. */
  readonly subjectCost?: number | null;
  /** Present only in a resolving context; null means no captured lookback subject. */
  readonly subjectSpark?: number | null;
  count(selector: CharacterSelector): number;
  countCards(count: CardCountValue): number;
  movedCosts?(ref: MovedCardRef): readonly number[];
  /** Instruction-local discard snapshot; absent outside a resolving effect. */
  discardCount?(value: DiscardCountValue): number;
  /** "This character's ✦" (`SourceSparkReader`); absent outside a resolving effect. */
  readonly sourceSpark?: SourceSparkReader;
}

/**
 * "This character's ✦", read as a resolving effect reads it (rules § Spark →
 * This character's ✦): a value, or a selector's or void target's bound.
 */
export function thisCharacterSpark(): SourceSparkValue {
  return { value: "sourceSpark" };
}

/** The number a value expression stands for now. */
export function evaluateValue(state: BattleState, value: ValueExpr, scope: ValueScope): number {
  if (typeof value === "number") return value;
  switch (value.value) {
    case "playedThisTurn": return playedThisTurn(state, resolvePlayer(scope.controller, value.player));
    case "charactersPlayedThisTurn": return charactersPlayedCountThisTurn(state, resolvePlayer(scope.controller, value.player));
    case "discardedThisTurn": return discardedCountThisTurn(state, resolvePlayer(scope.controller, value.player));
    case "leftPlayThisTurn": return leftPlayCountThisTurn(state, resolvePlayer(scope.controller, value.player));
    case "dissolvedThisTurn": return dissolvedCountThisTurn(state, resolvePlayer(scope.controller, value.player));
    case "abandonedThisTurn": return abandonedCountThisTurn(state, resolvePlayer(scope.controller, value.player));
    case "materializedThisTurn": return materializedCountThisTurn(state, resolvePlayer(scope.controller, value.player), value.figment);
    case "subjectSpark":
      if (scope.subjectSpark === undefined) throw new Error("A static ability cannot read a triggering subject spark");
      return scope.subjectSpark ?? 0;
    case "subjectCost":
      if (scope.subjectCost === undefined) throw new Error("A static ability cannot read a triggering subject cost");
      return scope.subjectCost ?? 0;
    case "scored":
      return scope.scored ?? 0;
    case "discardedCount":
      return scope.discardedCount ?? 0;
    case "x":
      return scope.x ?? 0;
    case "discardCount":
      return scope.discardCount?.(value) ?? 0;
    case "costOf":
      return (scope.movedCosts?.(value.of) ?? []).reduce((total, cost) => total + cost, 0);
    case "plus":
      return evaluateValue(state, value.of, scope) + value.amount;
    case "count":
      return value.groupSize === undefined ? scope.count(value.of) : Math.floor(scope.count(value.of) / value.groupSize);
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
