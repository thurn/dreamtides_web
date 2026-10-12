// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import * as fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createQaSessionFixture } from "./qa-session-fixture.mjs";
import { browserSlotPath } from "./browser-lease.mjs";
import { lockHeld } from "./browser-lease-fixture.mjs";
import { BrowserOwnerClearError } from "./browser-owner-record.mjs";
import * as runtime from "../screenshot-runtime.mjs";
vi.mock("node:fs", async (importOriginal) => ({ .../** @type {typeof import("node:fs")} */ (await importOriginal()) }));
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
const { fixtures, sessionFixture, openQaSession, ownerOf } = createQaSessionFixture(fixtureIo);
/** @param {unknown} error @returns {unknown[]} */
const causes = (error) => error instanceof AggregateError ? error.errors.flatMap(causes) : [error];
/** @param {string} name */
function unprintable(name) {
  const error = new Error(name);
  error.toString = () => { throw new Error("synthetic coercion rejection"); };
  return error;
}
describe("MCP cleanup boundaries", () => {
  it.each([[true, false, false], [false, true, false], [false, false, true], [true, true, true], [false, true, true]])(
    "retains actual browser/callback/transport causes (%s/%s/%s)", async (browserFails, callbackFails, transportFails) => {
      const browserError = unprintable("synthetic browser cause");
      const callbackError = unprintable("synthetic receipt cause");
      const transportError = unprintable("synthetic transport cause");
      const events = /** @type {Array<string | boolean>} */ ([]);
      vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
      vi.spyOn(Client.prototype, "callTool").mockImplementation(() => {
        events.push("browser"); return browserFails ? Promise.reject(browserError) : Promise.resolve({ content: [] });
      });
      vi.spyOn(Client.prototype, "close").mockImplementation(() => {
        events.push("transport"); return transportFails ? Promise.reject(transportError) : Promise.resolve();
      });
      const client = await runtime.connectPlaywrightMcp();
      const error = await client.close((confirmed) => {
        events.push(confirmed); return callbackFails ? Promise.reject(callbackError) : Promise.resolve();
      }).catch((/** @type {unknown} */ value) => value);
      const expected = [browserFails ? browserError : null, callbackFails ? callbackError : null, transportFails ? transportError : null].filter((value) => value !== null);
      if (expected.length === 1) expect(error).toBe(expected[0]);
      expect(causes(error)).toEqual(expected);
      expect(events).toEqual(["browser", !browserFails, "transport"]);
    });
});
describe("startup and local clear boundaries", () => {
  it("preserves startup and failed local clear causes despite throwing coercion", async () => {
    const { root, path } = sessionFixture();
    fs.mkdirSync(join(root, "artifacts"), { recursive: true });
    const holder = await fixtures.legacyHolder(path);
    // Slot0 is held; slot1 is the only available slot, independent of policy.
    const ownerPath = ownerOf(path, 1);
    const startupError = unprintable("synthetic initialize cause");
    const clearError = unprintable("synthetic unlink cause");
    vi.spyOn(Client.prototype, "connect").mockRejectedValue(startupError);
    const tools = vi.spyOn(Client.prototype, "callTool");
    vi.spyOn(Client.prototype, "close").mockResolvedValue(undefined);
    const actual = /** @type {typeof import("node:fs")} */ (await vi.importActual("node:fs"));
    vi.spyOn(fs, "unlinkSync").mockImplementation((target) => {
      if (String(target) === ownerPath) throw clearError;
      actual.unlinkSync(target);
    });
    const error = await openQaSession({ bead: "synthetic-startup", label: "startup", port: null, prod: false, minify: false, cwd: root }).catch((/** @type {unknown} */ value) => value);
    const observed = causes(error);
    expect(observed[0]).toBe(startupError);
    expect(observed[1]).toBeInstanceOf(BrowserOwnerClearError);
    expect(observed[1]).toMatchObject({ phase: "unlink", unlinked: false, cause: clearError });
    expect(tools).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(ownerPath, "utf8"))).toMatchObject({ providerState: "startup-unconfirmed" });
    expect(lockHeld(browserSlotPath(path, 1))).toBe(false);
    expect(lockHeld(path)).toBe(true);
    const holderClosed = once(holder, "close");
    holder.stdin?.end();
    await holderClosed;
    expect(lockHeld(path)).toBe(false);
    expect(fixtureIo.children.every((child) => child.exitCode !== null || child.signalCode !== null)).toBe(true);
  });
  it("keeps a post-unlink flush cause and outcome without republishing", async () => {
    const { root, path } = sessionFixture();
    const flushError = unprintable("synthetic deletion flush cause");
    vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
    vi.spyOn(Client.prototype, "callTool").mockResolvedValue({ content: [] });
    vi.spyOn(Client.prototype, "close").mockResolvedValue(undefined);
    const session = await openQaSession({ bead: "synthetic-clear", label: "clear", port: null, prod: false, minify: false, cwd: root });
    const ownerPath = session.ownerPath;
    const actual = /** @type {typeof import("node:fs")} */ (await vi.importActual("node:fs"));
    let removed = false;
    const link = vi.spyOn(fs, "linkSync");
    vi.spyOn(fs, "unlinkSync").mockImplementation((target) => { actual.unlinkSync(target); if (String(target) === ownerPath) removed = true; });
    vi.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
      if (removed && actual.fstatSync(fd).isDirectory()) throw flushError;
      actual.fsyncSync(fd);
    });
    const closing = session.close(); expect(session.close()).toBe(closing);
    const error = await closing.catch((/** @type {unknown} */ value) => value);
    expect(error).toBeInstanceOf(BrowserOwnerClearError);
    expect(error).toMatchObject({ phase: "directory-sync", unlinked: true, cause: flushError });
    await expect(session.close()).rejects.toBe(error);
    expect(existsSync(ownerPath)).toBe(false); expect(link).not.toHaveBeenCalled();
    expect(lockHeld(browserSlotPath(path, session.slot))).toBe(false);
    expect(lockHeld(join(session.captureDir, "clear.server.log"))).toBe(false);
  });
});
describe("actual owned signal cleanup", () => {
  it.each(/** @type {Array<[NodeJS.Signals, string]>} */ ([["SIGINT", "initial"], ["SIGTERM", "initial"], ["SIGINT", "interruption"], ["SIGTERM", "interruption"], ["SIGINT", "concurrent"], ["SIGTERM", "concurrent"]]))(
    "settles owned resources after %s/%s before exit", async (signal, mode) => {
      const { root } = sessionFixture();
      const actual = /** @type {typeof import("node:child_process")} */ (await vi.importActual("node:child_process"));
      const child = actual.spawn(process.execPath, [fileURLToPath(new URL("./qa-signal-fixture.mjs", import.meta.url)), fileURLToPath(new URL("../..", import.meta.url)), root, mode],
        { stdio: ["ignore", "ignore", "pipe", "ipc"], detached: false });
      fixtureIo.children.push(child);
      const entry = { pid: Number(child.pid), group: Number(actual.execFileSync("ps", ["-p", String(child.pid), "-o", "pgid="], { encoding: "utf8" }).trim()), closed: false };
      fixtureIo.groups.push(entry); child.once("close", () => { entry.closed = true; });
      const closed = /** @type {Promise<[number | null, NodeJS.Signals | null]>} */ (once(child, "close"));
      const readyPromise = /** @type {Promise<[unknown]>} */ (once(child, "message"));
      const [ready] = await readyPromise;
      expect(ready).toMatchObject({ type: "ready", pid: child.pid });
      if (mode === "concurrent") {
        const closingPromise = /** @type {Promise<[unknown]>} */ (once(child, "message"));
        child.send("close");
        const [closing] = await closingPromise;
        expect(closing).toMatchObject({ type: "closing" });
      }
      const reported = /** @type {Promise<[{ causes: string[], owned: Array<{ pid: number, started: string }> }]>} */ (once(child, "message"));
      child.kill(signal);
      const [report] = await reported;
      const [code, exitSignal] = await closed;
      expect(code).toBe(signal === "SIGINT" ? 130 : 143); expect(exitSignal).toBe(null);
      expect(report).toMatchObject({ type: "done", uncaught: false, idempotent: true, before: { events: ["browser-close", "transport-close"], leaseHeld: false, evidenceHeld: false }, ownerExists: false, serverExists: false, leaseHeld: false, evidenceHeld: false, remainingOwned: [] });
      expect(report.causes).toContain("diagnostic");
      if (mode === "interruption") expect(report.causes).toContain("interruption");
      expect(report.causes).not.toContain("other");
      const remaining = actual.execFileSync("ps", ["-axo", "pid=,lstart=,command="], { encoding: "utf8" });
      for (const identity of report.owned) expect(remaining).not.toMatch(new RegExp(`^\\s*${identity.pid}\\s+${identity.started.replace(/\s+/gu, "\\s+")}`, "mu"));
    });
});
