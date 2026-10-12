// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as fs from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { browserSlotPath, serverRecordPath } from "./browser-lease.mjs";
import * as browserLease from "./browser-lease.mjs";
import * as serverOwnership from "./server-ownership.mjs";
import { lockHeld } from "./browser-lease-fixture.mjs";
import { createQaSessionFixture } from "./qa-session-fixture.mjs";
import * as runtime from "../screenshot-runtime.mjs";
import { BrowserOwnerClearError } from "./browser-owner-record.mjs";
vi.mock("./browser-lease.mjs", async (importOriginal) => ({
  .../** @type {typeof import("./browser-lease.mjs")} */ (await importOriginal()),
}));
vi.mock("./server-ownership.mjs", async (importOriginal) => ({
  .../** @type {typeof import("./server-ownership.mjs")} */ (await importOriginal()),
}));
vi.mock("node:fs", async (importOriginal) => ({
  .../** @type {typeof import("node:fs")} */ (await importOriginal()),
}));

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
const { notification, sessionFixture, openQaSession, ownerOf } = createQaSessionFixture(fixtureIo);

describe("browser identity admission", () => {
  it.each([
    { sessionId: undefined }, { sessionId: "" }, { sessionId: "unbound session" }, { sessionId: "invalid\nheader" },
    { protocolVersion: undefined }, { protocolVersion: "unsupported" }, { url: "file:///synthetic" },
    { url: "http://user:password@localhost:8931/mcp" }, { url: "http://localhost:8931/mcp#fragment" },
  ])("rejects unsupported metadata %j before browser tools, retaining honest evidence", async (invalid) => {
    const { root, path } = sessionFixture();
    const client = { sessionId: "synthetic-supported", protocolVersion: "2025-11-25", url: "http://localhost:8931/mcp",
      call: vi.fn(), close: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined), ...invalid };
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue(client);
    await expect(openQaSession({ bead: "synthetic-identity", label: "unsupported", port: null,
      prod: false, minify: false, cwd: root })).rejects.toThrow(/unsupported MCP session metadata/);
    expect(client.call).not.toHaveBeenCalled(); expect(client.close).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(JSON.parse(readFileSync(ownerOf(path, 1), "utf8"))).toMatchObject({ providerState: "metadata-unverified" });
    expect(JSON.parse(readFileSync(ownerOf(path, 1), "utf8"))).not.toHaveProperty("mcpExecutionCompleted");
    expect(lockHeld(browserSlotPath(path, 1))).toBe(false);
    expect(fixtureIo.children.every((child) => child.exitCode !== null || child.signalCode !== null)).toBe(true);
  });
  it.each(["rename", "directory-sync"])("disconnects a bound client if metadata publication fails at %s", async (fault) => {
    const { root, path } = sessionFixture();
    const client = { sessionId: "synthetic-supported", protocolVersion: "2025-11-25", url: "http://localhost:8931/mcp",
      call: vi.fn(), close: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue(client);
    let failed = false;
    if (fault === "rename") {
      const original = fs.renameSync;
      vi.spyOn(fs, "renameSync").mockImplementation((source, target) => {
        if (!failed && String(target).endsWith(".owner.json")) { failed = true; throw new Error("synthetic metadata publication failure"); }
        original(source, target);
      });
    } else {
      const original = fs.fsyncSync;
      vi.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
        const published = ownerOf(path, 1);
        if (!failed && fs.fstatSync(fd).isDirectory() && existsSync(published)) {
          const image = /** @type {unknown} */ (JSON.parse(readFileSync(published, "utf8")));
          if (typeof image === "object" && image !== null && "mcpSessionId" in image && image.mcpSessionId === client.sessionId) {
            failed = true; throw new Error("synthetic metadata publication failure");
          }
        }
        original(fd);
      });
    }
    await expect(openQaSession({ bead: "synthetic-identity", label: "publication", port: null,
      prod: false, minify: false, cwd: root })).rejects.toThrow(/synthetic metadata publication failure/);
    expect(client.call).not.toHaveBeenCalled(); expect(client.close).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledOnce();
    const owner = /** @type {unknown} */ (JSON.parse(readFileSync(ownerOf(path, 1), "utf8")));
    expect(owner).toMatchObject({ providerState: "startup-unconfirmed", mcpSessionId: client.sessionId });
    expect(owner).not.toHaveProperty("mcpExecutionCompleted");
    expect(lockHeld(browserSlotPath(path, 1))).toBe(false);
  });
  it("settles only the local SDK transport on connection rejection, preserving both failures", async () => {
    vi.spyOn(Client.prototype, "connect").mockRejectedValue(new Error("synthetic initialize failure"));
    const call = vi.spyOn(Client.prototype, "callTool");
    const localClose = vi.spyOn(Client.prototype, "close").mockResolvedValue(undefined);
    await expect(runtime.connectPlaywrightMcp()).rejects.toThrow(/synthetic initialize failure/);
    expect(localClose).toHaveBeenCalledOnce(); expect(call).not.toHaveBeenCalled();
    localClose.mockRejectedValue(new Error("synthetic local disconnect failure"));
    const error = await runtime.connectPlaywrightMcp().catch((/** @type {unknown} */ value) => value);
    expect(error).toBeInstanceOf(AggregateError);
    expect(/** @type {AggregateError} */ (error).errors.map(String)).toEqual([
      "Error: synthetic initialize failure", "Error: synthetic local disconnect failure",
    ]);
    expect(call).not.toHaveBeenCalled();
  });
});
describe("MCP browser ownership confirmation", () => {
  it.each(/** @type {Array<[boolean, "unlink" | "directory-sync"]>} */ ([[false, "unlink"], [false, "directory-sync"], [true, "unlink"], [true, "directory-sync"]]))(
    "reports local clear %s/%s without republishing or inventing browser uncertainty", async (connected, phase) => {
      const { root, path } = sessionFixture(); const ownerPath = ownerOf(path, 1);
      const diagnostic = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const actual = /** @type {typeof import("node:fs")} */ (await vi.importActual("node:fs"));
      let removed = false; let failed = false;
      const link = vi.spyOn(fs, "linkSync");
      vi.spyOn(fs, "unlinkSync").mockImplementation((target) => {
        if (String(target) === ownerPath && phase === "unlink") throw new Error("synthetic local unlink failure");
        actual.unlinkSync(target); if (String(target) === ownerPath) removed = true;
      });
      vi.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
        if (removed && !failed && actual.fstatSync(fd).isDirectory()) { failed = true; throw new Error("synthetic local directory-sync failure"); }
        actual.fsyncSync(fd);
      });
      if (connected) {
        vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
        vi.spyOn(Client.prototype, "callTool").mockResolvedValue({ content: [] });
        vi.spyOn(Client.prototype, "close").mockResolvedValue(undefined);
        const session = await openQaSession({ bead: "synthetic-clear", label: "connected-clear", port: null, prod: false, minify: false, cwd: root });
        const error = await session.close().catch((/** @type {unknown} */ value) => value);
        expect(error).toBeInstanceOf(BrowserOwnerClearError);
        expect(error).toMatchObject({ phase, unlinked: phase === "directory-sync" });
      } else {
        vi.spyOn(runtime, "connectPlaywrightMcp").mockRejectedValue(new Error("synthetic connection failure"));
        await expect(openQaSession({ bead: "synthetic-clear", label: "failed-connection-clear", port: null,
          prod: false, minify: false, cwd: root })).rejects.toThrow(/synthetic connection failure/);
      }
      expect(existsSync(ownerPath)).toBe(phase === "unlink");
      if (phase === "unlink") {
        const owner = /** @type {unknown} */ (JSON.parse(readFileSync(ownerPath, "utf8")));
        expect(owner).toMatchObject({ providerState: connected ? "execution-completed" : "startup-unconfirmed" });
        if (connected) expect(owner).toMatchObject({ mcpExecutionCompleted: true });
        else expect(owner).not.toHaveProperty("mcpExecutionCompleted");
      }
      expect(link.mock.calls.filter(([, target]) => String(target) === ownerPath)).toHaveLength(1);
      expect(diagnostic.mock.calls.map(([text]) => String(text)).join("\n")).toContain(ownerPath);
      expect(lockHeld(browserSlotPath(path, 1))).toBe(false);
    });
  it("preserves cleanup and persistence errors while reporting the owned reconciliation path", async () => {
    const { root } = sessionFixture();
    const diagnostic = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const closeError = new Error("synthetic provider close failure");
    const client = { sessionId: "synthetic-error", protocolVersion: "2025-11-25", url: "http://localhost:8931/mcp",
      call: vi.fn(), disconnect: vi.fn(), close: vi.fn().mockRejectedValue(closeError) };
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue(client);
    const session = await openQaSession({ bead: "synthetic-clear", label: "persistence-error", port: null, prod: false, minify: false, cwd: root });
    const prior = readFileSync(session.ownerPath); const persistenceError = new Error("synthetic ownership persistence failure");
    const original = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((source, target) => {
      if (String(target) === session.ownerPath) throw persistenceError;
      original(source, target);
    });
    const error = await session.close().catch((/** @type {unknown} */ value) => value);
    expect(error).toBeInstanceOf(AggregateError);
    expect(/** @type {AggregateError} */ (error).errors).toEqual([closeError, persistenceError]);
    expect(readFileSync(session.ownerPath).equals(prior)).toBe(true);
    expect(diagnostic.mock.calls.map(([text]) => String(text)).join("\n")).toContain(session.ownerPath);
    expect(lockHeld(browserSlotPath(session.leasePath, session.slot))).toBe(false);
  });
  it.each(["isError", "rejection"])("quarantines browser_close %s without a completion receipt while closing the SDK transport", async (kind) => {
    const { root } = sessionFixture();
    vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
    const call = vi.spyOn(Client.prototype, "callTool").mockResolvedValue({ isError: true, content: [{ type: "text", text: "synthetic semantic close failure" }] });
    if (kind === "rejection") call.mockRejectedValue(new Error("synthetic semantic close failure"));
    const sdkClose = vi.spyOn(Client.prototype, "close").mockResolvedValue(undefined);
    const session = await openQaSession({ bead: "synthetic-lease", label: "semantic-error", port: null, prod: false, minify: false, cwd: root });
    await expect(session.close()).rejects.toThrow(/synthetic semantic close failure/);
    expect(call).toHaveBeenCalledWith({ name: "browser_close", arguments: {} });
    expect(sdkClose).toHaveBeenCalledOnce();
    expect(existsSync(session.ownerPath)).toBe(true);
    expect(JSON.parse(readFileSync(session.ownerPath, "utf8"))).not.toHaveProperty("mcpExecutionCompleted");
  });
  it.each([false, true])("closes before draining active RPC, preserving transport uncertainty=%s", async (transportRejects) => {
    const { root, path } = sessionFixture();
    let finishCall = /** @type {() => void} */ (() => {});
    const rpc = /** @type {Promise<runtime.McpToolResult>} */ (new Promise((done, reject) => {
      finishCall = () => transportRejects ? reject(new Error("synthetic transport rejection")) : done({ content: [{ type: "text", text: '### Result\n{}' }] });
    }));
    const closeStarted = notification();
    const browserClose = vi.fn(async (/** @type {Parameters<Awaited<ReturnType<typeof runtime.connectPlaywrightMcp>>["close"]>[0]} */ before) => {
      closeStarted.resolve(); await before?.(true);
    });
    const call = vi.fn(() => rpc);
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue({ sessionId: "synthetic-session", url: "http://localhost:8931/mcp", protocolVersion: "2025-11-25", disconnect: vi.fn().mockResolvedValue(undefined), call, close: browserClose });
    const session = await openQaSession({ bead: "synthetic-lease", label: "active-call", port: null, prod: false, minify: false, cwd: root });
    const running = session.run("async () => null", {}, 1);
    const result = transportRejects ? expect(running).rejects.toThrow(/synthetic transport rejection/) : expect(running).resolves.toEqual({});
    const closing = session.close();
    const closed = transportRejects ? expect(closing).rejects.toThrow(/provider completion is unconfirmed/) : expect(closing).resolves.toBeUndefined();
    try {
      await closeStarted.promise;
      expect(browserClose).toHaveBeenCalledOnce();
      // Browser close happened, but the outstanding RPC still owns the slot.
      expect(lockHeld(browserSlotPath(path, session.slot))).toBe(true);
      expect(existsSync(session.ownerPath)).toBe(true);
      expect(JSON.parse(readFileSync(session.ownerPath, "utf8"))).not.toHaveProperty("mcpExecutionCompleted");
      finishCall();
      await result;
      await closed;
      expect(existsSync(session.ownerPath)).toBe(transportRejects);
      if (transportRejects) {
        expect(readFileSync(session.ownerPath, "utf8")).toContain('"providerState":"call-unconfirmed"');
        expect(JSON.parse(readFileSync(session.ownerPath, "utf8"))).not.toHaveProperty("mcpExecutionCompleted");
      }
    } finally {
      finishCall();
      await running.catch(() => {});
      await closing.catch(() => {});
    }
  });
  it("stops a session after an uncertain RPC without issuing subsequent verdict calls", async () => {
    const { root } = sessionFixture();
    const call = vi.fn().mockRejectedValue(new Error("synthetic uncertain RPC"));
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue({ sessionId: "synthetic-session", url: "http://localhost:8931/mcp", protocolVersion: "2025-11-25", disconnect: vi.fn().mockResolvedValue(undefined), call, close: vi.fn().mockResolvedValue(undefined) });
    const session = await openQaSession({ bead: "synthetic-lease", label: "uncertain", port: null, prod: false, minify: false, cwd: root });
    await expect(session.run("async () => null", {}, 1)).rejects.toThrow(/synthetic uncertain RPC/);
    expect(session.closed()).toBe(true);
    await expect(session.run("async () => null", {}, 1)).rejects.toThrow(/requires provider reconciliation/);
    expect(call).toHaveBeenCalledOnce();
    await expect(session.close()).rejects.toThrow(/provider completion is unconfirmed/);
    expect(existsSync(session.ownerPath)).toBe(true);
  });
  it("treats a structured semantic RPC rejection as a settled provider response", async () => {
    const { root } = sessionFixture();
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
    expect(existsSync(session.ownerPath)).toBe(false);
  });
  it("drains semantic RPC settlement between browser close and SDK transport teardown", async () => {
    const { root } = sessionFixture();
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
    const sdkClose = vi.spyOn(Client.prototype, "close").mockImplementation(() => {
      events.push("transport-closed");
      expect(JSON.parse(readFileSync(session.ownerPath, "utf8"))).toMatchObject({ mcpExecutionCompleted: true, providerState: "execution-completed" });
      return Promise.resolve();
    });
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
      expect(existsSync(session.ownerPath)).toBe(false);
    } finally {
      finishCall();
      await running.catch(() => {});
      await closing;
    }
  });
  it("retains a durable completed receipt after SDK transport-close failure", async () => {
    const { root, path } = sessionFixture();
    vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
    vi.spyOn(Client.prototype, "callTool").mockResolvedValue({ content: [] });
    vi.spyOn(Client.prototype, "close").mockRejectedValue(new Error("synthetic transport-close failure"));
    const session = await openQaSession({ bead: "synthetic-lease", label: "transport-failure", port: null, prod: false, minify: false, cwd: root });
    await expect(session.close()).rejects.toThrow(/synthetic transport-close failure/);
    expect(JSON.parse(readFileSync(session.ownerPath, "utf8"))).toMatchObject({ mcpExecutionCompleted: true, providerState: "close-unconfirmed" });
    expect(lockHeld(browserSlotPath(path, session.slot))).toBe(false);
  });
  it("preserves a replacement ownership record after confirmed provider completion", async () => {
    const { root } = sessionFixture();
    const browserClose = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue({ sessionId: "synthetic-session", url: "http://localhost:8931/mcp", protocolVersion: "2025-11-25", disconnect: vi.fn().mockResolvedValue(undefined), call: vi.fn(), close: browserClose });
    const session = await openQaSession({ bead: "synthetic-lease", label: "replacement", port: null, prod: false, minify: false, cwd: root });
    const replacement = JSON.stringify({ token: "different-synthetic-owner" });
    writeFileSync(session.ownerPath, replacement);
    await expect(session.close()).rejects.toThrow(/owner record changed/);
    expect(browserClose).toHaveBeenCalledOnce();
    expect(readFileSync(session.ownerPath, "utf8")).toBe(replacement);
  });
});

