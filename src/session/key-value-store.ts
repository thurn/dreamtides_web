// The storage interface under local games: an ordered string-keyed store with
// atomic batch writes. `indexeddb-store.ts` implements it in the browser;
// `createMemoryKeyValueStore` implements it for tests and for browsers that
// refuse IndexedDB.

/** One key and its structured-cloneable value. */
export type KeyValueEntry = readonly [key: string, value: unknown];

export interface KeyValueStore {
  /** The value stored at `key`, or `undefined`. */
  get(key: string): Promise<unknown>;
  /** Every entry with `lower <= key < upper`, in ascending key order. */
  getRange(lower: string, upper: string): Promise<KeyValueEntry[]>;
  /** Write every entry, all or nothing. */
  putAll(entries: readonly KeyValueEntry[]): Promise<void>;
}

/**
 * An in-memory `KeyValueStore`. Values are structured-cloned on the way in and
 * out, as IndexedDB does, so callers cannot alias stored data.
 */
export function createMemoryKeyValueStore(): KeyValueStore {
  const entries = new Map<string, unknown>();
  const keysInRange = (lower: string, upper: string): string[] =>
    [...entries.keys()].filter((key) => key >= lower && key < upper).sort();
  return {
    get: (key) =>
      Promise.resolve(
        entries.has(key) ? structuredClone(entries.get(key)) : undefined,
      ),
    getRange: (lower, upper) =>
      Promise.resolve(
        keysInRange(lower, upper).map(
          (key) => [key, structuredClone(entries.get(key))] as const,
        ),
      ),
    putAll: (batch) => {
      const cloned = batch.map(
        ([key, value]) => [key, structuredClone(value)] as const,
      );
      for (const [key, value] of cloned) entries.set(key, value);
      return Promise.resolve();
    },
  };
}
