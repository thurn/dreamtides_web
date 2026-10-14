/** Conditions share one evaluation with the characteristics reader of their context. */
import type { EngineCatalog } from "../catalog";
import { filterSubjectOf, matchesFilter } from "../continuous/characteristics";
import type { AbilitySource, Side } from "../state/ids";
import { sourceInstance } from "../state/ids";
import type { BattleState } from "../state/types";
import { matchingCharactersWith, resolvePlayer, zoneCountWith, type CharacteristicsReader, type SourceSparkReader, type SourceCountersReader } from "./selectors";
import { evaluateValue } from "./values";
import type { Condition } from "./types";

/** The condition's controller, source, and captured stack-item bindings. */
export interface ConditionScope {
  readonly controller: Side;
  readonly source: AbilitySource;
  readonly optionalPaid: readonly boolean[];
  /** Resolving X; scopes without a resolving binding omit it and read stored source X. */
  readonly x?: number | null;
  /** Resolving source spark; omitted by static and other non-resolving scopes. */
  readonly sourceSpark?: SourceSparkReader;
  /** Only this resolving activation may supply its own payment-departure count. */
  readonly sourceCounters?: SourceCountersReader;
}

/** Resolving conditions read effective characteristics; static conditions read the layers before their effect. */
export function conditionHoldsWith(
  state: BattleState,
  catalog: EngineCatalog,
  read: CharacteristicsReader,
  condition: Condition,
  scope: ConditionScope,
): boolean {
  switch (condition.cond) {
    case "thisTurn": {
      const count = evaluateValue(state, condition.count, { controller: scope.controller, source: scope.source, x: null, count: () => 0, countCards: () => 0 });
      return count >= condition.atLeast && (condition.atMost === undefined || count <= condition.atMost);
    }
    case "controls": {
      const count = matchingCharactersWith(state, catalog, read, condition.selector, scope.controller, scope.source, scope.x ?? undefined, scope.sourceSpark, scope.sourceCounters).length;
      return count >= condition.atLeast && (condition.atMost === undefined || count <= condition.atMost);
    }
    case "energyAtLeast":
      return state.sides[scope.controller].currentEnergy >= condition.amount;
    case "turnOf":
      return state.turn.active === resolvePlayer(scope.controller, condition.player);
    case "costPaid":
      return scope.optionalPaid[condition.optional] === true;
    case "sourceWasReclaimed": {
      const instance = sourceInstance(scope.source);
      return instance !== null && state.instances[instance]?.status.playedViaReclaim === true;
    }
    case "sourceIn": {
      const instance = sourceInstance(scope.source);
      return instance === null ? condition.zone === "play" : state.instances[instance]?.zone === condition.zone;
    }
    case "topOfDeck": {
      const top = state.sides[resolvePlayer(scope.controller, condition.player)].deck[0];
      return top !== undefined && matchesFilter(filterSubjectOf(state, catalog, top, read(top)), condition.filter);
    }
    case "cardsIn": {
      const filter = condition.filter;
      const count = condition.zone === "void"
        ? zoneCountWith(state, catalog, read, { value: "countCards", zone: "void", player: condition.player, filter: filter ?? {} }, scope.controller)
        : filter === undefined
          ? zoneCountWith(state, catalog, read, { value: "countCards", zone: condition.zone, player: condition.player }, scope.controller)
          : state.sides[resolvePlayer(scope.controller, condition.player)][condition.zone]
            .filter((id) => matchesFilter(filterSubjectOf(state, catalog, id, read(id)), filter)).length;
      return (condition.atLeast === undefined || count >= condition.atLeast) &&
        (condition.atMost === undefined || count <= condition.atMost);
    }
  }
}
