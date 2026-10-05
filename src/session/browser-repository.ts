// The game repository this browser uses: IndexedDB when the browser allows it,
// otherwise an in-memory store that keeps the current tab playable without
// persisting.

import { logEvent } from "../logging";
import { createGameRepository, type GameRepository } from "./game-repository";
import { openIndexedDbKeyValueStore } from "./indexeddb-store";
import { createMemoryKeyValueStore } from "./key-value-store";

const LOCAL_GAMES_DATABASE = "dreamtides-local-games";

let repository: Promise<GameRepository> | null = null;

/** The shared game repository of this tab, opened on first use. */
export function browserGameRepository(): Promise<GameRepository> {
  repository ??= openStore().then(createGameRepository);
  return repository;
}

async function openStore() {
  try {
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB is not available.");
    }
    return await openIndexedDbKeyValueStore(indexedDB, LOCAL_GAMES_DATABASE);
  } catch (error) {
    logEvent("local_game_storage_unavailable", {
      message: error instanceof Error ? error.message : String(error),
    });
    return createMemoryKeyValueStore();
  }
}
