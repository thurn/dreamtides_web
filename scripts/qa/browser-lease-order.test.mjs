// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readdirSync } from "node:fs";
import { browserLeaseQueuePath, browserLeaseWaiters, browserSlotPath } from "./browser-lease.mjs";
import { leaseFixtures, lockHeld, releaseHolder } from "./browser-lease-fixture.mjs";

// Every holder and waiter is a real process taking the real lockf slots, so
// each owns its own pid and kernel lock.
const fixtures = leaseFixtures();
afterEach(fixtures.cleanup);

/** @param {string} path @param {import("node:child_process").ChildProcess} child */
function ticketOf(path, child) {
  return readdirSync(browserLeaseQueuePath(path)).filter((name) => name.endsWith(`-${String(child.pid)}`));
}

describe("browser slot arrival order", () => {
  it("runs two holders at once and hands each released slot to the waiters in arrival order", async () => {
    const path = fixtures.leasePath();
    const holders = [fixtures.leaseProcess(path)];
    expect(await holders[0]?.first).toBe("acquired");
    holders.push(fixtures.leaseProcess(path));
    expect(await holders[1]?.first).toBe("acquired");
    expect(new Set(await Promise.all(holders.map((holder) => holder.acquired)))).toEqual(new Set([0, 1]));
    expect(lockHeld(browserSlotPath(path, 0)) && lockHeld(browserSlotPath(path, 1))).toBe(true);
    const waiters = [];
    for (let i = 0; i < 3; i++) {
      const waiter = fixtures.leaseProcess(path);
      expect(await waiter.first).toBe("waiting");
      waiters.push(waiter);
    }
    expect(browserLeaseWaiters(path)).toBe(3);
    const running = [...holders];
    for (const [index, expected] of waiters.entries()) {
      const releasing = /** @type {import("./browser-lease-fixture.mjs").LeaseProcess} */ (running.shift());
      const freed = await releasing.acquired;
      const next = Promise.race(waiters.slice(index).map(async (waiter) => ({ waiter, slot: await waiter.acquired })));
      await releaseHolder(releasing);
      expect(await next).toEqual({ waiter: expected, slot: freed });
      running.push(expected);
    }
    for (const holder of running) await releaseHolder(holder);
    expect(browserLeaseWaiters(path)).toBe(0);
  });

  it("skips a killed queued waiter and removes a ticket whose waiter aborted", async () => {
    const path = fixtures.leasePath();
    const holders = [];
    for (let i = 0; i < 2; i++) {
      const holder = fixtures.leaseProcess(path);
      expect(await holder.first).toBe("acquired");
      holders.push(holder);
    }
    const queued = [];
    for (let i = 0; i < 3; i++) {
      const waiter = fixtures.leaseProcess(path);
      expect(await waiter.first).toBe("waiting");
      queued.push(waiter);
    }
    // Queued in this order, so the killed waiter's ticket is ahead of the last one's.
    const [killed, aborted, last] = /** @type {import("./browser-lease-fixture.mjs").LeaseProcess[]} */ (queued);
    if (killed === undefined || aborted === undefined || last === undefined) throw new Error("expected three waiters");

    const abortedExit = once(aborted.child, "exit");
    aborted.child.send("abort");
    expect((await abortedExit)[0]).toBe(2);
    expect(ticketOf(path, aborted.child)).toEqual([]);

    const killedExit = once(killed.child, "exit");
    killed.child.kill("SIGKILL");
    await killedExit;
    const [releasing] = holders;
    if (releasing === undefined) throw new Error("expected a holder");
    const freed = await releasing.acquired;
    await releaseHolder(releasing);
    expect(await last.acquired).toBe(freed);
    expect(ticketOf(path, killed.child)).toEqual([]);
    expect(ticketOf(path, last.child)).toEqual([]);
    await releaseHolder(last);
  });

  it("excludes holders through the kernel locks shared with queue-less peers", async () => {
    const path = fixtures.leasePath();
    const legacy = await fixtures.legacyHolder(path);
    const holder = fixtures.leaseProcess(path);
    expect(await holder.acquired).toBe(1);
    const waiter = fixtures.leaseProcess(path);
    expect(await waiter.first).toBe("waiting");
    const legacyExit = once(legacy, "exit");
    legacy.stdin?.end();
    await legacyExit;
    expect(await waiter.acquired).toBe(0);

    // A queue-less attempt against a queued holder's slot finds the lock busy.
    const contender = spawn("lockf", ["-k", "-t", "0", path, process.execPath, "-e", "process.exit(0)"], { stdio: "ignore" });
    expect((await once(contender, "exit"))[0]).toBe(75);
    await releaseHolder(waiter);
    await releaseHolder(holder);
  });
});
