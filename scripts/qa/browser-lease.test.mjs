// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { acquireBrowserLease as acquireNativeBrowserLease, browserLeasePath } from "./browser-lease.mjs";
import { openQaSession as openNativeQaSession } from "./run-scenario.mjs";
import * as runtime from "../screenshot-runtime.mjs";
// Fixture subprocesses stay inside Tollgate's session. The actual native
// utility and pipe protocol run unchanged; only fixture process ownership is
// translated from isolated groups to direct children of this test worker.
const fixtureIo = vi.hoisted(() => ({
  gitCwd: /** @type {string | null} */ (null),
  children: /** @type {import("node:child_process").ChildProcess[]} */ ([]),
  ready: /** @type {Promise<void>} */ (Promise.resolve()),
}));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = /** @type {typeof import("node:child_process")} */ (await importOriginal());
  return {
    ...actual,
    spawn: vi.fn((/** @type {string} */ command, /** @type {string[]} */ args, /** @type {import("node:child_process").SpawnOptions} */ options) => {
      const server = args[0] === "scripts/dev.mjs";
      const stdio = /** @type {import("node:child_process").SpawnOptions["stdio"]} */ (server && Array.isArray(options.stdio) ? [...options.stdio, "ipc"] : options.stdio);
      const child = actual.spawn(command, args, { ...options, stdio, detached: false });
      if (server) fixtureIo.ready = new Promise((done, reject) => {
        const failed = () => { child.removeListener("message", ready); reject(new Error("synthetic server exited before ready")); };
        const ready = () => { child.removeListener("close", failed); child.removeListener("error", failed); child.removeListener("exit", failed); done(); };
        child.once("message", ready);
        child.once("close", failed);
        child.once("error", failed);
        child.once("exit", failed);
      });
      if (server) void fixtureIo.ready.catch(() => {});
      fixtureIo.children.push(child);
      return child;
    }),
    execFileSync: vi.fn((/** @type {string} */ command, /** @type {string[]} */ args, /** @type {import("node:child_process").ExecFileSyncOptionsWithStringEncoding} */ options) => {
      const cwd = command === "git" && args.includes("--git-common-dir") ? fixtureIo.gitCwd : null;
      return actual.execFileSync(command, args, cwd === null ? options : { ...options, cwd });
    }),
  };
});
// Socket availability and HTTP readiness are boundaries of the server runner,
// independent of the lease/ownership contract. Native lockf pipes remain real.
vi.mock("node:net", async (importOriginal) => {
  const actual = /** @type {typeof import("node:net")} */ (await importOriginal());
  const { EventEmitter } = await import("node:events");
  return {
    ...actual,
    createConnection: vi.fn(() => {
      const socket = Object.assign(new EventEmitter(), { destroy() {} });
      queueMicrotask(() => socket.emit("error", new Error("synthetic unused port")));
      return socket;
    }),
    createServer: vi.fn(() => {
      const server = new EventEmitter();
      return Object.assign(server, {
        /** @param {unknown} _options @param {() => void} ready */
        listen(_options, ready) { queueMicrotask(ready); return server; },
        /** @param {() => void} closed */
        close(closed) { queueMicrotask(closed); },
      });
    }),
  };
});
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
  vi.stubGlobal("fetch", vi.fn(async () => { await fixtureIo.ready; return { status: 200 }; }));
  vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
    const owned = fixtureIo.children.find((child) => child.pid === -pid);
    if (pid < 0 && owned !== undefined) {
      owned.stdin?.end();
      return realKill(-pid, signal);
    }
    return realKill(pid, signal);
  });
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

