// Small deterministic helpers for the record-replay draft: choosing which
// bundled record to replay, and resolving a record's card NAMES onto the v2 card
// NUMBERS the draft engine consumes. All pure — `selectRecordIndex` is the only
// stochastic piece and it is fully determined by its seed.

import type { DraftRecord } from "../../data/cards-v2-database.ts";
import { makeRng } from "../pool/rng.ts";

/**
 * Resolve a list of card names to card numbers via `nameIndex`, dropping names
 * the index does not know and deduping on first occurrence (so a number appears
 * at most once, in the order its name was first seen).
 */
export function resolveCardNames(
  names: readonly string[],
  nameIndex: ReadonlyMap<string, number>,
): number[] {
  const seen = new Set<number>();
  const numbers: number[] = [];
  for (const name of names) {
    const num = nameIndex.get(name);
    if (num === undefined || seen.has(num)) continue;
    seen.add(num);
    numbers.push(num);
  }
  return numbers;
}

/**
 * Deterministically pick which record to replay for a given seed. Uses the same
 * seeded PRNG as the pool generator so a seed reproduces the same draft. Returns
 * a valid index in `[0, recordCount)`, or 0 when there are no records.
 */
export function selectRecordIndex(seed: number, recordCount: number): number {
  if (recordCount <= 0) return 0;
  const rng = makeRng(seed);
  return Math.floor(rng() * recordCount);
}

/**
 * Resolve a record's 30 trimmed packs from card names to card numbers. The
 * bundle already holds exactly the trimmed packs, so this does NOT re-trim; it
 * only maps each pack's names through `nameIndex`, dropping unresolved names and
 * deduping within each pack on first occurrence. Pack order and count are
 * preserved.
 */
export function buildPackSequence(
  record: DraftRecord,
  nameIndex: ReadonlyMap<string, number>,
): number[][] {
  return record.packs.map((pack) => resolveCardNames(pack, nameIndex));
}
