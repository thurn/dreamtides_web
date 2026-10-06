/**
 * Support adjacency on the staggered play area (rules § The Play Area):
 * back-rank `Bi` supports front-rank `F(i-1)` and `Fi` wherever they exist,
 * so `Fj` is supported by `Bj` and `B(j+1)`.
 */
import { occupant, slotOf } from "../rules/zones";
import type { InstanceId } from "../state/ids";
import { BACK_RANK_SIZE, FRONT_RANK_SIZE } from "../state/ids";
import type { BattleState } from "../state/types";

/** The front-rank indices back-rank index `back` supports. */
export function supportedFrontIndices(back: number): number[] {
  return [back - 1, back].filter((front) => front >= 0 && front < FRONT_RANK_SIZE);
}

/** The back-rank indices supporting front-rank index `front`. */
export function supportingBackIndices(front: number): number[] {
  return [front, front + 1].filter((back) => back >= 0 && back < BACK_RANK_SIZE);
}

/** The characters `id` supports: none unless it is in its controller's back rank. */
export function supportedBy(state: BattleState, id: InstanceId): InstanceId[] {
  const instance = state.instances[id];
  const slot = instance?.zone === "play" ? slotOf(state, id) : null;
  if (instance === undefined || slot?.rank !== "back") return [];
  return supportedFrontIndices(slot.index).flatMap((index) => {
    const supported = occupant(state, instance.controller, { rank: "front", index });
    return supported === null ? [] : [supported];
  });
}

/**
 * The characters supporting `id` (C9): every character in a back-rank
 * position that supports its front-rank position, with or without the
 * Support keyword; none while it is not in the front rank.
 */
export function supportersOf(state: BattleState, id: InstanceId): InstanceId[] {
  const instance = state.instances[id];
  const slot = instance?.zone === "play" ? slotOf(state, id) : null;
  if (instance === undefined || slot?.rank !== "front") return [];
  return supportingBackIndices(slot.index).flatMap((index) => {
    const supporter = occupant(state, instance.controller, { rank: "back", index });
    return supporter === null ? [] : [supporter];
  });
}
