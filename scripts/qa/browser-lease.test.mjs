// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browserSlotPath } from "./browser-lease.mjs";
import { lockHeld } from "./browser-lease-fixture.mjs";
import { createQaSessionFixture } from "./qa-session-fixture.mjs";
import * as runtime from "../screenshot-runtime.mjs";
const fixtureIo = vi.hoisted(() => ({
  gitCwd: /** @type {string | null} */ (null),
  children: /** @type {import("node:child_process").ChildProcess[]} */ ([]),
  ready: /** @type {Promise<void>} */ (Promise.resolve()),
  groups: /** @type {Array<{ pid: number, group: number | null, closed: boolean }>} */ ([]),
}));
vi.mock("node:child_process", async (importOriginal) => {
  const { childProcessMocks } = await import("./qa-session-mocks.mjs");
  return childProcessMocks(/** @type {typeof import("node:child_process")} */ (await importOriginal()), fixtureIo);
});
vi.mock("node:net", async (importOriginal) => {
  const { networkMocks } = await import("./qa-session-mocks.mjs");
  return networkMocks(/** @type {typeof import("node:net")} */ (await importOriginal()));
});
const { fixtures, notification, leaseFixture, sessionFixture, acquireBrowserLease, openQaSession, ownerOf, holdEverySlot } = createQaSessionFixture(fixtureIo);

