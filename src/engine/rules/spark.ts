import type { EngineCatalog } from "../catalog";
import { characteristicsOf } from "../continuous/characteristics";
import type { InstanceId } from "../state/ids";
import type { BattleState } from "../state/types";

/**
 * A character's effective spark from the layer evaluation: its base spark
 * (the X paid for a variable-spark character while in play, 0 elsewhere)
 * after base-spark setting, plus gained spark, spark with a duration,
 * anthems, and Support, never below 0. An event has none.
 */
export function effectiveSpark(
  state: BattleState,
  catalog: EngineCatalog,
  id: InstanceId,
): number {
  return characteristicsOf(state, catalog, id).spark ?? 0;
}
