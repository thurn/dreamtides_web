import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

/** @param {string} primaryCheckout */
export function browserLeasePath(primaryCheckout) {
  return join(primaryCheckout, "artifacts", "browser-qa.lock");
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
 * heavy slot. onWait runs once after actual contention, before the retry.
 *
 * @param {string} path
 * @param {{ signal?: AbortSignal, onWait?: () => void }} [options]
 */
export async function acquireBrowserLease(path, { signal, onWait } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  let reported = false;
  for (;;) {
    const lease = await attempt(path, signal);
    if (lease !== null) return lease;
    if (!reported) { reported = true; onWait?.(); }
    await delay(100, undefined, { signal });
  }
}
