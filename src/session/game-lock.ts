// One tab writes a local game. Both tabs on the same game would append the
// same seqs and overwrite each other's events, so opening a game first takes
// an exclusive Web Lock named for its id and holds it until the game closes.
// A tab that finds the lock held does not open the game. Where the Web Locks
// API is unavailable the guard is skipped and every open succeeds.

import type { RoomId } from "../types/identifiers";

/** The slice of the Web Locks `LockManager` the guard uses. */
export interface GameLockManager {
  request(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: unknown) => Promise<void>,
  ): Promise<unknown>;
}

/** A held game lock. Releasing twice is harmless. */
export interface GameLock {
  release(): void;
}

/** The lock name that guards `gameId`. */
export function gameLockName(gameId: RoomId): string {
  return `dreamtides-game:${gameId}`;
}

/** This browser's lock manager, or undefined where Web Locks is unavailable. */
export function browserGameLockManager(): GameLockManager | undefined {
  if (typeof navigator === "undefined" || navigator.locks === undefined) {
    return undefined;
  }
  const locks = navigator.locks;
  return {
    request: (name, options, callback) => locks.request(name, options, callback),
  };
}

const UNGUARDED: GameLock = { release: () => undefined };

/**
 * Take `gameId`'s lock without waiting. Resolves the held lock, or null when
 * another tab holds it. Without a lock manager every call succeeds.
 */
export function acquireGameLock(
  gameId: RoomId,
  locks: GameLockManager | undefined,
): Promise<GameLock | null> {
  if (locks === undefined) return Promise.resolve(UNGUARDED);
  return new Promise((resolve, reject) => {
    locks
      .request(
        gameLockName(gameId),
        { mode: "exclusive", ifAvailable: true },
        (lock) => {
          if (lock === null) {
            resolve(null);
            return Promise.resolve();
          }
          // The lock is held until the callback's promise settles.
          return new Promise<void>((release) => resolve({ release }));
        },
      )
      .catch(reject);
  });
}
