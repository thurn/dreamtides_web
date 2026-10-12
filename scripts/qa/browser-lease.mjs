import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BROWSER_QA_SLOTS } from "./browser-qa-capacity.mjs";

/**
 * The repository's browser admission path: slot 0's kernel lock, the lock a
 * single-slot peer takes, from which the queue and the other slots derive.
 *
 * @param {string} primaryCheckout
 */
export function browserLeasePath(primaryCheckout) {
  return join(primaryCheckout, "artifacts", "browser-qa.lock");
}

/**
 * Slot `slot`'s kernel lock. Slot 0 is the admission path itself; the others
 * live under the gitignored `artifacts/qa/`, where single-slot peers never
 * look.
 *
 * @param {string} path
 * @param {number} slot
 */
export function browserSlotPath(path, slot) {
  return slot === 0 ? path : join(dirname(path), "qa", `.${basename(path, ".lock")}.slot-${String(slot)}.lock`);
}

/**
 * A slot's ownership record. Slot 0's is the record single-slot peers read.
 *
 * @param {string} slotPath
 */
export function browserOwnerPath(slotPath) {
  return `${slotPath}.owner.json`;
}

/** @param {string} slotPath */
export const serverRecordPath = (slotPath) => `${slotPath}.server.json`;

/** Ownership records that independently protect the same slot. @param {string} slotPath */
const slotRecords = (slotPath) => [browserOwnerPath(slotPath), serverRecordPath(slotPath)].filter((path) => existsSync(path));

/**
 * The arrival queue of a lease: one `<sequence>-<pid>` ticket per waiting
 * process under gitignored `artifacts/qa/`. Modern tickets declare slot
 * capacity as JSON; empty legacy tickets need slot 0.
 *
 * @param {string} path
 */
export function browserLeaseQueuePath(path) {
  return join(dirname(path), "qa", `.${basename(path)}.queue`);
}

const TICKET = /^(\d{12})-(\d+)$/u;
const POLL_MS = 100;
// A waiter refreshes its ticket every poll; one this old belongs to a stopped
// process, or to a dead one whose pid was reused.
const STALE_TICKET_MS = 30_000;

/** @param {unknown} error */
const errorCode = (error) => (error instanceof Error && "code" in error ? error.code : undefined);

/**
 * The queue's tickets in arrival order: sequence, then pid for a tie.
 *
 * @param {string} queue
 */
function tickets(queue) {
  /** @type {string[]} */
  let names;
  try { names = readdirSync(queue); } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    throw error;
  }
  return names.flatMap((name) => {
    const match = TICKET.exec(name);
    return match === null ? [] : [{ name, sequence: Number(match[1]), pid: Number(match[2]) }];
  }).sort((a, b) => a.sequence - b.sequence || a.pid - b.pid);
}

