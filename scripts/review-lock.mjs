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
import { thrownField } from "./lib/node-errors.mjs";

/**
 * The holder of the repository review slot. Any extra step fields recorded by
 * `review.mjs` ride along.
 *
 * @typedef {{
 *   pid?: number,
 *   childPid?: number,
 *   cwd?: string,
 *   task?: string,
 *   step?: string,
 *   startedAt?: string,
 * }} ReviewLockOwner
 */

/**
 * The filesystem identity of an inspected lock.
 *
 * @typedef {{
 *   dev: bigint,
 *   ino: bigint,
 *   ctimeNs: bigint,
 *   ownerContents: string | null,
 *   isDirectory: boolean,
 * }} ReviewLockSnapshot
 */

/** @param {string} lockPath */
function temporaryOwnerPath(lockPath) {
  return `${lockPath}.${process.pid}.${randomUUID()}.tmp`;
}

/** @param {ReviewLockOwner} owner */
function serializedOwner(owner) {
  return `${JSON.stringify(owner, null, 2)}\n`;
}

/** @param {string} path */
function removeTemporaryOwner(path) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (thrownField(error, "code") !== "ENOENT") throw error;
  }
}

/**
 * Atomically claims an absent lock path with a fully-written owner record.
 * Linking a private temporary file means observers can never see a present
 * lock with a missing or partially-written owner.
 *
 * @param {string} lockPath
 * @param {ReviewLockOwner} owner
 * @returns {boolean}
 */
export function tryCreateReviewLock(lockPath, owner) {
  const temporaryPath = temporaryOwnerPath(lockPath);
  writeFileSync(temporaryPath, serializedOwner(owner), { flag: "wx" });
  try {
    linkSync(temporaryPath, lockPath);
    return true;
  } catch (error) {
    if (thrownField(error, "code") === "EEXIST") return false;
    throw error;
  } finally {
    removeTemporaryOwner(temporaryPath);
  }
}

/**
 * Replaces a held lock's owner metadata without exposing a partial record.
 *
 * @param {string} lockPath
 * @param {ReviewLockOwner} owner
 */
export function replaceReviewLockOwner(lockPath, owner) {
  const temporaryPath = temporaryOwnerPath(lockPath);
  writeFileSync(temporaryPath, serializedOwner(owner), { flag: "wx" });
  try {
    renameSync(temporaryPath, lockPath);
  } finally {
    removeTemporaryOwner(temporaryPath);
  }
}

/**
 * An owner record as written by `serializedOwner`. Anything that is not a JSON
 * object reads as no owner.
 *
 * @param {string} text
 * @returns {ReviewLockOwner | null}
 */
function parseOwner(text) {
  /** @type {unknown} */
  const parsed = JSON.parse(text);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? /** @type {ReviewLockOwner} */ (parsed)
    : null;
}

/**
 * @param {string} lockPath
 * @returns {ReviewLockOwner | null}
 */
export function readReviewLockOwner(lockPath) {
  try {
    return parseOwner(readFileSync(lockPath, "utf8"));
  } catch {
    // Compatibility with a stale lock left by the earlier directory format.
    try {
      return parseOwner(readFileSync(join(lockPath, "owner.json"), "utf8"));
    } catch {
      return null;
    }
  }
}

/**
 * @param {string} lockPath
 * @returns {ReviewLockSnapshot | null}
 */
export function snapshotReviewLock(lockPath) {
  try {
    const stat = lstatSync(lockPath, { bigint: true });
    const isDirectory = stat.isDirectory();
    let ownerContents = null;
    try {
      ownerContents = readFileSync(
        isDirectory ? join(lockPath, "owner.json") : lockPath,
        "utf8",
      );
    } catch {
      // A corrupt legacy lock can still be identified and removed by its
      // filesystem metadata.
    }
    return {
      dev: stat.dev,
      ino: stat.ino,
      ctimeNs: stat.ctimeNs,
      ownerContents,
      isDirectory,
    };
  } catch (error) {
    if (thrownField(error, "code") === "ENOENT") return null;
    throw error;
  }
}

/**
 * Removes a stale lock only if the path still names the exact lock that was
 * inspected. Linux can immediately reuse an unlinked inode, so the change time
 * and serialized owner record are part of the identity as well.
 *
 * @param {string} lockPath
 * @param {ReviewLockSnapshot | null} snapshot
 * @returns {boolean}
 */
export function removeReviewLockIfUnchanged(lockPath, snapshot) {
  if (snapshot === null) return false;
  const current = snapshotReviewLock(lockPath);
  if (
    current === null ||
    current.dev !== snapshot.dev ||
    current.ino !== snapshot.ino ||
    current.ctimeNs !== snapshot.ctimeNs ||
    current.ownerContents !== snapshot.ownerContents
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
