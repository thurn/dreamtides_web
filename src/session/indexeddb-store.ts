// The browser `KeyValueStore`: one IndexedDB database holding one object store
// of out-of-line string keys. Each local game owns the keyspace under its id
// (see `game-repository.ts`), so games never share records.

import type { KeyValueEntry, KeyValueStore } from "./key-value-store";

const DATABASE_VERSION = 1;
const RECORDS_STORE = "records";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

/** Opens (creating on first use) the named database as a `KeyValueStore`. */
export async function openIndexedDbKeyValueStore(
  factory: IDBFactory,
  databaseName: string,
): Promise<KeyValueStore> {
  const openRequest = factory.open(databaseName, DATABASE_VERSION);
  openRequest.onupgradeneeded = () => {
    if (!openRequest.result.objectStoreNames.contains(RECORDS_STORE)) {
      openRequest.result.createObjectStore(RECORDS_STORE);
    }
  };
  const database = await requestResult(openRequest);
  const range = (lower: string, upper: string): IDBKeyRange =>
    IDBKeyRange.bound(lower, upper, false, true);

  return {
    async get(key) {
      const transaction = database.transaction(RECORDS_STORE, "readonly");
      return requestResult<unknown>(
        transaction.objectStore(RECORDS_STORE).get(key),
      );
    },
    async getRange(lower, upper) {
      const store = database
        .transaction(RECORDS_STORE, "readonly")
        .objectStore(RECORDS_STORE);
      const [keys, values] = await Promise.all([
        requestResult(store.getAllKeys(range(lower, upper))),
        requestResult(store.getAll(range(lower, upper))),
      ]);
      return keys.map((key, index): KeyValueEntry => {
        if (typeof key !== "string") {
          throw new Error("Local game records use string keys.");
        }
        return [key, values[index]];
      });
    },
    async putAll(entries) {
      const transaction = database.transaction(RECORDS_STORE, "readwrite");
      const store = transaction.objectStore(RECORDS_STORE);
      for (const [key, value] of entries) store.put(value, key);
      await transactionDone(transaction);
    },
    async deleteRanges(ranges) {
      const transaction = database.transaction(RECORDS_STORE, "readwrite");
      const store = transaction.objectStore(RECORDS_STORE);
      for (const [lower, upper] of ranges) store.delete(range(lower, upper));
      await transactionDone(transaction);
    },
  };
}