describe("repository browser lease", () => {
  it("serializes native processes through cleanup and composes with another lock", async () => {
    const { root, path } = leaseFixture();
    const [first] = await holdEverySlot(path);
    const second = fixtures.leaseProcess(path);
    expect(await second.first).toBe("waiting");
    // The caller's machine heavy lock has a different inode and is independent.
    expect(execFileSync("lockf", ["-k", "-t", "0", join(root, "heavy.lock"), process.execPath, "-e", "process.stdout.write('ok')"], { encoding: "utf8" })).toBe("ok");
    await Promise.all([first.release(), first.release()]);
    expect(await second.acquired).toBe(first.slot);
    const exited = once(second.child, "exit");
    second.child.send("release");
    expect((await exited)[0]).toBe(0);
    const third = await acquireBrowserLease(path);
    await third.release();
  });
  it("shares the real private common-Git lease and capture root across linked checkouts", async () => {
    const net = /** @type {typeof import("node:net")} */ (await vi.importActual("node:net"));
    const unrelated = net.createServer();
    unrelated.listen(0, "127.0.0.1");
    await once(unrelated, "listening");
    const address = unrelated.address();
    if (address === null || typeof address === "string") throw new Error("expected owned TCP listener");
    const port = address.port;
    try {
      const { root, worktree, path } = sessionFixture();
      vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue({ sessionId: "synthetic-session", url: "http://localhost:8931/mcp", protocolVersion: "2025-11-25", disconnect: vi.fn().mockResolvedValue(undefined), call: vi.fn(), close: vi.fn().mockResolvedValue(undefined) });
      const primary = await openQaSession({ bead: "synthetic-lease", label: "primary", port, prod: false, minify: false, cwd: root });
      expect(fixtureIo.children.map((child) => child.pid)).toContain(primary.serverPid);
      expect(primary.captureDir).toContain(join(root, "artifacts", "qa", "synthetic-lease", "invocations", "run-"));
      expect(primary.leasePath).toBe(path);
      expect(existsSync(primary.ownerPath)).toBe(true);
      await primary.close();
      expect(existsSync(primary.ownerPath)).toBe(false);
      fixtureIo.gitCwd = worktree;
      const linked = await openQaSession({ bead: "synthetic-lease", label: "linked", port, prod: false, minify: false, cwd: worktree });
      expect(fixtureIo.children.map((child) => child.pid)).toContain(linked.serverPid);
      expect(linked.captureDir).not.toBe(primary.captureDir);
      expect(existsSync(linked.ownerPath)).toBe(true);
      await linked.close();
      expect(existsSync(linked.ownerPath)).toBe(false);
      expect(fixtureIo.children.every((child) => child.exitCode !== null || child.signalCode !== null)).toBe(true);
      expect(existsSync(join(primary.captureDir, "primary.server.log"))).toBe(true);
      expect(existsSync(join(linked.captureDir, "linked.server.log"))).toBe(true);
      expect(unrelated.listening).toBe(true);
    } finally {
      await new Promise((/** @type {(error?: Error) => void} */ done) => unrelated.close(done));
    }
    expect(unrelated.listening).toBe(false);
  });
  it("settles an interrupted waiter without releasing its peer's lease", async () => {
    const { path } = leaseFixture();
    const [holder] = await holdEverySlot(path);
    const waiter = fixtures.leaseProcess(path);
    expect(await waiter.first).toBe("waiting");
    const exited = once(waiter.child, "exit");
    waiter.child.send("abort");
    expect((await exited)[0]).toBe(2);
    const controller = new AbortController();
    await expect(acquireBrowserLease(path, { signal: controller.signal, onWait: () => controller.abort() })).rejects.toThrow();
    await holder.release();
    const next = await acquireBrowserLease(path);
    await next.release();
  });
  it("recovers the native lock after parent crash while quarantining its remote ownership", async () => {
    const { root, path } = sessionFixture();
    const connect = vi.spyOn(runtime, "connectPlaywrightMcp").mockRejectedValue(new Error("unexpected synthetic connection"));
    const holder = fixtures.leaseProcess(path, { owner: true });
    const crashed = await holder.acquired;
    const exited = once(holder.child, "exit");
    holder.child.kill("SIGKILL");
    await exited;
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    const recovered = await acquireBrowserLease(path);
    expect(diagnostic.mock.calls.flat().join("\n")).toContain(ownerOf(path, crashed));
    expect(existsSync(ownerOf(path, crashed))).toBe(true);
    await recovered.release();
    writeFileSync(recovered.ownerPath, "synthetic retained record");
    await expect(openQaSession({ bead: "synthetic-lease", label: "after-crash", port: null, prod: false, minify: false, cwd: root })).rejects.toThrow(/requires reconciliation/);
    expect(connect).not.toHaveBeenCalled();
    expect([crashed, recovered.slot].every((slot) => existsSync(ownerOf(path, slot)))).toBe(true);
  });
  it("rejects permanent native path failures rather than retrying them", async () => {
    const { root } = leaseFixture();
    const denied = join(root, "denied.lock");
    writeFileSync(denied, "", { mode: 0 });
    await expect(acquireBrowserLease(denied, { slots: 1 })).rejects.toThrow(/lockf exited/);
  });
  it("interrupts session acquisition before starting any server or MCP client", async () => {
    const { root, path } = sessionFixture();
    const [holder] = await holdEverySlot(path);
    const connect = vi.spyOn(runtime, "connectPlaywrightMcp").mockRejectedValue(new Error("unexpected synthetic connection"));
    const exited = notification();
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { exited.resolve(); return /** @type {never} */ (undefined); });
    const beforeInt = process.listenerCount("SIGINT");
    const opening = openQaSession({ bead: "synthetic-lease", label: "waiter", port: null, prod: false, minify: false, cwd: root });
    const rejected = expect(opening).rejects.toThrow();
    process.listeners("SIGINT").at(-1)?.("SIGINT");
    try {
      await rejected;
      await exited.promise;
      expect(exit).toHaveBeenCalledWith(130);
      expect(connect).not.toHaveBeenCalled();
      expect(process.listenerCount("SIGINT")).toBe(beforeInt);
      const controller = new AbortController();
      await expect(acquireBrowserLease(path, { signal: controller.signal, onWait: () => controller.abort() })).rejects.toThrow();
    } finally {
      await holder.release();
    }
  });
  it("retains the native lease through delayed close and quarantines rejected provider cleanup", async () => {
    const { root, path } = sessionFixture();
    let finishClose = /** @type {() => void} */ (() => {});
    const closeStarted = notification();
    const browserClose = vi.fn(() => {
      closeStarted.resolve();
      return /** @type {Promise<void>} */ (new Promise((_done, reject) => { finishClose = () => reject(new Error("synthetic close failure")); }));
    });
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue({ sessionId: "synthetic-session", url: "http://localhost:8931/mcp", protocolVersion: "2025-11-25", disconnect: vi.fn().mockResolvedValue(undefined), call: vi.fn(), close: browserClose });
    const beforeInt = process.listenerCount("SIGINT");
    const session = await openQaSession({ bead: "synthetic-lease", label: "close", port: null, prod: false, minify: false, cwd: root });
    try {
      expect(existsSync(session.ownerPath)).toBe(true);
      const closing = session.close();
      const rejected = expect(closing).rejects.toThrow(/synthetic close failure/);
      expect(session.close()).toBe(closing);
      await expect(session.run("async () => null", {}, 1)).rejects.toThrow(/closed/);
      await closeStarted.promise;
      expect(browserClose).toHaveBeenCalledOnce();
      expect(lockHeld(browserSlotPath(path, session.slot))).toBe(true);
      finishClose();
      await rejected;
      expect(process.listenerCount("SIGINT")).toBe(beforeInt);
      expect(readFileSync(session.ownerPath, "utf8")).toContain('"providerState":"close-unconfirmed"');
      expect(lockHeld(browserSlotPath(path, session.slot))).toBe(false);
      const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
      const passed = await acquireBrowserLease(path);
      expect(diagnostic.mock.calls.flat().join("\n")).toContain(session.ownerPath);
      expect(existsSync(session.ownerPath)).toBe(true);
      await passed.release();
      // This synthetic provider is now explicitly reconciled by the fixture.
      rmSync(session.ownerPath);
      const next = await acquireBrowserLease(path);
      expect(next.slot).toBe(session.slot);
      await next.release();
    } finally {
      finishClose();
      await session.close().catch(() => {});
    }
  });
  it("joins an interrupted late connection before browser cleanup releases the lease", async () => {
    const { root, path } = sessionFixture();
    let finishConnection = /** @type {(client: Awaited<ReturnType<typeof runtime.connectPlaywrightMcp>>) => void} */ (() => {});
    const pending = new Promise((/** @type {(client: Awaited<ReturnType<typeof runtime.connectPlaywrightMcp>>) => void} */ done) => { finishConnection = done; });
    const connected = notification();
    const connect = vi.spyOn(runtime, "connectPlaywrightMcp").mockImplementation(() => { connected.resolve(); return pending; });
    const exited = notification();
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { exited.resolve(); return /** @type {never} */ (undefined); });
    const browserClose = vi.fn().mockResolvedValue(undefined);
    const beforeTerm = process.listenerCount("SIGTERM");
    const opening = openQaSession({ bead: "synthetic-lease", label: "interrupted", port: null, prod: false, minify: false, cwd: root });
    // Attach rejection before the synthetic interruption can settle startup.
    const rejected = expect(opening).rejects.toThrow();
    try {
      await connected.promise;
      expect(connect).toHaveBeenCalledOnce();
      process.listeners("SIGTERM").at(-1)?.("SIGTERM");
      expect(browserClose).not.toHaveBeenCalled();
      // A lone session takes the highest slot.
      expect(existsSync(ownerOf(path, 1))).toBe(true);
      expect(lockHeld(browserSlotPath(path, 1))).toBe(true);
      finishConnection({ sessionId: "synthetic-session", url: "http://localhost:8931/mcp", protocolVersion: "2025-11-25", disconnect: vi.fn().mockResolvedValue(undefined), call: vi.fn(), close: browserClose });
      await rejected;
      await exited.promise;
      expect(exit).toHaveBeenCalledWith(143);
      expect(browserClose).toHaveBeenCalledOnce();
      expect(existsSync(ownerOf(path, 1))).toBe(false);
      expect(process.listenerCount("SIGTERM")).toBe(beforeTerm);
      const next = await acquireBrowserLease(path);
      await next.release();
    } finally {
      finishConnection({ sessionId: "synthetic-session", url: "http://localhost:8931/mcp", protocolVersion: "2025-11-25", disconnect: vi.fn().mockResolvedValue(undefined), call: vi.fn(), close: browserClose });
      const session = await opening.catch(() => null);
      await session?.close();
    }
  });
  it("cleans up a failed session connection and leaves the shared lease reusable", async () => {
    const { root, path } = sessionFixture();
    vi.spyOn(runtime, "connectPlaywrightMcp").mockRejectedValue(new Error("synthetic connection failure"));
    const beforeTerm = process.listenerCount("SIGTERM");
    await expect(openQaSession({ bead: "synthetic-lease", label: "error", port: null, prod: false, minify: false, cwd: root })).rejects.toThrow(/synthetic connection failure/);
    const lease = await acquireBrowserLease(path);
    await lease.release();
    expect(process.listenerCount("SIGTERM")).toBe(beforeTerm);
    expect([0, 1].some((slot) => existsSync(ownerOf(path, slot)))).toBe(false);
  });
});
