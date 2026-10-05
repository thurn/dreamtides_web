import type { EngineCatalog } from "../catalog";
import type { InstanceId } from "../state/ids";
import type { BattleState } from "../state/types";
import { instanceOf } from "./zones";

/** A character's effective spark: base plus gained spark (permanent and this turn's), never below 0. */
export function effectiveSpark(
  state: BattleState,
  catalog: EngineCatalog,
  id: InstanceId,
): number {
  const instance = instanceOf(state, id);
  const base = catalog.card(instance.cardId).spark ?? 0;
  return Math.max(0, base + instance.status.gainedSpark + instance.status.turnSpark);
}
