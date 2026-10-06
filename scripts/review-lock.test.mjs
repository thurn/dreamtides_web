// @vitest-environment node

import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readReviewLockOwner,
  removeReviewLockIfUnchanged,
  replaceReviewLockOwner,
  snapshotReviewLock,
  tryCreateReviewLock,
} from "./review-lock.mjs";

/** @type {string[]} */
const temporaryDirectories = [];

function lockFixture() {
  const directory = mkdtempSync(join(tmpdir(), "journey-review-lock-"));
  temporaryDirectories.push(directory);
  return join(directory, "review.lock");
}

/**
 * The snapshot of a lock the test just created.
 *
 * @param {string} lockPath
 */
function presentSnapshot(lockPath) {
  const snapshot = snapshotReviewLock(lockPath);
  if (snapshot === null) throw new Error(`no lock at ${lockPath}`);
  return snapshot;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("review lock", () => {
  it("publishes a complete owner record as part of the exclusive claim", () => {
    const lockPath = lockFixture();

    expect(tryCreateReviewLock(lockPath, { pid: 101, task: "lint" })).toBe(true);
    expect(readReviewLockOwner(lockPath)).toEqual({ pid: 101, task: "lint" });
    expect(tryCreateReviewLock(lockPath, { pid: 202, task: "test" })).toBe(false);
    expect(readReviewLockOwner(lockPath)).toEqual({ pid: 101, task: "lint" });
  });

  it("replaces owner metadata atomically", () => {
    const lockPath = lockFixture();
    tryCreateReviewLock(lockPath, { pid: 101, task: "all" });

    replaceReviewLockOwner(lockPath, {
      pid: 101,
      childPid: 303,
      task: "all",
      step: "typecheck",
    });

    expect(readReviewLockOwner(lockPath)).toEqual({
      pid: 101,
      childPid: 303,
      task: "all",
      step: "typecheck",
    });
  });

  it("does not remove a replacement lock when its inode is reused", () => {
    const lockPath = lockFixture();
    tryCreateReviewLock(lockPath, { pid: 101, task: "lint" });
    const staleSnapshot = presentSnapshot(lockPath);

    unlinkSync(lockPath);
    tryCreateReviewLock(lockPath, { pid: 202, task: "test" });
    const replacementSnapshot = presentSnapshot(lockPath);
    const reusedInodeSnapshot = {
      ...staleSnapshot,
      dev: replacementSnapshot.dev,
      ino: replacementSnapshot.ino,
    };

    expect(removeReviewLockIfUnchanged(lockPath, reusedInodeSnapshot)).toBe(
      false,
    );
    expect(readReviewLockOwner(lockPath)).toEqual({ pid: 202, task: "test" });
  });
});
