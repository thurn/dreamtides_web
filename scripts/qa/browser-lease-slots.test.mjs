// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  acquireBrowserLease,
  browserLeaseContended,
  browserLeaseQueuePath,
  browserOwnerPath,
  browserSlotPath,
} from "./browser-lease.mjs";
import { leaseFixtures, lockHeld, releaseHolder } from "./browser-lease-fixture.mjs";
import { sweepCards } from "./card-sweep.mjs";

// Slots this test process takes itself keep their native lockf holders in
// the test's session: the holders' isolated groups become direct children,
// each still released by closing its pipe.
const owned = vi.hoisted(() => /** @type {import("node:child_process").ChildProcess[]} */ ([]));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = /** @type {typeof import("node:child_process")} */ (await importOriginal());
  return {
    ...actual,
    spawn: vi.fn((/** @type {string} */ command, /** @type {string[]} */ args, /** @type {import("node:child_process").SpawnOptions} */ options) => {
      const child = actual.spawn(command, args, { ...options, detached: false });
      owned.push(child);
      return child;
    }),
  };
});

const fixtures = leaseFixtures();
const leases = /** @type {Array<{ release: () => Promise<void> }>} */ ([]);
afterEach(async () => {
  await Promise.all(leases.splice(0).map((lease) => lease.release()));
  await fixtures.cleanup();
  for (const child of owned.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, "close");
    child.stdin?.end();
    child.kill("SIGKILL");
    await exited;
  }
});

/** @param {string} path @param {Parameters<typeof acquireBrowserLease>[1]} [options] */
async function acquire(path, options) {
  const lease = await acquireBrowserLease(path, options);
  leases.push(lease);
  return lease;
}

/** @param {string} path @param {number} slot */
const ownerOf = (path, slot) => browserOwnerPath(browserSlotPath(path, slot));

/**
 * A live waiter's ticket that never attempts a slot: this test process's
 * own, queued without an acquisition behind it.
 * @param {string} path
 * @param {number} [slots]
 */
function queueSyntheticWaiter(path, slots = 2) {
  const ticket = join(browserLeaseQueuePath(path), `500000000000-${String(process.pid)}`);
  writeFileSync(ticket, slots === 1 ? "" : JSON.stringify({ slots }));
  return () => rmSync(ticket);
}

describe("browser slot recovery", () => {
  it("recovers a killed holder's slot for the next waiter without touching the live slot", async () => {
    const path = fixtures.leasePath();
    const killed = fixtures.leaseProcess(path);
    const killedSlot = await killed.acquired;
    const live = fixtures.leaseProcess(path);
    const liveSlot = await live.acquired;
    expect(liveSlot).not.toBe(killedSlot);
    const waiter = fixtures.leaseProcess(path);
    expect(await waiter.first).toBe("waiting");
    const exited = once(killed.child, "exit");
    killed.child.kill("SIGKILL");
    await exited;
    expect(await waiter.acquired).toBe(killedSlot);
    expect(lockHeld(browserSlotPath(path, liveSlot))).toBe(true);
    await releaseHolder(live);
    await releaseHolder(waiter);
  });

  it("passes over a slot retained for reconciliation and fails only when every slot is", async () => {
    const path = fixtures.leasePath();
    const crashed = fixtures.leaseProcess(path, { owner: true });
    const retained = await crashed.acquired;
    const exited = once(crashed.child, "exit");
    crashed.child.kill("SIGKILL");
    await exited;
    const record = readFileSync(ownerOf(path, retained), "utf8");

    // A live holder's record is not a retained one: the next waiter waits for it.
    const live = fixtures.leaseProcess(path, { owner: true });
    const liveSlot = await live.acquired;
    expect(liveSlot).not.toBe(retained);
    const waiter = fixtures.leaseProcess(path);
    expect(await waiter.first).toBe("waiting");
    await releaseHolder(live);
    expect(await waiter.acquired).toBe(liveSlot);
    await releaseHolder(waiter);

    writeFileSync(ownerOf(path, liveSlot), "synthetic retained record");
    await expect(acquireBrowserLease(path)).rejects.toThrow(/requires reconciliation/);
    expect(readFileSync(ownerOf(path, retained), "utf8")).toBe(record);
    expect(existsSync(ownerOf(path, liveSlot))).toBe(true);
    expect(lockHeld(browserSlotPath(path, 0)) || lockHeld(browserSlotPath(path, 1))).toBe(false);
  });
});