/** @param {string} path @param {boolean} [withOwner] */
function leaseProcess(path, withOwner = false) {
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
    import { writeFileSync } from "node:fs";
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
      if (${String(withOwner)}) writeFileSync(${JSON.stringify(`${path}.owner.json`)}, JSON.stringify({ token: "synthetic-crashed-owner", pid: process.pid }));
      process.send("acquired");
    } catch { process.exit(2); }
  `], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  return child;
}

describe("repository browser lease", () => {
  it("serializes native processes through cleanup and composes with another lock", async () => {
    const { root, path } = leaseFixture();
    const first = await acquireBrowserLease(path);
    const second = leaseProcess(path);
    expect((await once(second, "message"))[0]).toBe("waiting");
    // The caller's machine heavy lock has a different inode and is independent.
    expect(execFileSync("lockf", ["-k", "-t", "0", join(root, "heavy.lock"), process.execPath, "-e", "process.stdout.write('ok')"], { encoding: "utf8" })).toBe("ok");
    const acquired = once(second, "message");
    await Promise.all([first.release(), first.release()]);
    expect((await acquired)[0]).toBe("acquired");
    const exited = once(second, "exit");
    second.send("release");
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
      vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue({ call: vi.fn(), close: vi.fn().mockResolvedValue(undefined) });
      const primary = await openQaSession({ bead: "synthetic-lease", label: "primary", port, prod: false, minify: false, cwd: root });
      expect(fixtureIo.children.map((child) => child.pid)).toContain(primary.serverPid);
      expect(primary.captureDir).toBe(join(root, "artifacts", "qa", "synthetic-lease"));
      expect(existsSync(`${path}.owner.json`)).toBe(true);
      await primary.close();
      expect(existsSync(`${path}.owner.json`)).toBe(false);
      fixtureIo.gitCwd = worktree;
      const linked = await openQaSession({ bead: "synthetic-lease", label: "linked", port, prod: false, minify: false, cwd: worktree });
      expect(fixtureIo.children.map((child) => child.pid)).toContain(linked.serverPid);
      expect(linked.captureDir).toBe(primary.captureDir);
      expect(existsSync(`${path}.owner.json`)).toBe(true);
      await linked.close();
      expect(existsSync(`${path}.owner.json`)).toBe(false);
      expect(fixtureIo.children.every((child) => child.exitCode !== null || child.signalCode !== null)).toBe(true);
      expect(existsSync(join(primary.captureDir, "primary.server.log"))).toBe(true);
      expect(existsSync(join(primary.captureDir, "linked.server.log"))).toBe(true);
      expect(unrelated.listening).toBe(true);
    } finally {
      await new Promise((/** @type {(error?: Error) => void} */ done) => unrelated.close(done));
    }
    expect(unrelated.listening).toBe(false);
  });
  it("settles an interrupted waiter without releasing its peer's lease", async () => {
    const { path } = leaseFixture();
    const holder = await acquireBrowserLease(path);
    const waiter = leaseProcess(path);
    expect((await once(waiter, "message"))[0]).toBe("waiting");
    const exited = once(waiter, "exit");
    waiter.send("abort");
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
    const holder = leaseProcess(path, true);
    expect((await once(holder, "message"))[0]).toBe("acquired");
    const exited = once(holder, "exit");
    holder.kill("SIGKILL");
    await exited;
    const recovered = await acquireBrowserLease(path);
    await recovered.release();
    expect(existsSync(`${path}.owner.json`)).toBe(true);
    await expect(openQaSession({ bead: "synthetic-lease", label: "after-crash", port: null, prod: false, minify: false, cwd: root })).rejects.toThrow(/requires reconciliation/);
    expect(connect).not.toHaveBeenCalled();
    expect(existsSync(`${path}.owner.json`)).toBe(true);
  });
  it("rejects permanent native path failures rather than retrying them", async () => {
    const { root } = leaseFixture();
    const denied = join(root, "denied.lock");
    writeFileSync(denied, "", { mode: 0 });
    await expect(acquireBrowserLease(denied)).rejects.toThrow(/lockf exited/);
  });
  it("interrupts session acquisition before starting any server or MCP client", async () => {
    const { root, path } = sessionFixture();
    const holder = await acquireBrowserLease(path);
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
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue({ call: vi.fn(), close: browserClose });
    const beforeInt = process.listenerCount("SIGINT");
    const session = await openQaSession({ bead: "synthetic-lease", label: "close", port: null, prod: false, minify: false, cwd: root });
    try {
      expect(existsSync(`${path}.owner.json`)).toBe(true);
      const closing = session.close();
      const rejected = expect(closing).rejects.toThrow(/synthetic close failure/);
      expect(session.close()).toBe(closing);
      await expect(session.run("async () => null", {}, 1)).rejects.toThrow(/closed/);
      await closeStarted.promise;
      expect(browserClose).toHaveBeenCalledOnce();
      const controller = new AbortController();
      await expect(acquireBrowserLease(path, { signal: controller.signal, onWait: () => controller.abort() })).rejects.toThrow();
      finishClose();
      await rejected;
      expect(process.listenerCount("SIGINT")).toBe(beforeInt);
      expect(existsSync(`${path}.owner.json`)).toBe(true);
      await expect(openQaSession({ bead: "synthetic-lease", label: "quarantined", port: null, prod: false, minify: false, cwd: root })).rejects.toThrow(/requires reconciliation/);
      // This synthetic provider is now explicitly reconciled by the fixture.
      rmSync(`${path}.owner.json`);
      const next = await acquireBrowserLease(path);
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
      expect(existsSync(`${path}.owner.json`)).toBe(true);
      const controller = new AbortController();
      await expect(acquireBrowserLease(path, { signal: controller.signal, onWait: () => controller.abort() })).rejects.toThrow();
      finishConnection({ call: vi.fn(), close: browserClose });
      await rejected;
      await exited.promise;
      expect(exit).toHaveBeenCalledWith(143);
      expect(browserClose).toHaveBeenCalledOnce();
      expect(existsSync(`${path}.owner.json`)).toBe(false);
      expect(process.listenerCount("SIGTERM")).toBe(beforeTerm);
      const next = await acquireBrowserLease(path);
      await next.release();
    } finally {
      finishConnection({ call: vi.fn(), close: browserClose });
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
    expect(existsSync(`${path}.owner.json`)).toBe(false);
  });
});
describe("MCP browser ownership confirmation", () => {
  it("quarantines semantic browser_close errors while closing the SDK transport", async () => {
    const { root, path } = sessionFixture();
    vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
    const call = vi.spyOn(Client.prototype, "callTool").mockResolvedValue({ isError: true, content: [{ type: "text", text: "synthetic semantic close failure" }] });
    const sdkClose = vi.spyOn(Client.prototype, "close").mockResolvedValue(undefined);
    const session = await openQaSession({ bead: "synthetic-lease", label: "semantic-error", port: null, prod: false, minify: false, cwd: root });
    await expect(session.close()).rejects.toThrow(/synthetic semantic close failure/);
    expect(call).toHaveBeenCalledWith({ name: "browser_close", arguments: {} });
    expect(sdkClose).toHaveBeenCalledOnce();
    expect(existsSync(`${path}.owner.json`)).toBe(true);
  });
  it.each([false, true])("closes before draining active RPC, preserving transport uncertainty=%s", async (transportRejects) => {
    const { root, path } = sessionFixture();
    let finishCall = /** @type {() => void} */ (() => {});
    const rpc = /** @type {Promise<runtime.McpToolResult>} */ (new Promise((done, reject) => {
      finishCall = () => transportRejects ? reject(new Error("synthetic transport rejection")) : done({ content: [{ type: "text", text: '### Result\n{}' }] });
    }));
    const closeStarted = notification();
    const browserClose = vi.fn(() => { closeStarted.resolve(); return Promise.resolve(); });
    const call = vi.fn(() => rpc);
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue({ call, close: browserClose });
    const session = await openQaSession({ bead: "synthetic-lease", label: "active-call", port: null, prod: false, minify: false, cwd: root });
    const running = session.run("async () => null", {}, 1);
    const result = transportRejects ? expect(running).rejects.toThrow(/synthetic transport rejection/) : expect(running).resolves.toEqual({});
    const closing = session.close();
    const closed = transportRejects ? expect(closing).rejects.toThrow(/provider completion is unconfirmed/) : expect(closing).resolves.toBeUndefined();
    try {
      await closeStarted.promise;
      expect(browserClose).toHaveBeenCalledOnce();
      // Browser close happened, but the outstanding RPC still owns the lease.
      const controller = new AbortController();
      await expect(acquireBrowserLease(path, { signal: controller.signal, onWait: () => controller.abort() })).rejects.toThrow();
      expect(existsSync(`${path}.owner.json`)).toBe(true);
      finishCall();
      await result;
      await closed;
      expect(existsSync(`${path}.owner.json`)).toBe(transportRejects);
      if (transportRejects) expect(readFileSync(`${path}.owner.json`, "utf8")).toContain('"providerState":"call-unconfirmed"');
    } finally {
      finishCall();
      await running.catch(() => {});
      await closing.catch(() => {});
    }
  });
  it("stops a session after an uncertain RPC without issuing subsequent verdict calls", async () => {
    const { root, path } = sessionFixture();
    const call = vi.fn().mockRejectedValue(new Error("synthetic uncertain RPC"));
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue({ call, close: vi.fn().mockResolvedValue(undefined) });
    const session = await openQaSession({ bead: "synthetic-lease", label: "uncertain", port: null, prod: false, minify: false, cwd: root });
    await expect(session.run("async () => null", {}, 1)).rejects.toThrow(/synthetic uncertain RPC/);
    expect(session.closed()).toBe(true);
    await expect(session.run("async () => null", {}, 1)).rejects.toThrow(/requires provider reconciliation/);
    expect(call).toHaveBeenCalledOnce();
    await expect(session.close()).rejects.toThrow(/provider completion is unconfirmed/);
    expect(existsSync(`${path}.owner.json`)).toBe(true);
  });
  it("treats a structured semantic RPC rejection as a settled provider response", async () => {
    const { root, path } = sessionFixture();
    vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
    const call = vi.spyOn(Client.prototype, "callTool")
      .mockResolvedValueOnce({ isError: true, content: [{ type: "text", text: "synthetic semantic run rejection" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "### Result\n{}" }] })
      .mockResolvedValueOnce({ content: [] });
    const sdkClose = vi.spyOn(Client.prototype, "close").mockResolvedValue(undefined);
    const session = await openQaSession({ bead: "synthetic-lease", label: "semantic-run", port: null, prod: false, minify: false, cwd: root });
    await expect(session.run("async () => null", {}, 1)).rejects.toBeInstanceOf(runtime.McpToolResponseError);
    expect(session.closed()).toBe(false);
    await expect(session.run("async () => null", {}, 1)).resolves.toEqual({});
    expect(call).toHaveBeenCalledTimes(2);
    await session.close();
    expect(sdkClose).toHaveBeenCalledOnce();
    expect(existsSync(`${path}.owner.json`)).toBe(false);
  });
  it("drains semantic RPC settlement between browser close and SDK transport teardown", async () => {
    const { root, path } = sessionFixture();
    const events = /** @type {string[]} */ ([]);
    const closeStarted = notification();
    let finishCall = /** @type {() => void} */ (() => {});
    const rpc = /** @type {ReturnType<Client["callTool"]>} */ (new Promise((done) => {
      finishCall = () => {
        events.push("rpc-settled");
        done({ isError: true, content: [{ type: "text", text: "synthetic interrupted provider" }] });
      };
    }));
    vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
    vi.spyOn(Client.prototype, "callTool").mockImplementation((request) => {
      if (request.name === "browser_run_code_unsafe") return rpc;
      events.push("browser-closed");
      closeStarted.resolve();
      return Promise.resolve({ content: [] });
    });
    const sdkClose = vi.spyOn(Client.prototype, "close").mockImplementation(() => { events.push("transport-closed"); return Promise.resolve(); });
    const session = await openQaSession({ bead: "synthetic-lease", label: "transport-order", port: null, prod: false, minify: false, cwd: root });
    const running = session.run("async () => null", {}, 1);
    const result = expect(running).rejects.toBeInstanceOf(runtime.McpToolResponseError);
    const closing = session.close();
    try {
      await closeStarted.promise;
      expect(events).toEqual(["browser-closed"]);
      expect(sdkClose).not.toHaveBeenCalled();
      finishCall();
      await result;
      await closing;
      expect(events).toEqual(["browser-closed", "rpc-settled", "transport-closed"]);
      expect(existsSync(`${path}.owner.json`)).toBe(false);
    } finally {
      finishCall();
      await running.catch(() => {});
      await closing;
    }
  });
  it("preserves a replacement ownership record after confirmed provider completion", async () => {
    const { root, path } = sessionFixture();
    const browserClose = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue({ call: vi.fn(), close: browserClose });
    const session = await openQaSession({ bead: "synthetic-lease", label: "replacement", port: null, prod: false, minify: false, cwd: root });
    const replacement = JSON.stringify({ token: "different-synthetic-owner" });
    writeFileSync(`${path}.owner.json`, replacement);
    await expect(session.close()).rejects.toThrow(/owner record changed/);
    expect(browserClose).toHaveBeenCalledOnce();
    expect(readFileSync(`${path}.owner.json`, "utf8")).toBe(replacement);
  });
});
