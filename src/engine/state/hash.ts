import type { BattleState } from "./types";

/** A stable hash of a complete battle state. */
export type StateHash = string & { readonly __brand: "EngineStateHash" };

/**
 * Incremental cyrb53: feeding text in pieces yields the same hash as one
 * `hashString` call over the concatenation.
 */
class Hasher {
  private h1: number;
  private h2: number;

  constructor(seed = 0) {
    this.h1 = 0xdeadbeef ^ seed;
    this.h2 = 0x41c6ce57 ^ seed;
  }

  code(code: number): void {
    this.h1 = Math.imul(this.h1 ^ code, 2654435761);
    this.h2 = Math.imul(this.h2 ^ code, 1597334677);
  }

  text(text: string): void {
    let h1 = this.h1;
    let h2 = this.h2;
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    this.h1 = h1;
    this.h2 = h2;
  }

  /** A JSON string literal, escaped exactly as `JSON.stringify` escapes it. */
  string(text: string): void {
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code < 0x20 || code === 0x22 || code === 0x5c || (code >= 0xd800 && code <= 0xdfff)) {
        this.text(JSON.stringify(text));
        return;
      }
    }
    this.code(0x22);
    this.text(text);
    this.code(0x22);
  }

  digest(): number {
    let h1 = this.h1;
    let h2 = this.h2;
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
}

/**
 * A 53-bit string hash (cyrb53). Deterministic across platforms and fast
 * enough to run after every step in the fuzzer.
 */
export function hashString(text: string, seed = 0): number {
  const hasher = new Hasher(seed);
  hasher.text(text);
  return hasher.digest();
}

/** Serializes a battle state as plain JSON. */
export function serializeState(state: BattleState): string {
  return JSON.stringify(state);
}

export function deserializeState(text: string): BattleState {
  return JSON.parse(text) as BattleState;
}

/**
 * Feeds the canonical JSON of plain data: `JSON.stringify` output with object
 * keys in sorted order, so values equal as data encode identically whatever
 * their key insertion order. Like `JSON.stringify`, it skips `undefined`
 * object entries and writes an `undefined` array element as `null`.
 */
function feedCanonical(hasher: Hasher, value: unknown): void {
  if (typeof value === "string") {
    hasher.string(value);
  } else if (typeof value === "number") {
    hasher.text(Number.isFinite(value) ? String(value) : "null");
  } else if (value === null || typeof value !== "object") {
    hasher.text(value === true ? "true" : value === false ? "false" : "null");
  } else if (Array.isArray(value)) {
    hasher.code(0x5b);
    for (let index = 0; index < value.length; index++) {
      if (index > 0) hasher.code(0x2c);
      feedCanonical(hasher, value[index]);
    }
    hasher.code(0x5d);
  } else {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    let first = true;
    hasher.code(0x7b);
    for (const key of keys) {
      const entry = record[key];
      if (entry === undefined || typeof entry === "function") continue;
      if (!first) hasher.code(0x2c);
      first = false;
      hasher.string(key);
      hasher.code(0x3a);
      feedCanonical(hasher, entry);
    }
    hasher.code(0x7d);
  }
}

/**
 * A stable hash of the complete state, as a hex string: the `hashString` of
 * its canonical JSON, so states equal as data hash equally.
 */
export function stateHash(state: BattleState): StateHash {
  const hasher = new Hasher();
  feedCanonical(hasher, state);
  return hasher.digest().toString(16).padStart(14, "0") as StateHash;
}

/** A deep copy that shares nothing with `state`. */
export function cloneState(state: BattleState): BattleState {
  return deserializeState(serializeState(state));
}
