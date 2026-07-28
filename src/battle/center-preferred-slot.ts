import { rankSlotIds, slotIndex } from "./types";

/**
 * Selects the existing empty rank slot nearest the supplied visual center.
 * Equidistant slots prefer the lower index so every caller folds the same
 * destination.
 */
export function centerPreferredEmptySlot<K extends string>(
  rank: Record<K, unknown>,
  centerIndex: number,
): K | null {
  return rankSlotIds(rank)
    .filter((slotId) => rank[slotId] === null)
    .sort(
      (left, right) =>
        Math.abs(slotIndex(left) - centerIndex) -
          Math.abs(slotIndex(right) - centerIndex) ||
        slotIndex(left) - slotIndex(right),
    )[0] ?? null;
}