describe("mixed single-slot and two-slot peers", () => {
  it("keeps one arrival order across protocols, and a single-slot peer only ever takes slot 0", async () => {
    const path = fixtures.leasePath();
    // The single-slot record is slot 0's; no other slot's record shares its path.
    expect(new Set([0, 1].map((slot) => ownerOf(path, slot)))).toEqual(new Set([`${path}.owner.json`, ownerOf(path, 1)]));
    const first = fixtures.leaseProcess(path);
    expect(await first.acquired).toBe(1);
    const second = fixtures.leaseProcess(path);
    expect(await second.acquired).toBe(0);
    await releaseHolder(first);

    // Slot 1 is free, yet the older peer at the head waits for slot 0, and
    // the two-slot waiter behind it keeps its place.
    const older = fixtures.leaseProcess(path, { slots: 1 });
    expect(await older.first).toBe("waiting");
    const newer = fixtures.leaseProcess(path);
    expect(await newer.first).toBe("waiting");
    expect(lockHeld(browserSlotPath(path, 1))).toBe(false);
    await releaseHolder(second);
    expect(await older.acquired).toBe(0);
    expect(await newer.acquired).toBe(1);
    await releaseHolder(older);
    await releaseHolder(newer);
  });
});

describe("browser slot yielding", () => {
  it("is contended only while processes wait and no slot is free for them", async () => {
    const path = fixtures.leasePath();
    const held = await acquire(path);
    expect(await browserLeaseContended(path)).toBe(false);
    const other = await acquire(path);
    expect(new Set([held.slot, other.slot])).toEqual(new Set([0, 1]));
    expect(await browserLeaseContended(path)).toBe(false);
    const dequeue = queueSyntheticWaiter(path);
    expect(await browserLeaseContended(path)).toBe(true);
    await other.release();
    expect(await browserLeaseContended(path)).toBe(false);
    writeFileSync(other.ownerPath, "synthetic retained record");
    expect(await browserLeaseContended(path)).toBe(true);
    dequeue();
    expect(await browserLeaseContended(path)).toBe(false);
  });

  it("yields slot0 to a legacy queue head while slot1 is free, without yielding slot1", async () => {
    const path = fixtures.leasePath();
    const slot1 = await acquire(path);
    const slot0 = await acquire(path);
    await slot1.release();
    const dequeue = queueSyntheticWaiter(path, 1);
    expect(slot0.slot).toBe(0);
    expect(await browserLeaseContended(path, 2, 0)).toBe(true);
    expect(await browserLeaseContended(path, 2, 1)).toBe(false);
    dequeue();
  });

  it("hands slot0 to a single-slot waiter at the next card boundary despite free slot1", async () => {
    const path = fixtures.leasePath();
    const slot1 = await acquire(path);
    let waiter = /** @type {import("./browser-lease-fixture.mjs").LeaseProcess | null} */ (null);
    const seen = /** @type {number[]} */ ([]);
    const result = await sweepCards(["a", "b"], {
      open: async () => {
        const lease = await acquireBrowserLease(path);
        seen.push(lease.slot);
        return { lease, closed: () => false, close: async () => {
          await lease.release();
          if (waiter !== null) { await waiter.acquired; await releaseHolder(waiter); waiter = null; }
        } };
      },
      contended: (session) => browserLeaseContended(path, 2, session.lease.slot),
      sweepCard: async (card) => {
        if (card === "a") {
          await slot1.release();
          waiter = fixtures.leaseProcess(path, { slots: 1 });
          expect(await waiter.first).toBe("waiting");
        }
      },
    });
    expect(seen).toEqual([0, 1]);
    expect(result).toEqual({ sessions: 2, yields: 1 });
  });

  it("sweeps on through a boundary with a free slot and yields at one where every slot is taken", async () => {
    const path = fixtures.leasePath();
    const events = /** @type {string[]} */ ([]);
    let dequeue = () => {};
    let waiter = /** @type {import("./browser-lease-fixture.mjs").LeaseProcess | null} */ (null);
    const result = await sweepCards(["a", "b", "c"], {
      open: async () => {
        const lease = await acquireBrowserLease(path);
        events.push(`open ${String(lease.slot)}`);
        return { lease, closed: () => false, close: async () => {
          events.push(`close ${String(lease.slot)}`);
          await lease.release();
        } };
      },
      contended: () => browserLeaseContended(path),
      sweepCard: async (card, session) => {
        events.push(`${card} in ${String(session.lease.slot)}`);
        if (card === "a") dequeue = queueSyntheticWaiter(path);
        if (card === "b") {
          dequeue();
          const other = await acquire(path);
          waiter = fixtures.leaseProcess(path);
          expect(await waiter.first).toBe("waiting");
          // The yielded slot goes to the waiter; the sweep reopens on the next free one.
          void waiter.acquired.then(() => other.release());
        }
      },
    });
    expect(events).toEqual(["open 1", "a in 1", "b in 1", "close 1", "open 0", "c in 0", "close 0"]);
    expect(result).toEqual({ sessions: 2, yields: 1 });
    if (waiter === null) throw new Error("expected a waiter");
    expect(await /** @type {import("./browser-lease-fixture.mjs").LeaseProcess} */ (waiter).acquired).toBe(1);
    await releaseHolder(waiter);
  });
});
