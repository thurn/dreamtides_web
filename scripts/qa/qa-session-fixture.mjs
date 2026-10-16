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
    const actual = /** @type {typeof import("node:child_process")} */ (await vi.importActual("node:child_process"));
    const identities = () => actual.execFileSync("ps", ["-axo", "pid=,ppid=,lstart=,command="], { encoding: "utf8" })
      .trim().split("\n").map((line) => {
        const fields = /^\s*(\d+)\s+(\d+)\s+((?:\S+\s+){4}\S+)\s+(.*)$/u.exec(line);
        if (fields === null) throw new Error(`unreadable actual fixture process identity: ${line}`);
        return { pid: Number(fields[1]), parent: Number(fields[2]), started: fields[3]?.replace(/\s+/gu, " "), command: fields[4] };
      });
    for (const child of fixtureIo.children.splice(0)) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      // Retain actual native descendant lifetime and command before signaling.
      // A closed launcher alone does not prove its ordinary server child exited.
      const descendants = identities().filter(({ parent }) => parent === child.pid);
      const exited = once(child, "close");
      child.stdin?.end();
      // The contained launcher forwards SIGTERM to its ordinary server child
      // and stays alive until that child exits, including protected records.
      child.kill("SIGTERM");
      await exited;
      const remaining = identities();
      for (const identity of descendants) {
        expect(remaining.some(({ pid, started }) => pid === identity.pid && started === identity.started),
          `owned fixture descendant remains alive: ${JSON.stringify(identity)}`).toBe(false);
      }
    }
    await fixtures.cleanup();
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
    execFileSync("git", ["init", "-q", root], { encoding: "utf8" });
    fixtureIo.gitCwd = root;
    return { root, path: browserLeasePath(root) };
  }

  function linkedSessionFixture() {
    const fixture = sessionFixture();
    const { root } = fixture;
    const git = (/** @type {string[]} */ args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" });
    git(["add", "scripts/dev.mjs"]);
    git(["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "synthetic session process"]);
    const worktree = join(root, "..", "linked-checkout");
    git(["worktree", "add", "--detach", "--quiet", worktree, "HEAD"]);
    return { ...fixture, worktree };
  }

  const fixtures = leaseFixtures();
  /** @param {string} path @param {number} slot */
  const ownerOf = (path, slot) => browserOwnerPath(browserSlotPath(path, slot));
  /** Holds every browser slot, so the next waiter queues. @param {string} path */
  const holdEverySlot = (path) => Promise.all([acquireBrowserLease(path), acquireBrowserLease(path)]);

  return { fixtures, notification, leaseFixture, sessionFixture, linkedSessionFixture, acquireBrowserLease, openQaSession, ownerOf, holdEverySlot };
}
