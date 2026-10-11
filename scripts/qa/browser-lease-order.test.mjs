// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { browserLeasePath, browserLeaseQueuePath, browserLeaseWaiters } from "./browser-lease.mjs";

// Every holder and waiter is a real process taking the real lockf lease, so
// each owns its own pid and kernel lock. Fixture processes stay inside the
// test's session: lockf children are spawned undetached, and a group kill of
// one is delivered to it directly.
const children = /** @type {import("node:child_process").ChildProcess[]} */ ([]);
const directories = /** @type {string[]} */ ([]);

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  }
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function leaseFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dreamtides-browser-lease-order-")));
  directories.push(root);
  const path = browserLeasePath(root);
  mkdirSync(dirname(path));
  return path;
}

/**
 * A process acquiring the lease. It reports "waiting" and "acquired", aborts
 * on "abort", and releases then exits on "release".
 * @param {string} path
 */
function leaseProcess(path) {
  const moduleUrl = new URL("./browser-lease.mjs", import.meta.url).href;
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import cp from "node:child_process";
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
      if (command === "release") { await lease.release(); process.exit(0); }
    });
    try {
      lease = await acquireBrowserLease(${JSON.stringify(path)}, {
        signal: controller.signal, onWait: () => process.send("waiting"),
      });
      process.send("acquired");
    } catch { process.exit(2); }
  `], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  children.push(child);
  const acquired = new Promise((/** @type {(child: import("node:child_process").ChildProcess) => void} */ done) => {
    child.on("message", (message) => { if (message === "acquired") done(child); });
  });
  const first = /** @type {Promise<[unknown]>} */ (once(child, "message"));
  return { child, acquired, first: first.then(([message]) => message) };
}

/** @param {ReturnType<typeof leaseProcess>} holder */
async function release(holder) {
  const exited = once(holder.child, "exit");
  holder.child.send("release");
  expect((await exited)[0]).toBe(0);
}

/** @param {string} path @param {import("node:child_process").ChildProcess} child */
function ticketOf(path, child) {
  return readdirSync(browserLeaseQueuePath(path)).filter((name) => name.endsWith(`-${String(child.pid)}`));
}

/** A lease taken the way a peer still on the queue-less code takes it: one nonblocking kernel attempt. */
function legacyHolder(/** @type {string} */ path) {
  const child = spawn("lockf", ["-k", "-t", "0", path, process.execPath, "-e",
    'process.stdout.write("ready\\n"); process.stdin.resume(); process.stdin.on("end", () => process.exit(0));'],
  { stdio: ["pipe", "pipe", "inherit"] });
  children.push(child);
  return child;
}

describe("browser lease arrival order", () => {
  it("hands the released lease to waiters in arrival order", async () => {
    const path = leaseFixture();
    const holder = leaseProcess(path);
    expect(await holder.first).toBe("acquired");
    const waiters = [];
    for (let i = 0; i < 3; i++) {
      const waiter = leaseProcess(path);
      expect(await waiter.first).toBe("waiting");
      waiters.push(waiter);
    }
    expect(browserLeaseWaiters(path)).toBe(3);
    let previous = holder;
    for (const [index, expected] of waiters.entries()) {
      const next = Promise.race(waiters.slice(index).map((waiter) => waiter.acquired));
      await release(previous);
      expect(await next).toBe(expected.child);
      previous = expected;
    }
    await release(previous);
    expect(browserLeaseWaiters(path)).toBe(0);
  });

  it("skips a killed queued waiter and removes a ticket whose waiter aborted", async () => {
    const path = leaseFixture();
    const holder = leaseProcess(path);
    expect(await holder.first).toBe("acquired");
    const queued = [];
    for (let i = 0; i < 3; i++) {
      const waiter = leaseProcess(path);
      expect(await waiter.first).toBe("waiting");
      queued.push(waiter);
    }
    // Queued in this order, so the killed waiter's ticket is ahead of the last one's.
    const [killed, aborted, last] = /** @type {[ReturnType<typeof leaseProcess>, ReturnType<typeof leaseProcess>, ReturnType<typeof leaseProcess>]} */ (queued);

    const abortedExit = once(aborted.child, "exit");
    aborted.child.send("abort");
    expect((await abortedExit)[0]).toBe(2);
    expect(ticketOf(path, aborted.child)).toEqual([]);

    const killedExit = once(killed.child, "exit");
    killed.child.kill("SIGKILL");
    await killedExit;
    await release(holder);
    expect(await last.acquired).toBe(last.child);
    expect(ticketOf(path, killed.child)).toEqual([]);
    expect(ticketOf(path, last.child)).toEqual([]);
    await release(last);
  });

  it("excludes holders through the kernel lock shared with queue-less peers", async () => {
    const path = leaseFixture();
    const legacy = legacyHolder(path);
    expect(String((await once(/** @type {import("node:stream").Readable} */ (legacy.stdout), "data"))[0])).toBe("ready\n");
    const waiter = leaseProcess(path);
    expect(await waiter.first).toBe("waiting");
    const legacyExit = once(legacy, "exit");
    legacy.stdin?.end();
    await legacyExit;
    expect(await waiter.acquired).toBe(waiter.child);

    // A queue-less attempt against the queued holder finds the lock busy.
    const contender = spawn("lockf", ["-k", "-t", "0", path, process.execPath, "-e", "process.exit(0)"], { stdio: "ignore" });
    children.push(contender);
    expect((await once(contender, "exit"))[0]).toBe(75);
    await release(waiter);
  });
});
