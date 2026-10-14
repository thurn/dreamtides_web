import { BACK_RANK_SIZE, FRONT_RANK_SIZE, type InstanceId, type Slot } from "../state/ids";
import type { BattleState } from "../state/types";
import { mergeable } from "./figments";
import { occupant, slotOf } from "./zones";

/** Position rules for one repositioning, independent of its action or ability timing. */
export function legalRepositionSlots(state: BattleState, card: InstanceId): Slot[] {
  const instance = state.instances[card];
  if (instance?.zone !== "play") return [];
  const from = slotOf(state, card);
  if (from === null) return [];
  const slots: Slot[] = [
    ...Array.from({ length: BACK_RANK_SIZE }, (_, index): Slot => ({ rank: "back", index })),
    ...Array.from({ length: FRONT_RANK_SIZE }, (_, index): Slot => ({ rank: "front", index })),
  ];
  return slots.filter((to) => {
    if (to.rank === from.rank && to.index === from.index) return false;
    // Exhausted sources cannot move forward, including into a compatible figment.
    if (instance.status.exhausted && to.rank === "front") return false;
    const other = occupant(state, instance.controller, to);
    if (other !== null && mergeable(state, card, other)) {
      return instance.status.exhausted === state.instances[other].status.exhausted;
    }
    // The other half of a swap cannot move an exhausted character forward either.
    if (other !== null && from.rank === "front" && state.instances[other].status.exhausted) return false;
    return true;
  });
}
