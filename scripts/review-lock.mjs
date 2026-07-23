import { randomUUID } from "node:crypto";
import {
  linkSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

function temporaryOwnerPath(lockPath) {
  return `${lockPath}.${process.pid}.${randomUUID()}.tmp`;
}

function serializedOwner(owner) {
  return `${JSON.stringify(owner, null, 2)}\n`;
}

function removeTemporaryOwner(path) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

/**
 * Atomically claims an absent lock path with a fully-written owner record.
 * Linking a private temporary file means observers can never see a present
 * lock with a missing or partially-written owner.
 */
export function tryCreateReviewLock(lockPath, owner) {
  const temporaryPath = temporaryOwnerPath(lockPath);
  writeFileSync(temporaryPath, serializedOwner(owner), { flag: "wx" });
  try {
    linkSync(temporaryPath, lockPath);
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  } finally {
    removeTemporaryOwner(temporaryPath);
  }
}

/** Replaces a held lock's owner metadata without exposing a partial record. */
export function replaceReviewLockOwner(lockPath, owner) {
  const temporaryPath = temporaryOwnerPath(lockPath);
  writeFileSync(temporaryPath, serializedOwner(owner), { flag: "wx" });
  try {
    renameSync(temporaryPath, lockPath);
  } finally {
    removeTemporaryOwner(temporaryPath);
  }
}

export function readReviewLockOwner(lockPath) {
  try {
    return JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    // Compatibility with a stale lock left by the earlier directory format.
    try {
      return JSON.parse(readFileSync(join(lockPath, "owner.json"), "utf8"));
    } catch {
      return null;
    }
  }
}

export function snapshotReviewLock(lockPath) {
  try {
    const stat = lstatSync(lockPath);
    return { dev: stat.dev, ino: stat.ino, isDirectory: stat.isDirectory() };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Removes a stale lock only if the path still names the inode that was
 * inspected. This prevents one waiter from deleting a new owner's lock after
 * another waiter already removed and replaced the stale record.
 */
export function removeReviewLockIfUnchanged(lockPath, snapshot) {
  if (snapshot === null) return false;
  const current = snapshotReviewLock(lockPath);
  if (
    current === null ||
    current.dev !== snapshot.dev ||
    current.ino !== snapshot.ino
  ) {
    return false;
  }

  if (current.isDirectory) {
    rmSync(lockPath, { recursive: true, force: true });
  } else {
    unlinkSync(lockPath);
  }
  return true;
}
