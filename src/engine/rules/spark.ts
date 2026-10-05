import type { EngineCatalog } from "../catalog";
import type { InstanceId } from "../state/ids";
import type { BattleState } from "../state/types";
import { floatingSpark } from "./floating";
import { instanceOf } from "./zones";

/**
 * A character's effective spark: base plus gained spark, permanent and with
 * a duration, never below 0. A variable-spark character's base is the X paid
 * for it while in play, and 0 elsewhere.
 */
export function effectiveSpark(
  state: BattleState,
  catalog: EngineCatalog,
  id: InstanceId,
): number {
  const instance = instanceOf(state, id);
  const printed = catalog.card(instance.cardId).spark;
  const base = printed === "x" ? (instance.status.x ?? 0) : (printed ?? 0);
  return Math.max(0, base + instance.status.gainedSpark + floatingSpark(state, id));
}
