// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { browserLeasePath, browserLeaseWaiters, browserSlotPath } from "./browser-lease.mjs";
import { lockHeld } from "./browser-lease-fixture.mjs";
import { openQaSession } from "./run-scenario.mjs";
import * as runtime from "../screenshot-runtime.mjs";

// Concurrent sessions in one test process. The native slot locks, evidence
// locks, and synthetic server processes are real; sockets, HTTP readiness,
// the listener check, and the MCP client are synthetic, one per session.
const fixtureIo = vi.hoisted(() => ({
  gitCwd: /** @type {string | null} */ (null),
  children: /** @type {import("node:child_process").ChildProcess[]} */ ([]),
  ready: /** @type {Map<string, Promise<void>>} */ (new Map()),
  servers: /** @type {string[]} */ ([]),
}));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = /** @type {typeof import("node:child_process")} */ (await importOriginal());
  return {
    ...actual,
    spawn: vi.fn((/** @type {string} */ command, /** @type {string[]} */ args, /** @type {import("node:child_process").SpawnOptions} */ options) => {
      const server = args[0]?.endsWith("/server-launcher.mjs") === true;
      const stdio = /** @type {import("node:child_process").SpawnOptions["stdio"]} */ (server && Array.isArray(options.stdio) ? [...options.stdio, "ipc"] : options.stdio);
      const child = actual.spawn(command, args, { ...options, stdio, detached: false });
      if (server) {
        const port = String(args[args.indexOf("--port") + 1]);
        fixtureIo.servers.push(`spawn ${port}`);
        const ready = new Promise((/** @type {(value: void) => void} */ done) => {
          child.once("message", () => { fixtureIo.servers.push(`ready ${port}`); done(); });
        });
        fixtureIo.ready.set(port, ready);
      }
      fixtureIo.children.push(child);
      return child;
    }),
    execFileSync: vi.fn((/** @type {string} */ command, /** @type {string[]} */ args, /** @type {import("node:child_process").ExecFileSyncOptionsWithStringEncoding} */ options) => {
      const cwd = command === "git" && args.includes("--git-common-dir") ? fixtureIo.gitCwd : null;
      const result = actual.execFileSync(command, args, cwd === null ? options : { ...options, cwd });
      // The contained fixture models a separate group identity at this OS
      // boundary; cleanup signals its ordinary child directly, never our PG.
      if (command === "ps") return result.split("\n").map((line) => line.replace(/^(\s*)(\d+)\s+\d+/u,
        (whole, pad, pid) => fixtureIo.children.some((child) => child.pid === Number(pid)) ? `${pad}${pid} ${pid}` : whole)).join("\n");
      return result;
    }),
  };
});
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

const sessions = /** @type {Awaited<ReturnType<typeof openQaSession>>[]} */ ([]);
const directories = /** @type {string[]} */ ([]);
const realKill = process.kill.bind(process);
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (/** @type {string} */ url) => {
    await fixtureIo.ready.get(new URL(url).port);
    return { status: 200 };
  }));
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
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close().catch(() => {})));
  for (const child of fixtureIo.children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, "close");
    child.stdin?.end();
    child.kill("SIGKILL");
    await exited;
  }
  fixtureIo.gitCwd = null;
  fixtureIo.ready.clear();
  fixtureIo.servers.splice(0);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function primaryFixture() {
  const root = join(realpathSync(mkdtempSync(join(tmpdir(), "dreamtides-qa-slots-"))), "primary");
  directories.push(join(root, ".."));
  mkdirSync(join(root, "scripts"), { recursive: true });
  // A real child owns liveness until session cleanup, without a host TCP bind.
  writeFileSync(join(root, "scripts", "dev.mjs"), 'setInterval(() => {}, 60_000); process.send("ready");');
  execFileSync("git", ["init", "-q", root], { encoding: "utf8" });
  fixtureIo.gitCwd = root;
  return { root, path: browserLeasePath(root) };
}

/** @param {string} root @param {string} label */
async function open(root, label) {
  const session = await openQaSession({ bead: "synthetic-slots", label, port: null, prod: false, minify: false, cwd: root });
  sessions.push(session);
  return session;
}

/** A synthetic MCP client per session; `failing` labels reject their browser close. */
function connectClients() {
  return vi.spyOn(runtime, "connectPlaywrightMcp").mockImplementation((options) => Promise.resolve({
    call: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "### Result\n{}" }] }),
    close: options?.name?.includes("failing") === true ? vi.fn().mockRejectedValue(new Error("synthetic close failure")) : vi.fn().mockResolvedValue(undefined),
  }));
}

/** @param {number | null} pid */
const serverRunning = (pid) => fixtureIo.children.some((child) => child.pid === pid && child.exitCode === null && child.signalCode === null);

