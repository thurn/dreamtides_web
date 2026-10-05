import { hashString } from "./hash";
import type { BattleState } from "./types";

/**
 * Named random streams. Each stream is a counter: draw `n` of stream `s` is a
 * hash of `(seed, s, n)`, so a new random effect never perturbs another
 * stream, and the state stays a plain JSON record of counters.
 *
 * Streams: `shuffle:<side>`, `dreamwell`, `random:<purpose>`.
 */
export function drawRandom(state: BattleState, stream: string): number {
  const index = state.rng[stream] ?? 0;
  state.rng[stream] = index + 1;
  return hashString(`${state.seed}|${stream}|${String(index)}`) / 2 ** 53;
}

/** A uniform integer in `[0, bound)`. */
export function drawIndex(state: BattleState, stream: string, bound: number): number {
  return Math.floor(drawRandom(state, stream) * bound);
}

/** Fisher–Yates shuffle in place, drawing from `stream`. */
export function shuffleInPlace<T>(state: BattleState, stream: string, items: T[]): void {
  for (let index = items.length - 1; index > 0; index--) {
    const other = drawIndex(state, stream, index + 1);
    const swap = items[index];
    items[index] = items[other];
    items[other] = swap;
  }
}
