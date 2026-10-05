import type { BattleState } from "./types";

/** A stable hash of a complete battle state. */
export type StateHash = string & { readonly __brand: "EngineStateHash" };

/**
 * A 53-bit string hash (cyrb53). Deterministic across platforms and fast
 * enough to run after every step in the fuzzer.
 */
export function hashString(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Serializes a battle state. The state is plain JSON, built in a deterministic key order. */
export function serializeState(state: BattleState): string {
  return JSON.stringify(state);
}

export function deserializeState(text: string): BattleState {
  return JSON.parse(text) as BattleState;
}

/** A stable hash of the complete state, as a hex string. */
export function stateHash(state: BattleState): StateHash {
  return hashString(serializeState(state)).toString(16).padStart(14, "0") as StateHash;
}

/** A deep copy that shares nothing with `state`. */
export function cloneState(state: BattleState): BattleState {
  return deserializeState(serializeState(state));
}
