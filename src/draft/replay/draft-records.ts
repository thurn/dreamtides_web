// Small deterministic helpers for the record-replay draft: choosing which
// bundled record to replay, and resolving a record's card IDS (lowercased stable
// UUIDs) onto the v2 card NUMBERS the draft engine consumes. Keying on ids keeps
// two distinct cards that share a display name apart. All pure —
// `selectRecordIndex` and `selectReplayRecordIndex` are the only stochastic
// pieces and both are fully determined by their seeds.

import type { DraftRecord } from "../../data/cards-v2-database.ts";
import { makeRng } from "../pool/rng.ts";

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
 * Deterministically pick which record to replay for a given seed. Uses the same
 * seeded PRNG as the pool generator so a seed reproduces the same draft. Returns
 * a valid index in `[0, recordCount)`, or 0 when there are no records.
 */
export function selectRecordIndex(seed: number, recordCount: number): number {
  if (recordCount <= 0) return 0;
  const rng = makeRng(seed);
  return Math.floor(rng() * recordCount);
}

/** How many best-matching records to seed-pick among (variety vs archetype fit). */
export const REPLAY_RECORD_SHORTLIST = 25;

/**
 * Choose which historical draft to replay, biased toward records whose served
 * packs offer the DreamAvatar's signature (archetype) cards, then seed-pick among
 * the best `shortlistSize` so each run still varies. Falls back to a uniform
 * seeded draw when there is no usable signal (no signatures, or none carry IDF
 * weight, or no idf map).
 *
 * Scoring: `score(rec) = Σ over rec.packIds of Σ over c in usableSig where pack
 * contains c of idf(c)`. Equivalently, for each usable signature card, its IDF
 * weight times the number of packs in the record that contain it. Packs that
 * duplicate a signature card contribute once per pack (not per copy), which
 * rewards breadth of coverage across packs over depth in a single pack.
 *
 * `signatureCardIds` and the per-card `idf` map are both keyed on lowercased
 * card ids, matching the record `packIds`, so two distinct cards that share a
 * display name never blend.
 *
 * Records are ranked by score DESC, tie-broken by original index ASC for
 * determinism. The `shortlist` is the top `min(shortlistSize, recordCount)`
 * entries. The final pick within the shortlist is seeded by `seed` via
 * `selectRecordIndex`, so the same seed always yields the same record and
 * different seeds yield variety within the matched shortlist.
 */
export function selectReplayRecordIndex(
  signatureCardIds: readonly string[],
  draftRecords: readonly DraftRecord[],
  idf: ReadonlyMap<string, number> | undefined,
  seed: number,
  shortlistSize = REPLAY_RECORD_SHORTLIST,
): number {
  if (draftRecords.length === 0) return 0;

  // Dedupe and filter to signatures with positive IDF weight.
  const seen = new Set<string>();
  const usableSig: string[] = [];
  for (const c of signatureCardIds) {
    if (seen.has(c)) continue;
    seen.add(c);
    if ((idf?.get(c) ?? 0) > 0) usableSig.push(c);
  }

  // No usable signal: fall back to uniform seeded draw.
  if (idf === undefined || usableSig.length === 0) {
    return selectRecordIndex(seed, draftRecords.length);
  }

  // Score each record: sum idf(c) × (number of packs in record containing c).
  const scored: { index: number; score: number }[] = draftRecords.map(
    (rec, index) => {
      let score = 0;
      for (const c of usableSig) {
        // usableSig holds only cards with positive idf weight (filtered above).
        const w = idf.get(c) ?? 0;
        // Count how many packs in this record contain c (using includes per pack).
        for (const pack of rec.packIds) {
          if (pack.includes(c)) score += w;
        }
      }
      return { index, score };
    },
  );

  // Rank by score DESC, tie-break by original index ASC.
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  // Take the top shortlistSize entries and seed-pick among them.
  const shortlist = scored.slice(0, Math.min(shortlistSize, draftRecords.length));
  return shortlist[selectRecordIndex(seed, shortlist.length)].index;
}

/**
 * Resolve a record's 30 trimmed packs from card ids to card numbers. The bundle
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
