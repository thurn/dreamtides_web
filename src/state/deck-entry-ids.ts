import type { DeckEntry } from "../types/journey";

/**
 * Recovers the high-water mark for the `deck-N` entry id sequence from a
 * (possibly restored) deck. Without this, hydrating from `sessionStorage`
 * would reset the counter to `0` and the first newly-added card after
 * reload would collide with `deck-1` from the original session.
 */
export function deriveEntryIdCounter(deck: readonly DeckEntry[]): number {
  let max = 0;
  for (const entry of deck) {
    const match = /^deck-(\d+)$/.exec(entry.entryId);
    if (match === null) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > max) {
      max = value;
    }
  }
  return max;
}