/** Original public causes, including structured failures from the MCP wrapper.
 * @param {unknown} error @returns {unknown[]}
 */
function failureCauses(error) {
  return error instanceof AggregateError ? error.errors.flatMap(failureCauses) : [error];
}

describe("terminal cleanup failures", () => {
  it.each([{ protectedServer: false, unprintable: false }, { protectedServer: true, unprintable: false }, { protectedServer: false, unprintable: true }])(
    "preserves combined failures while attempting later releases: %j", async ({ protectedServer, unprintable }) => {
    const { root } = sessionFixture();
    const diagnostic = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const closeError = new Error("synthetic provider close failure");
    const persistenceError = new Error("synthetic ownership persistence failure");
    let serverError = new Error("synthetic owned server cleanup failure");
    const releaseError = new Error("synthetic browser lease release failure");
    if (unprintable) for (const error of [closeError, persistenceError, serverError, releaseError]) {
      error.toString = () => { throw new Error("synthetic cause formatting rejection"); };
    }
    const client = { sessionId: "synthetic-combined", protocolVersion: "2025-11-25", url: "http://localhost:8931/mcp",
      call: vi.fn(), disconnect: vi.fn(), close: vi.fn().mockRejectedValue(closeError) };
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue(client);
    const actualSpawn = serverOwnership.spawnOwnedServer;
    const serverStop = vi.fn();
    vi.spyOn(serverOwnership, "spawnOwnedServer").mockImplementation(async (options) => {
      const owned = await actualSpawn(options);
      serverStop.mockImplementation(async () => {
        try { await owned.stop(); } catch (error) { serverError = /** @type {Error} */ (error); throw error; }
        throw serverError;
      });
      return { ...owned, stop: serverStop };
    });
    const actualAcquire = browserLease.acquireBrowserLease;
    let settleLease = () => Promise.resolve();
    const release = vi.fn().mockRejectedValue(releaseError);
    vi.spyOn(browserLease, "acquireBrowserLease").mockImplementation(async (path, options) => {
      const lease = await actualAcquire(path, options); settleLease = lease.release;
      return { ...lease, release };
    });
    const handlersBefore = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    const session = await openQaSession({ bead: "synthetic-combined", label: "combined", port: null, prod: false, minify: false, cwd: root });
    const prior = readFileSync(session.ownerPath);
    const serverPath = serverRecordPath(browserSlotPath(session.leasePath, session.slot));
    const replacement = JSON.stringify({ token: "different-synthetic-server-owner" });
    if (protectedServer) writeFileSync(serverPath, replacement);
    const originalRename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((source, target) => {
      if (String(target) === session.ownerPath) throw persistenceError;
      originalRename(source, target);
    });
    try {
      const closing = session.close(); expect(session.close()).toBe(closing);
      const error = await closing.catch((/** @type {unknown} */ value) => value);
      expect(failureCauses(error)).toEqual([closeError, persistenceError, serverError, releaseError]);
      expect(String(error)).toContain(session.ownerPath);
      expect(readFileSync(session.ownerPath).equals(prior)).toBe(true);
      expect(JSON.parse(prior.toString())).not.toHaveProperty("mcpExecutionCompleted");
      expect(existsSync(serverPath)).toBe(protectedServer);
      if (protectedServer) {
        expect(readFileSync(serverPath, "utf8")).toBe(replacement);
        expect(serverError.message).toMatch(/server record changed/);
      }
      expect(lockHeld(browserSlotPath(session.leasePath, session.slot))).toBe(true);
      expect(lockHeld(join(session.captureDir, "combined.server.log"))).toBe(false);
      expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(handlersBefore);
      expect(client.close).toHaveBeenCalledOnce(); expect(serverStop).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce();
      await expect(session.close()).rejects.toBe(error);
      expect(client.close).toHaveBeenCalledOnce(); expect(serverStop).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce();
      expect(diagnostic.mock.calls.map(([text]) => String(text)).join("\n")).toContain(session.ownerPath);
    } finally { await settleLease(); }
    expect(lockHeld(browserSlotPath(session.leasePath, session.slot))).toBe(false);
  });
  it("preserves one late release error after actual successful provider/server cleanup", async () => {
    const { root } = sessionFixture();
    const releaseError = new Error("synthetic evidence deletion durability failure");
    vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
    const call = vi.spyOn(Client.prototype, "callTool").mockResolvedValue({ content: [] });
    const transportClose = vi.spyOn(Client.prototype, "close").mockResolvedValue(undefined);
    const actualLock = browserLease.tryBrowserLock;
    const release = vi.fn();
    vi.spyOn(browserLease, "tryBrowserLock").mockImplementation(async (path, signal) => {
      const lock = await actualLock(path, signal);
      if (lock === null || !path.endsWith("single.server.log")) return lock;
      release.mockImplementation(async () => { await lock.release(); throw releaseError; });
      return { release };
    });
    const session = await openQaSession({ bead: "synthetic-single", label: "single", port: null, prod: false, minify: false, cwd: root });
    const closing = session.close(); expect(session.close()).toBe(closing);
    await expect(closing).rejects.toBe(releaseError);
    await expect(session.close()).rejects.toBe(releaseError);
    expect(call).toHaveBeenCalledOnce(); expect(transportClose).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce();
    expect(existsSync(session.ownerPath)).toBe(false);
    expect(existsSync(serverRecordPath(browserSlotPath(session.leasePath, session.slot)))).toBe(false);
    expect(lockHeld(browserSlotPath(session.leasePath, session.slot))).toBe(false);
    expect(lockHeld(join(session.captureDir, "single.server.log"))).toBe(false);
    expect(fixtureIo.children.every((child) => child.exitCode !== null || child.signalCode !== null)).toBe(true);
  });
  it("retains a provider cause when its diagnostic output also rejects", async () => {
    const { root } = sessionFixture();
    const closeError = new Error("synthetic provider failure");
    const outputError = new Error("synthetic diagnostic failure");
    const client = { sessionId: "synthetic-output", protocolVersion: "2025-11-25", url: "http://localhost:8931/mcp",
      call: vi.fn(), disconnect: vi.fn(), close: vi.fn().mockRejectedValue(closeError) };
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue(client);
    const session = await openQaSession({ bead: "synthetic-output", label: "output", port: null, prod: false, minify: false, cwd: root });
    vi.spyOn(process.stderr, "write").mockImplementation((text) => {
      if (String(text).includes("browser provider completion")) throw outputError;
      return true;
    });
    const error = await session.close().catch((/** @type {unknown} */ value) => value);
    expect(failureCauses(error)).toEqual([closeError, outputError]);
    expect(JSON.parse(readFileSync(session.ownerPath, "utf8"))).toMatchObject({ providerState: "close-unconfirmed" });
    expect(lockHeld(browserSlotPath(session.leasePath, session.slot))).toBe(false);
    expect(lockHeld(join(session.captureDir, "output.server.log"))).toBe(false);
    expect(fixtureIo.children.every((child) => child.exitCode !== null || child.signalCode !== null)).toBe(true);
  });
});