/** @param {string} file */
function removeTicket(file) {
  try { unlinkSync(file); } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

/** @param {number} pid */
function running(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

/**
 * Whether a ticket's waiter is still waiting. Reaps the ticket of an exited
 * or stopped waiter, so a killed waiter never blocks the queue.
 *
 * @param {string} queue
 * @param {{ name: string, pid: number }} ticket
 */
function waiting(queue, ticket) {
  const file = join(queue, ticket.name);
  /** @type {number} */
  let refreshed;
  try { refreshed = statSync(file).mtimeMs; } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
  if ((ticket.pid === process.pid || running(ticket.pid)) && Date.now() - refreshed < STALE_TICKET_MS) return true;
  removeTicket(file);
  return false;
}

/**
 * Takes the next ticket. A ticket's sequence follows every ticket present when
 * it is created, and `wx` creation never reuses a present name.
 *
 * @param {string} queue
 * @param {number} slots
 */
function enqueue(queue, slots) {
  mkdirSync(queue, { recursive: true });
  for (;;) {
    const sequence = (tickets(queue).at(-1)?.sequence ?? 0) + 1;
    const name = `${String(sequence).padStart(12, "0")}-${String(process.pid)}`;
    try {
      writeFileSync(join(queue, name), JSON.stringify({ slots }), { flag: "wx" });
      return name;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
  }
}

/**
 * Marks a ticket live, restoring it in place if a peer reaped it.
 *
 * @param {string} queue
 * @param {string} name
 */
function refresh(queue, name) {
  const file = join(queue, name);
  const now = new Date();
  try { utimesSync(file, now, now); } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
    mkdirSync(queue, { recursive: true });
    writeFileSync(file, "");
  }
}

/**
 * How many processes wait in the lease's queue, reaping the tickets of
 * waiters that are gone.
 *
 * @param {string} path
 */
export function browserLeaseWaiters(path) {
  const queue = browserLeaseQueuePath(path);
  return tickets(queue).filter((ticket) => waiting(queue, ticket)).length;
}

// lockf owns the kernel lock while this child has its parent's pipe. EOF
// releases it even when the parent exits without running JavaScript cleanup.
const HOLDER = ["/bin/sh", "-c", "echo ready; exec cat >/dev/null"];

/**
 * One nonblocking native attempt on the kernel lock at `path`, held until
 * `release()`. A busy attempt (null) exits before returning, so killing a
 * waiting caller cannot leave an orphan blocked inside lockf.
 *
 * @param {string} path
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ release: () => Promise<void> } | null>}
 */
export async function tryBrowserLock(path, signal) {
  signal?.throwIfAborted();
  const child = spawn("lockf", ["-k", "-t", "0", path, ...HOLDER], {
    stdio: ["pipe", "pipe", "pipe"], detached: true,
  });
  let diagnostic = "";
  let output = "";
  let spawnError = /** @type {Error | null} */ (null);
  const exited = new Promise((/** @type {(code: number | null) => void} */ done) => {
    child.once("close", done);
  });
  const abort = () => {
    if (child.pid !== undefined) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ }
    }
  };
  signal?.addEventListener("abort", abort, { once: true });
  child.stdin.on("error", () => {}); // A failed nonblocking attempt already closed its pipe.
  child.stderr.on("data", (chunk) => { diagnostic += String(chunk); });
  try {
    const acquired = await new Promise((/** @type {(value: boolean) => void} */ done) => {
      child.stdout.on("data", (chunk) => {
        output += String(chunk);
        if (output === "ready\n") done(true);
      });
      child.once("error", (error) => { spawnError = error; });
      void exited.then(() => done(false));
    });
    signal?.throwIfAborted();
    if (!acquired) {
      if (spawnError !== null) throw spawnError;
      const code = await exited;
      // EX_TEMPFAIL is lockf's documented nonblocking contention result.
      if (code === 75) return null;
      throw new Error(`browser lease lockf exited ${String(code)}: ${diagnostic.trim()}`);
    }
    let released = /** @type {Promise<void> | null} */ (null);
    return {
      release() {
        released ??= (async () => {
          child.stdin.end();
          await exited;
        })();
        return released;
      },
    };
  } catch (error) {
    abort();
    await exited;
    throw error;
  } finally {
    // Once acquired, its owner releases only after browser/server cleanup.
    signal?.removeEventListener("abort", abort);
  }
}

/**
 * Whether the kernel lock at `path` is free, by one nonblocking attempt that
 * runs no command under it.
 *
 * @param {string} path
 */
async function lockFree(path) {
  mkdirSync(dirname(path), { recursive: true });
  const child = spawn("lockf", ["-k", "-t", "0", path, "/usr/bin/true"], { stdio: ["ignore", "ignore", "pipe"] });
  let diagnostic = "";
  child.stderr?.on("data", (chunk) => { diagnostic += String(chunk); });
  const code = await new Promise((/** @type {(code: number | null) => void} */ done, reject) => {
    child.once("error", reject);
    child.once("close", done);
  });
  if (code === 0) return true;
  if (code === 75) return false;
  throw new Error(`browser lease lockf exited ${String(code)}: ${diagnostic.trim()}`);
}

/**
 * Records retained on a free kernel lock. Live holders' records are unavailable
 * too, but are contention rather than retained reconciliation evidence.
 * @param {string} slotPath
 */
async function retainedRecords(slotPath) {
  if (slotRecords(slotPath).length === 0) return [];
  const lock = await tryBrowserLock(slotPath);
  if (lock === null) return [];
  try { return slotRecords(slotPath); } finally { await lock.release(); }
}

/**
 * A held browser slot.
 *
 * @typedef {object} BrowserLease
 * @property {number} slot
 * @property {string} path The slot's kernel lock.
 * @property {string} ownerPath The slot's ownership record.
 * @property {() => Promise<void>} release
 */

/**
 * Takes the first free slot, highest first: a single-slot peer only ever
 * takes slot 0, so a slot holder leaves it to them while another is free.
 * A slot whose record is retained for reconciliation is passed over; when
 * every slot's is, startup cannot proceed.
 *
 * @param {string} path
 * @param {number} slots
 * @param {AbortSignal | undefined} signal
 * @param {(records: string[]) => void} reportRetained
 * @returns {Promise<BrowserLease | null>}
 */
