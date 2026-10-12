// @vitest-environment node
import { afterEach, beforeEach, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { acquireBrowserLease as acquireNativeBrowserLease, browserLeasePath, browserOwnerPath, browserSlotPath } from "./browser-lease.mjs";
import { leaseFixtures } from "./browser-lease-fixture.mjs";
import { openQaSession as openNativeQaSession } from "./run-scenario.mjs";
import * as runtime from "../screenshot-runtime.mjs";
import { processGroup } from "./qa-session-mocks.mjs";

/** @param {import("./qa-session-mocks.mjs").SessionFixtureIo} fixtureIo */
export function createQaSessionFixture(fixtureIo) {
  const temporaryDirectories = /** @type {string[]} */ ([]);
  const ownedLeases = /** @type {Awaited<ReturnType<typeof acquireNativeBrowserLease>>[]} */ ([]);
  const ownedSessions = /** @type {Awaited<ReturnType<typeof openNativeQaSession>>[]} */ ([]);
  /** @param {Parameters<typeof openNativeQaSession>[0]} options */
  async function openQaSession(options) {
    const session = await openNativeQaSession(options);
    ownedSessions.push(session);
    return session;
  }
  const realKill = process.kill.bind(process);
  beforeEach(() => {
    vi.spyOn(StreamableHTTPClientTransport.prototype, "sessionId", "get").mockReturnValue("synthetic-sdk-session");
    vi.spyOn(StreamableHTTPClientTransport.prototype, "protocolVersion", "get").mockReturnValue("2025-11-25");
    vi.stubGlobal("fetch", vi.fn(async () => { await fixtureIo.ready; return { status: 200 }; }));
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      const owned = fixtureIo.children.find((child) => child.pid === -pid);
      if (pid < 0 && owned !== undefined) {
        owned.stdin?.end();
        return realKill(-pid, signal);
      }
      return realKill(pid, signal);
    });
    vi.spyOn(runtime, "listenerOwnedBy").mockReturnValue(true);
    vi.spyOn(runtime, "stopProcessTree").mockImplementation(async (child) => {
      if (child === null || child.exitCode !== null || child.signalCode !== null) return;
      if (!fixtureIo.children.includes(child)) throw new Error("foreign fixture process");
      const exited = once(child, "close");
      child.kill("SIGTERM");
      await exited;
    });
  });
  /** @param {string} path @param {Parameters<typeof acquireNativeBrowserLease>[1]} [options] */
  async function acquireBrowserLease(path, options) {
    const lease = await acquireNativeBrowserLease(path, options);
    ownedLeases.push(lease);
    return lease;
  }
  afterEach(async () => {
    await Promise.all(ownedSessions.splice(0).map((session) => session.close().catch(() => {})));
    await Promise.all(ownedLeases.splice(0).map((lease) => lease.release()));
    for (const child of fixtureIo.children.splice(0)) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const exited = once(child, "close");
      child.stdin?.end();
      child.kill("SIGKILL");
      await exited;
    }
    await fixtures.cleanup();
    const actual = /** @type {typeof import("node:child_process")} */ (await vi.importActual("node:child_process"));
    const parentGroup = processGroup(actual, process.pid);
    expect(fixtureIo.groups.every((entry) => entry.group === null || entry.group === parentGroup)).toBe(true);
    expect(fixtureIo.groups.every((entry) => entry.closed)).toBe(true);
    fixtureIo.groups.splice(0);
    fixtureIo.gitCwd = null;
    fixtureIo.ready = Promise.resolve();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
  });

  function notification() {
    let resolve = () => {};
    const promise = /** @type {Promise<void>} */ (new Promise((done) => { resolve = () => done(); }));
    return { promise, resolve };
  }

  function leaseFixture() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "dreamtides-browser-lease-")));
    temporaryDirectories.push(root);
    return { root, path: browserLeasePath(root) };
  }

  function sessionFixture() {
    const { root: directory } = leaseFixture();
    const root = join(directory, "primary");
    mkdirSync(join(root, "scripts"), { recursive: true });
    // A real child owns liveness until session cleanup, without a host TCP bind.
    writeFileSync(join(root, "scripts", "dev.mjs"), 'setInterval(() => {}, 60_000); process.send("ready");');
    const git = (/** @type {string[]} */ args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" });
    execFileSync("git", ["init", "-q", root], { encoding: "utf8" });
    git(["add", "scripts/dev.mjs"]);
    git(["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "synthetic session process"]);
    const worktree = join(directory, "linked-checkout");
    git(["worktree", "add", "--detach", "--quiet", worktree, "HEAD"]);
    fixtureIo.gitCwd = root;
    return { root, worktree, path: browserLeasePath(root) };
  }

  const fixtures = leaseFixtures();
  /** @param {string} path @param {number} slot */
  const ownerOf = (path, slot) => browserOwnerPath(browserSlotPath(path, slot));
  /** Holds every browser slot, so the next waiter queues. @param {string} path */
  const holdEverySlot = (path) => Promise.all([acquireBrowserLease(path), acquireBrowserLease(path)]);

  return { fixtures, notification, leaseFixture, sessionFixture, acquireBrowserLease, openQaSession, ownerOf, holdEverySlot };
}
