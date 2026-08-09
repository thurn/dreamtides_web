// Deterministic helpers for resolving historical draft records from stable card
// UUIDs onto the v2 card numbers used by corpus-backed opponent construction.

import type { DraftRecord } from "../data/cards-v2-database.ts";

/**
 * Resolve a list of card ids to card numbers via `idIndex`, dropping ids the
 * index does not know and deduping on first occurrence (so a number appears at
 * most once, in the order its id was first seen).
 */
export function resolveCardIds(
  ids: readonly string[],
  idIndex: ReadonlyMap<string, number>,
): number[] {
  const seen = new Set<number>();
  const numbers: number[] = [];
  for (const id of ids) {
    const num = idIndex.get(id);
    if (num === undefined || seen.has(num)) continue;
    seen.add(num);
    numbers.push(num);
  }
  return numbers;
}

/**
 * Resolve a record's trimmed packs from card ids to card numbers. The bundle
 * already holds exactly the trimmed packs, so this does NOT re-trim; it only maps
 * each pack's ids through `idIndex`, dropping unresolved ids and deduping within
 * each pack on first occurrence. Pack order and count are preserved.
 */
export function buildPackSequence(
  record: DraftRecord,
  idIndex: ReadonlyMap<string, number>,
): number[][] {
  return record.packIds.map((pack) => resolveCardIds(pack, idIndex));
}