async function takeSlot(path, slots, signal, reportRetained) {
  /** @type {string[]} */
  const retained = [];
  let retainedSlots = 0;
  for (let slot = slots - 1; slot >= 0; slot--) {
    const slotPath = browserSlotPath(path, slot);
    const ownerPath = browserOwnerPath(slotPath);
    if (slotRecords(slotPath).length > 0) {
      const records = await retainedRecords(slotPath);
      if (records.length > 0) { reportRetained(records); retained.push(...records); retainedSlots++; }
      continue;
    }
    const lock = await tryBrowserLock(slotPath, signal);
    if (lock === null) continue;
    // A holder may have retained its record between the check and the lock.
    const records = slotRecords(slotPath);
    if (records.length === 0) return { slot, path: slotPath, ownerPath, release: lock.release };
    await lock.release();
    reportRetained(records);
    retained.push(...records);
    retainedSlots++;
  }
  if (retainedSlots === slots) {
    throw new Error(`browser slot requires reconciliation before QA startup: ${retained.join(", ")}`);
  }
  return null;
}

/**
 * Acquire one of the repository's browser slots, independent of the
 * externally held heavy slot, first come first served. The waiter takes a
 * ticket in the admission path's queue and attempts the slots' kernel locks
 * only while its ticket is the oldest live one; the kernel locks alone
 * exclude holders, so a process that ignores the queue may take a slot
 * first but never shares one. `slots` is the capacity; with 1, this is the
 * single-slot protocol on slot 0. The ticket is gone once this settles.
 * onWait runs once after actual contention.
 *
 * @param {string} path
 * @param {{ signal?: AbortSignal, onWait?: () => void, slots?: number }} [options]
 * @returns {Promise<BrowserLease>}
 */
export async function acquireBrowserLease(path, { signal, onWait, slots = BROWSER_QA_SLOTS } = {}) {
  signal?.throwIfAborted();
  mkdirSync(dirname(path), { recursive: true });
  const queue = browserLeaseQueuePath(path);
  const ticket = enqueue(queue, slots);
  let reported = false;
  const diagnosed = new Set();
  const reportRetained = (/** @type {string[]} */ records) => {
    // Diagnostic order follows reconciliation prerequisites, independently of
    // the lease's retained-record and runtime ordering.
    for (const record of [...records].sort((a, b) => Number(a.endsWith(".owner.json")) - Number(b.endsWith(".owner.json")))) {
      if (diagnosed.has(record)) continue;
      diagnosed.add(record);
      const provider = record.endsWith(".owner.json");
      const slotPath = record.slice(0, -(provider ? ".owner.json".length : ".server.json".length));
      const quotedPath = `'${slotPath.replaceAll("'", "'\\''")}'`;
      console.error(`browser slot retained at ${record}; reconcile with: node scripts/qa/${provider ? "provider" : "server"}-ownership.mjs ${quotedPath}`);
    }
  };
  try {
    for (;;) {
      refresh(queue, ticket);
      // The first ticket that is this one or a live waiter's; gone waiters
      // ahead of it are reaped on the way.
      if (tickets(queue).find((entry) => entry.name === ticket || waiting(queue, entry))?.name === ticket) {
        const lease = await takeSlot(path, slots, signal, reportRetained);
        if (lease !== null) return lease;
      }
      if (!reported) { reported = true; onWait?.(); }
      await delay(POLL_MS, undefined, { signal });
    }
  } finally {
    removeTicket(join(queue, ticket));
  }
}

/**
 * Whether the queue head needs this holder's slot at a card boundary.
 * Empty or unrecognized ticket contents describe a legacy slot-0 waiter.
 * @param {string} path
 * @param {number} [slots]
 * @param {number} [heldSlot]
 */
export async function browserLeaseContended(path, slots = BROWSER_QA_SLOTS, heldSlot) {
  const queue = browserLeaseQueuePath(path);
  const head = tickets(queue).find((ticket) => waiting(queue, ticket));
  if (head === undefined) return false;
  let capacity = 1;
  try {
    const value = /** @type {unknown} */ (JSON.parse(readFileSync(join(queue, head.name), "utf8")));
    if (typeof value === "object" && value !== null && "slots" in value &&
      typeof value.slots === "number" && Number.isInteger(value.slots) && value.slots > 0) capacity = Math.min(slots, value.slots);
  } catch { /* Partial or legacy tickets conservatively need slot 0. */ }
  if (heldSlot !== undefined && heldSlot >= capacity) return false;
  for (let slot = 0; slot < capacity; slot++) {
    const slotPath = browserSlotPath(path, slot);
    if (slotRecords(slotPath).length === 0 && await lockFree(slotPath) && slotRecords(slotPath).length === 0) return false;
  }
  return true;
}
