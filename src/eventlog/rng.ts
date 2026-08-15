import { sha256 } from "js-sha256";
import type { JourneySeed } from "../types/journey-seed";

/**
 * Creates a deterministic uniform [0, 1) random stream keyed by
 * `(seed, seq)`. The returned function is a pure keyed lookup: calling it
 * with the same `drawIndex` always returns the same value, and different
 * `drawIndex` values (or different `seed`/`seq`) yield independent draws.
 * This lets every client folding the same event log compute identical
 * random draws for a given event without any shared mutable state.
 */
export function eventRng(seed: JourneySeed, seq: number): (drawIndex: number) => number {
  return (drawIndex: number) => {
    const digest = sha256(`${seed}|${seq}|${drawIndex}`);
    const value = Number.parseInt(digest.slice(0, 13), 16);
    return value / 0x10000000000000;
  };
}