describe("concurrent QA sessions", () => {
  it("runs two sessions on separate slots, ports, servers, and records, and queues a third for a released slot", async () => {
    const { root, path } = primaryFixture();
    connectClients();
    const [a, b] = await Promise.all([open(root, "a"), open(root, "b")]);
    expect(new Set([a.slot, b.slot])).toEqual(new Set([0, 1]));
    expect(a.port).not.toBe(b.port);
    expect(a.serverPid).not.toBe(b.serverPid);
    // One checkout: its servers start one at a time.
    expect(fixtureIo.servers.map((event) => event.split(" ")[0])).toEqual(["spawn", "ready", "spawn", "ready"]);
    expect([a, b].every((session) => serverRunning(session.serverPid))).toBe(true);
    for (const session of [a, b]) {
      expect(JSON.parse(readFileSync(session.ownerPath, "utf8"))).toMatchObject({ slot: session.slot, port: session.port, pid: process.pid });
    }
    // Only slot 0's record is the one single-slot peers read.
    expect([a, b].filter((session) => session.ownerPath === `${path}.owner.json`).map((session) => session.slot)).toEqual([0]);

    const third = open(root, "c");
    while (browserLeaseWaiters(path) === 0) await delay(20);
    await a.close();
    const c = await third;
    expect(c.slot).toBe(a.slot);
    expect(c.port).not.toBe(b.port);
    expect(c.ownerPath).toBe(a.ownerPath);
  });

  it("quarantines only the slot whose cleanup failed and leaves the other session live", async () => {
    const { root, path } = primaryFixture();
    connectClients();
    const [failing, healthy] = await Promise.all([open(root, "failing"), open(root, "healthy")]);
    const healthyRecord = readFileSync(healthy.ownerPath, "utf8");
    await expect(failing.close()).rejects.toThrow(/synthetic close failure/);
    expect(readFileSync(failing.ownerPath, "utf8")).toContain('"providerState":"close-unconfirmed"');
    expect(serverRunning(failing.serverPid)).toBe(false);
    expect(lockHeld(browserSlotPath(path, failing.slot))).toBe(false);

    expect(serverRunning(healthy.serverPid)).toBe(true);
    expect(lockHeld(browserSlotPath(path, healthy.slot))).toBe(true);
    expect(readFileSync(healthy.ownerPath, "utf8")).toBe(healthyRecord);
    expect(existsSync(join(healthy.captureDir, "healthy.server.log"))).toBe(true);
    expect(healthy.closed()).toBe(false);
    await expect(healthy.run("async () => null", {}, 1_000)).resolves.toEqual({});
    await healthy.close();
    expect(existsSync(healthy.ownerPath)).toBe(false);

    const next = await open(root, "next");
    expect(next.slot).toBe(healthy.slot);
    expect(existsSync(failing.ownerPath)).toBe(true);
  });

  it("keeps same-bead same-label runs in distinct evidence namespaces", async () => {
    const { root } = primaryFixture();
    connectClients();
    const first = await open(root, "same");
    const log = join(first.captureDir, "same.server.log");
    appendFileSync(log, "synthetic evidence\n");
    const second = await open(root, "same");
    expect(second.captureDir).not.toBe(first.captureDir);
    expect(readFileSync(log, "utf8")).toBe("synthetic evidence\n");
    expect(serverRunning(first.serverPid)).toBe(true);
    expect(serverRunning(second.serverPid)).toBe(true);
  });

  it("preserves legacy root evidence while same-label sessions save separate game logs", async () => {
    const { root } = primaryFixture();
    const report = { result: null, error: null, caps: [], log: [], captures: [], traces: [],
      gameLog: { gameId: "fixture-game", selectedBy: "url", reason: null, lines: ['{"event":"fixture"}'] } };
    vi.spyOn(runtime, "connectPlaywrightMcp").mockResolvedValue({
      call: vi.fn().mockResolvedValue({ content: [{ type: "text", text: `### Result\n${JSON.stringify(report)}` }] }),
      close: vi.fn().mockResolvedValue(undefined),
    });
    const legacyDir = join(root, "artifacts", "qa", "synthetic-slots");
    mkdirSync(legacyDir, { recursive: true });
    const files = ["same.server.log", "same.result.json", "same-desktop.jsonl", "same.png"];
    for (const file of files) writeFileSync(join(legacyDir, file), "legacy");
    const [a, b] = await Promise.all([open(root, "same"), open(root, "same")]);
    const plan = { steps: ["async () => null"], viewports: /** @type {const} */ (["desktop"]) };
    const logs = await Promise.all([a, b].map((session) => session.runPlan({ ...plan, viewports: [...plan.viewports] }, {}, 1000, { gameLogName: "same" })));
    expect(logs[0]?.gameLogs[0]?.path).not.toBe(logs[1]?.gameLogs[0]?.path);
    for (const session of [a, b]) {
      expect(readFileSync(join(session.captureDir, "same-desktop.jsonl"), "utf8")).toContain('"event":"fixture"');
      for (const file of ["same.result.json", "same.png"]) writeFileSync(join(session.captureDir, file), session.invocation);
    }
    for (const file of files) expect(readFileSync(join(legacyDir, file), "utf8")).toBe("legacy");
    expect(readFileSync(join(a.captureDir, "same.png"), "utf8")).not.toBe(readFileSync(join(b.captureDir, "same.png"), "utf8"));
  });

  it("fails a session whose port is answered outside its own server, releasing its slot", async () => {
    const { root, path } = primaryFixture();
    const connect = connectClients();
    vi.mocked(runtime.listenerOwnedBy).mockReturnValue(false);
    await expect(open(root, "foreign")).rejects.toThrow(/answered by a process outside/);
    expect(connect).not.toHaveBeenCalled();
    expect(fixtureIo.children.every((child) => child.exitCode !== null || child.signalCode !== null)).toBe(true);
    expect([0, 1].some((slot) => lockHeld(browserSlotPath(path, slot)))).toBe(false);
    expect([0, 1].some((slot) => existsSync(`${browserSlotPath(path, slot)}.owner.json`))).toBe(false);
  });
});
