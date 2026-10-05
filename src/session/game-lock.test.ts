// The one-writer guard: while one tab holds a game's lock, another tab's open
// of that game fails without waiting; releasing frees it, games are guarded
// independently, and without Web Locks every open succeeds. Runs on a fake
// lock manager with the Web Locks `ifAvailable` semantics.

import { describe, expect, it } from "vitest";
import { parseGameId } from "../types/identifiers";
import { acquireGameLock, type GameLockManager } from "./game-lock";

/** Exclusive `ifAvailable` locks: held until the callback's promise settles. */
function createFakeLockManager(): GameLockManager & { held: Set<string> } {
  const held = new Set<string>();
  return {
    held,
    request(name, _options, callback) {
      if (held.has(name)) return callback(null);
      held.add(name);
      return callback({ name }).finally(() => held.delete(name));
    },
  };
}

const GAME = parseGameId("lockd1");
const OTHER_GAME = parseGameId("lockd2");

describe("acquireGameLock", () => {
  it("lets one holder write a game until it releases", async () => {
    const locks = createFakeLockManager();
    const first = await acquireGameLock(GAME, locks);
    expect(first).not.toBeNull();
    expect(await acquireGameLock(GAME, locks)).toBeNull();
    expect(await acquireGameLock(OTHER_GAME, locks)).not.toBeNull();

    first?.release();
    first?.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(locks.held.size).toBe(1);
    const next = await acquireGameLock(GAME, locks);
    expect(next).not.toBeNull();
    expect(await acquireGameLock(GAME, locks)).toBeNull();
  });

  it("opens every game without a lock manager", async () => {
    expect(await acquireGameLock(GAME, undefined)).not.toBeNull();
    expect(await acquireGameLock(GAME, undefined)).not.toBeNull();
  });
});
