/** Conditions share one evaluation with the characteristics reader of their context. */
import type { EngineCatalog } from "../catalog";
import { filterSubjectOf, matchesFilter } from "../continuous/characteristics";
import type { AbilitySource, Side } from "../state/ids";
import { sourceInstance } from "../state/ids";
import type { BattleState } from "../state/types";
import { matchingCharactersWith, resolvePlayer, zoneCountWith, type CharacteristicsReader } from "./selectors";
import type { Condition } from "./types";

/** The condition's controller, source, and captured stack-item bindings. */
export interface ConditionScope {
  readonly controller: Side;
  readonly source: AbilitySource;
  readonly optionalPaid: readonly boolean[];
  /** Resolving X; static scopes omit it and retain stored source X. */
  readonly x?: number | null;
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
    case "controls": {
      const count = matchingCharactersWith(state, catalog, read, condition.selector, scope.controller, scope.source, scope.x ?? undefined).length;
      return count >= condition.atLeast && (condition.atMost === undefined || count <= condition.atMost);
    }
    case "energyAtLeast":
      return state.sides[scope.controller].currentEnergy >= condition.amount;
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
