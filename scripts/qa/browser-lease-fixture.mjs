// Test fixtures for the browser slots: temporary admission paths, real
// processes taking the real lockf slots, and single-slot (older) peers. Every
// fixture process stays inside the test's session: lockf children are spawned
// undetached, and a group kill of one is delivered to it directly.

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { browserLeasePath } from "./browser-lease.mjs";

/** @typedef {import("node:child_process").ChildProcess} ChildProcess */

/**
 * @typedef {object} LeaseProcess
 * @property {ChildProcess} child
 * @property {Promise<string>} first Its first report: "waiting" or "acquired".
 * @property {Promise<number>} acquired The slot it holds once it acquires one.
 */

export function leaseFixtures() {
  const children = /** @type {ChildProcess[]} */ ([]);
  const directories = /** @type {string[]} */ ([]);

  /** A fresh admission path in its own primary-checkout-like directory. */
  function leasePath() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "dreamtides-browser-slots-")));
    directories.push(root);
    const path = browserLeasePath(root);
    mkdirSync(dirname(path));
    return path;
  }

  /**
   * A process acquiring a slot. It reports "waiting" and "acquired:<slot>",
   * aborts on "abort", and releases then exits on "release". With `owner`, it
   * writes its slot's ownership record once it holds the slot and clears it
   * before releasing, as a session does around confirmed provider use; a
   * killed one leaves the record behind.
   *
   * @param {string} path
   * @param {{ slots?: number, owner?: boolean }} [options]
   * @returns {LeaseProcess}
   */
  function leaseProcess(path, { slots, owner = false } = {}) {
    const moduleUrl = new URL("./browser-lease.mjs", import.meta.url).href;
    const child = spawn(process.execPath, ["--input-type=module", "-e", `
      import cp from "node:child_process";
      import { unlinkSync, writeFileSync } from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      const originalSpawn = cp.spawn;
      const owned = new Map();
      cp.spawn = (command, args, options) => {
        const child = originalSpawn(command, args, { ...options, detached: false });
        owned.set(child.pid, child);
        return child;
      };
      syncBuiltinESMExports();
      const originalKill = process.kill.bind(process);
      process.kill = (pid, signal) => {
        const child = pid < 0 ? owned.get(-pid) : null;
        if (child) { child.stdin?.end(); return originalKill(-pid, signal); }
        return originalKill(pid, signal);
      };
      const { acquireBrowserLease } = await import(${JSON.stringify(moduleUrl)});
      const controller = new AbortController();
      let lease;
      process.on("message", async (command) => {
        if (command === "abort") controller.abort();
        if (command === "release") {
          if (${String(owner)}) unlinkSync(lease.ownerPath);
          await lease.release();
          process.exit(0);
        }
      });
      try {
        lease = await acquireBrowserLease(${JSON.stringify(path)}, {
          signal: controller.signal, onWait: () => process.send("waiting"), slots: ${JSON.stringify(slots)},
        });
        if (${String(owner)}) writeFileSync(lease.ownerPath, JSON.stringify({ token: "synthetic-owner", pid: process.pid }));
        process.send("acquired:" + String(lease.slot));
      } catch { process.exit(2); }
    `], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
    children.push(child);
    const acquired = new Promise((/** @type {(slot: number) => void} */ done) => {
      child.on("message", (message) => {
        if (typeof message === "string" && message.startsWith("acquired:")) done(Number(message.slice("acquired:".length)));
      });
    });
    const first = /** @type {Promise<[string]>} */ (once(child, "message"));
    return { child, acquired, first: first.then(([message]) => message.split(":")[0] ?? "") };
  }

  /**
   * A slot-0 lock taken the way a queue-less peer takes it: one nonblocking
   * kernel attempt on the admission path, held until its stdin closes.
   *
   * @param {string} path
   */
  async function legacyHolder(path) {
    const child = spawn("lockf", ["-k", "-t", "0", path, process.execPath, "-e",
      'process.stdout.write("ready\\n"); process.stdin.resume(); process.stdin.on("end", () => process.exit(0));'],
    { stdio: ["pipe", "pipe", "inherit"] });
    children.push(child);
    const ready = String((await once(/** @type {import("node:stream").Readable} */ (child.stdout), "data"))[0]);
    if (ready !== "ready\n") throw new Error("legacy holder did not take the lock");
    return child;
  }

  async function cleanup() {
    for (const child of children.splice(0)) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
    for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
  }

  return { leasePath, leaseProcess, legacyHolder, cleanup };
}

/**
 * Whether some process holds the kernel lock at `path`, by one nonblocking
 * attempt that runs no command under it.
 *
 * @param {string} path
 */
export function lockHeld(path) {
  const { status } = spawnSync("lockf", ["-k", "-t", "0", path, "/usr/bin/true"]);
  if (status !== 0 && status !== 75) throw new Error(`lockf exited ${String(status)}`);
  return status === 75;
}

/**
 * Releases a fixture lease process and waits for its clean exit.
 *
 * @param {LeaseProcess} holder
 */
export async function releaseHolder(holder) {
  const exited = once(holder.child, "exit");
  holder.child.send("release");
  const code = String((await exited)[0]);
  if (code !== "0") throw new Error(`lease process exited ${code}`);
}
