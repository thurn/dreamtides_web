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

const temporaryDirectories = [];

function lockFixture() {
  const directory = mkdtempSync(join(tmpdir(), "quest-review-lock-"));
  temporaryDirectories.push(directory);
  return join(directory, "review.lock");
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

  it("does not remove a replacement lock after inspecting a stale owner", () => {
    const lockPath = lockFixture();
    tryCreateReviewLock(lockPath, { pid: 101, task: "lint" });
    const staleSnapshot = snapshotReviewLock(lockPath);

    unlinkSync(lockPath);
    tryCreateReviewLock(lockPath, { pid: 202, task: "test" });

    expect(removeReviewLockIfUnchanged(lockPath, staleSnapshot)).toBe(false);
    expect(readReviewLockOwner(lockPath)).toEqual({ pid: 202, task: "test" });
  });
});
