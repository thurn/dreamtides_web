import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

/** @param {string} primaryCheckout */
export function browserLeasePath(primaryCheckout) {
  return join(primaryCheckout, "artifacts", "browser-qa.lock");
}

/**
 * The arrival queue of a lease: one empty ticket file per waiting process,
 * `<sequence>-<pid>`, under the gitignored `artifacts/qa/`.
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
 */
function enqueue(queue) {
  mkdirSync(queue, { recursive: true });
  for (;;) {
    const sequence = (tickets(queue).at(-1)?.sequence ?? 0) + 1;
    const name = `${String(sequence).padStart(12, "0")}-${String(process.pid)}`;
    try {
      writeFileSync(join(queue, name), "", { flag: "wx" });
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
 * waiters that are gone. A holder yields at a boundary when this is nonzero.
 *
 * @param {string} path
 */
export function browserLeaseWaiters(path) {
  const queue = browserLeaseQueuePath(path);
  return tickets(queue).filter((ticket) => waiting(queue, ticket)).length;
}

// lockf owns the kernel lock while this child has its parent's pipe. EOF
// releases it even when the parent exits without running JavaScript cleanup.
const HOLDER = 'process.stdout.write("ready\\n"); process.stdin.resume(); process.stdin.on("end", () => process.exit(0));';

/**
 * One nonblocking native attempt. A busy attempt exits before retrying, so
 * killing a waiting caller cannot leave an orphan blocked inside lockf.
 *
 * @param {string} path
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<{ release: () => Promise<void> } | null>}
 */
async function attempt(path, signal) {
  signal?.throwIfAborted();
  const child = spawn("lockf", ["-k", "-t", "0", path, process.execPath, "-e", HOLDER], {
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
 * Acquire the repository browser slot, independent of the externally held
 * heavy slot, first come first served. The waiter takes a ticket in the
 * lease's queue and attempts the kernel lock only while its ticket is the
 * oldest live one; the kernel lock alone excludes holders, so a process that
 * ignores the queue may take the lock first but never shares it. The ticket
 * is gone once this settles. onWait runs once after actual contention.
 *
 * @param {string} path
 * @param {{ signal?: AbortSignal, onWait?: () => void }} [options]
 */
export async function acquireBrowserLease(path, { signal, onWait } = {}) {
  signal?.throwIfAborted();
  mkdirSync(dirname(path), { recursive: true });
  const queue = browserLeaseQueuePath(path);
  const ticket = enqueue(queue);
  let reported = false;
  try {
    for (;;) {
      refresh(queue, ticket);
      // The first ticket that is this one or a live waiter's; gone waiters
      // ahead of it are reaped on the way.
      if (tickets(queue).find((entry) => entry.name === ticket || waiting(queue, entry))?.name === ticket) {
        const lease = await attempt(path, signal);
        if (lease !== null) return lease;
      }
      if (!reported) { reported = true; onWait?.(); }
      await delay(POLL_MS, undefined, { signal });
    }
  } finally {
    removeTicket(join(queue, ticket));
  }
}
