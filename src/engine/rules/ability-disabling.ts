/** Selective disabling reads the same floating lifetime and condition for both ability kinds. */
import type { EngineCatalog } from "../catalog";
import { characteristics } from "../continuous/characteristics";
import { conditionHoldsWith } from "../dsl/conditions";
import type { InstanceId } from "../state/ids";
import type { BattleState } from "../state/types";

/** Whether an existing floating effect suppresses a new ability of `instance` now. */
export function abilitiesDisabled(state: BattleState, catalog: EngineCatalog, instance: InstanceId, kind: "triggered" | "activated"): boolean {
  let layers: ReturnType<typeof characteristics> | undefined;
  return state.floating.some((effect) => {
    const { change } = effect;
    return change.kind === "disableTriggers" && change.instance === instance &&
      (kind === "triggered" || change.mode === "triggeredAndActivated") &&
      (change.while === undefined || conditionHoldsWith(state, catalog,
        (id) => (layers ??= characteristics(state, catalog)).of(id), change.while,
        { controller: effect.controller, source: effect.source, optionalPaid: [] }));
  });
}
