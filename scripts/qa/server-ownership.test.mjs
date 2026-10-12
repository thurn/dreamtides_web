// @vitest-environment node
// Ordinary contained child processes; only the OS group-inspection and signal
// boundaries model isolated groups. The production PG crash is separate QA.
import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { browserOwnerPath } from "./browser-lease.mjs";
import { processIdentity, reconcileServer, serverRecordPath, spawnOwnedServer } from "./server-ownership.mjs";

const boundaries = vi.hoisted(() => ({ identities: /** @type {Map<number, string>} */ (new Map()),
  missingIdentity: false,
  fastDelay: false,
  observed: /** @type {((lines: string[]) => void) | null} */ (null),
  advanceLifecycle: /** @type {(() => void) | null} */ (null),
  launched: /** @type {import("node:child_process").ChildProcess[]} */ ([]),
  children: /** @type {Map<number, import("node:child_process").ChildProcess>} */ (new Map()) }));
vi.mock("node:child_process", async (original) => {
  const actual = /** @type {typeof import("node:child_process")} */ (await original());
  return { ...actual,
    spawn: (/** @type {string} */ command, /** @type {string[]} */ args, /** @type {import("node:child_process").SpawnOptions} */ options) => {
      const child = actual.spawn(command, args, { ...options, detached: false });
      if (args[0]?.endsWith("server-launcher.mjs")) boundaries.launched.push(child);
      return child;
    },
    execFileSync: (/** @type {string} */ command, /** @type {string[]} */ args, /** @type {import("node:child_process").ExecFileSyncOptions} */ options) => {
      if (command === "ps" && args[0] === "-A") {
        const lines = [...boundaries.identities].filter(([pid]) => {
        const child = boundaries.children.get(pid); return child?.exitCode === null && child.signalCode === null;
      }).map(([, line]) => line).concat(boundaries.launched.flatMap((child) => {
        if (child.exitCode !== null || child.signalCode !== null) return [];
        const line = String(actual.execFileSync("ps", ["-p", String(child.pid), "-o", "pid=,pgid=,lstart=,stat=,command="], options));
        return [line.replace(/^(\s*)(\d+)\s+\d+/u, "$1$2 $2")];
      }));
        boundaries.observed?.(lines);
        return lines.join("\n");
      }
      const pid = command === "ps" ? Number(args[1]) : 0;
      if (boundaries.missingIdentity && boundaries.launched.some((child) => child.pid === pid)) return "";
      const line = boundaries.identities.get(pid);
      if (line !== undefined) {
        const child = boundaries.children.get(pid);
        return child?.exitCode === null && child.signalCode === null ? line : "";
      }
      const result = actual.execFileSync(command, args, options);
      if (command === "ps") return String(result).split("\n").map((line) => line.replace(/^(\s*)(\d+)\s+\d+/u,
        (whole, pad, pid) => boundaries.launched.some((child) => child.pid === Number(pid)) ? `${pad}${pid} ${pid}` : whole)).join("\n");
      return result;
    },
  };
});
vi.mock("node:timers/promises", async (original) => {
  const actual = /** @type {typeof import("node:timers/promises")} */ (await original());
  return { ...actual, setTimeout: async (/** @type {number} */ ms) => {
    if (!boundaries.fastDelay) await actual.setTimeout(ms);
    boundaries.advanceLifecycle?.();
  } };
});
const directories = /** @type {string[]} */ ([]);
const children = /** @type {import("node:child_process").ChildProcess[]} */ ([]);
afterEach(async () => {
  vi.restoreAllMocks();
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
  }
  boundaries.missingIdentity = false; boundaries.fastDelay = false; boundaries.observed = null; boundaries.advanceLifecycle = null; boundaries.launched.splice(0);
  boundaries.identities.clear(); boundaries.children.clear();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "qa-owned-server-")); directories.push(directory);
  const slot = join(directory, "slot.lock"); mkdirSync(dirname(slot), { recursive: true });
  const owner = browserOwnerPath(slot); writeFileSync(owner, '{"providerState":"active","token":"retained"}\n');
  return { slot, owner, record: serverRecordPath(slot) };
}
async function serverFixture() {
  const child = spawn(process.execPath, ["-e", 'process.stdout.write("ready"); setInterval(() => {}, 60000);', "11111111-1111-4111-8111-111111111111"],
    { stdio: ["ignore", "pipe", "inherit"] }); children.push(child);
  await once(/** @type {import("node:stream").Readable} */ (child.stdout), "data");
  const pid = Number(child.pid);
  boundaries.identities.set(pid, `${String(pid)} ${String(pid)} Sun Oct 11 20:00:00 2026 S node 11111111-1111-4111-8111-111111111111`);
  boundaries.children.set(pid, child);
  const identity = processIdentity(pid);
  if (identity === null) throw new Error("fixture identity missing");
  return { child, identity };
}
/** @param {ReturnType<typeof fixture>} where @param {unknown} value */
const record = (where, value) => writeFileSync(where.record, JSON.stringify(value));

// 999999999 is outside macOS/Linux's process id range; only synthetic input.
const deadRunner = { pid: 999999999 };
describe("identity-safe local orphan reconciliation", () => {
  it.each(["settles", "persistent", "restored-live"])("observes post-signal same-lifetime command ambiguity without escalation (%s)", async (outcome) => {
    const f = fixture(); const server = await serverFixture();
    record(f, { token: "11111111-1111-4111-8111-111111111111", runner: deadRunner, server: server.identity });
    const provider = readFileSync(f.owner, "utf8");
    boundaries.fastDelay = true;
    const actualKill = process.kill.bind(process);
    const signals = /** @type {NodeJS.Signals[]} */ ([]);
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid !== -server.identity.group) return actualKill(pid, signal);
      signals.push(/** @type {NodeJS.Signals} */ (signal));
      boundaries.identities.set(server.identity.pid,
        `${String(server.identity.pid)} ${String(server.identity.group)} ${server.identity.started} S node ambiguous-command`);
      return true;
    });
    const observed = /** @type {string[]} */ ([]);
    boundaries.observed = (lines) => {
      if (!lines.some((line) => line.endsWith("node ambiguous-command"))) return;
      observed.push("ambiguous");
      boundaries.advanceLifecycle = () => {
        boundaries.advanceLifecycle = null;
        if (outcome === "settles") boundaries.identities.set(server.identity.pid, "");
        if (outcome === "restored-live") boundaries.identities.set(server.identity.pid,
          `${String(server.identity.pid)} ${String(server.identity.group)} ${server.identity.started} S ${server.identity.command}`);
      };
    };
    expect((await reconcileServer(f.slot)).state).toBe(outcome === "settles" ? "stopped" : "server-observation-unsettled");
    expect(observed).toContain("ambiguous");
    expect(signals).toEqual(["SIGTERM"]);
    expect(existsSync(f.record)).toBe(outcome !== "settles");
    expect(readFileSync(f.owner, "utf8")).toBe(provider);
  });

  it("protects a changed live command before any verified signal", async () => {
    const f = fixture(); const server = await serverFixture();
    record(f, { token: "11111111-1111-4111-8111-111111111111", runner: deadRunner, server: server.identity });
    boundaries.identities.set(server.identity.pid,
      `${String(server.identity.pid)} ${String(server.identity.group)} ${server.identity.started} S node changed-live-command`);
    const actualKill = process.kill.bind(process);
    const signals = /** @type {NodeJS.Signals[]} */ ([]);
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid === -server.identity.group) { signals.push(/** @type {NodeJS.Signals} */ (signal)); return true; }
      return actualKill(pid, signal);
    });
    expect((await reconcileServer(f.slot)).state).toBe("identity-mismatch");
    expect(signals).toEqual([]); expect(existsSync(f.record)).toBe(true);
    expect(server.child.exitCode).toBeNull();
  });

  it.each([false, true])("waits for recorded same-lifetime zombies to reap (initially exited: %s)", async (alreadyExited) => {
    const f = fixture(); const server = await serverFixture();
    record(f, { token: "11111111-1111-4111-8111-111111111111", runner: deadRunner, server: server.identity });
    boundaries.fastDelay = true;
    if (alreadyExited) boundaries.identities.set(server.identity.pid,
      `${String(server.identity.pid)} ${String(server.identity.group)} ${server.identity.started} Z <defunct>`);
    const actualKill = process.kill.bind(process);
    const signals = /** @type {NodeJS.Signals[]} */ ([]);
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid !== -server.identity.group) return actualKill(pid, signal);
      signals.push(/** @type {NodeJS.Signals} */ (signal));
      boundaries.identities.set(server.identity.pid,
        `${String(server.identity.pid)} ${String(server.identity.group)} ${server.identity.started} Z <defunct>`);
      return true;
    });
    let observedZombie = false;
    boundaries.observed = (lines) => {
      if (!lines.some((line) => line.endsWith("Z <defunct>"))) return;
      observedZombie = true;
      // Reaping follows an observed exited lifetime, independent of polls.
      boundaries.advanceLifecycle = () => {
        boundaries.advanceLifecycle = null;
        boundaries.identities.set(server.identity.pid, "");
      };
    };
    expect((await reconcileServer(f.slot)).state).toBe("stopped");
    expect(observedZombie).toBe(true);
    expect(signals).toEqual(alreadyExited ? [] : ["SIGTERM"]);
    expect(existsSync(f.record)).toBe(false);
  });

  it("settles durable recorded descendants after their leader exits", async () => {
    const f = fixture(); const leader = await serverFixture(); const member = await serverFixture();
    const identity = { ...member.identity, group: leader.identity.group };
    boundaries.identities.set(identity.pid, `${String(identity.pid)} ${String(identity.group)} ${identity.started} S ${identity.command}`);
    record(f, { token: "11111111-1111-4111-8111-111111111111", runner: deadRunner,
      server: leader.identity, members: [leader.identity, identity].map(({ pid, group, started, command }) =>
        ({ pid, group, started, command })) });
    const exited = once(leader.child, "exit"); leader.child.kill("SIGTERM"); await exited;
    const owner = readFileSync(f.owner, "utf8");
    const actualKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid === -leader.identity.group) { member.child.kill(/** @type {NodeJS.Signals} */ (signal)); return true; }
      return actualKill(pid, signal);
    });
    expect(await reconcileServer(f.slot)).toMatchObject({ state: "stopped", alreadyExited: true });
    expect(member.child.signalCode).toBe("SIGTERM");
    expect(existsSync(f.record)).toBe(false); expect(readFileSync(f.owner, "utf8")).toBe(owner);
  });

  it.each(["changed", "reused", "new-member", "unsettled"])("preserves %s shutdown evidence and provider bytes", async (kind) => {
    const f = fixture(); const server = await serverFixture();
    const newcomer = kind === "new-member" ? await serverFixture() : null;
    record(f, { token: "11111111-1111-4111-8111-111111111111", runner: deadRunner, server: server.identity });
    const owner = readFileSync(f.owner, "utf8");
    boundaries.fastDelay = true;
    const actualKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid !== -server.identity.group) return actualKill(pid, signal);
      if (kind === "changed") writeFileSync(f.record, "changed by another actor");
      if (newcomer !== null) boundaries.identities.set(newcomer.identity.pid,
        `${String(newcomer.identity.pid)} ${String(server.identity.group)} ${newcomer.identity.started} S ${newcomer.identity.command}`);
      if (kind === "reused") boundaries.identities.set(server.identity.pid,
        `${String(server.identity.pid)} 999999998 ${server.identity.started} S node reused-in-another-group`);
      return true; // Explicit synthetic unsettled OS boundary; never a group signal.
    });
    expect((await reconcileServer(f.slot)).state).toBe(kind === "changed" ? "record-changed" : (kind === "reused" || kind === "new-member") ? "identity-mismatch" : "server-unsettled");
    expect(existsSync(f.record)).toBe(true); expect(readFileSync(f.owner, "utf8")).toBe(owner);
    expect(server.child.exitCode).toBeNull();
  });

  it("makes owned shutdown single-flight and clears only after its group settles", async () => {
    const f = fixture(); const logFd = openSync(join(dirname(f.slot), "server.log"), "w");
    const owned = await spawnOwnedServer({ slotPath: f.slot, command: process.execPath,
      args: ["-e", "setInterval(() => {}, 60000)"], cwd: dirname(f.slot), logFd, port: 6000 });
    children.push(owned.child);
    const actualKill = process.kill.bind(process);
    const signals = /** @type {NodeJS.Signals[]} */ ([]);
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid === -Number(owned.child.pid)) { signals.push(/** @type {NodeJS.Signals} */ (signal)); owned.child.kill(/** @type {NodeJS.Signals} */ (signal)); return true; }
      return actualKill(pid, signal);
    });
    try {
      const first = owned.stop(); expect(owned.stop()).toBe(first); await first;
      expect(signals).toEqual(["SIGTERM"]); expect(existsSync(f.record)).toBe(false);
      await owned.stop(); expect(signals).toEqual(["SIGTERM"]);
    } finally { closeSync(logFd); }
  });

  it.each(["identity", "write"])("settles a gated launcher after a %s failure before returning", async (kind) => {
    const f = fixture();
    boundaries.missingIdentity = kind === "identity";
    const slotPath = kind === "write" ? join(dirname(f.slot), "missing-parent", "slot.lock") : f.slot;
    const marker = join(dirname(f.slot), "server-started");
    const logFd = openSync(join(dirname(f.slot), "server.log"), "w");
    try {
      await expect(spawnOwnedServer({ slotPath, command: process.execPath,
        args: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "started")`],
        cwd: dirname(f.slot), logFd, port: 6000 })).rejects.toThrow();
      expect(boundaries.launched).toHaveLength(1);
      expect(boundaries.launched.every((child) => child.exitCode !== null || child.signalCode !== null)).toBe(true);
      expect(existsSync(marker)).toBe(false);
    } finally { closeSync(logFd); }
  });

  it("protects a live runner and preserves provider quarantine", async () => {
    const f = fixture(); const server = await serverFixture();
    record(f, { token: "11111111-1111-4111-8111-111111111111", runner: { pid: process.pid }, server: server.identity });
    expect((await reconcileServer(f.slot)).state).toBe("live-runner");
    expect(server.child.exitCode).toBeNull(); expect(readFileSync(f.owner, "utf8")).toContain("retained");
  });
  it("stops the verified dead runner's contained fixture child and retains provider bytes", async () => {
    const f = fixture(); const server = await serverFixture(); const owner = readFileSync(f.owner, "utf8");
    record(f, { token: "11111111-1111-4111-8111-111111111111", runner: deadRunner, server: server.identity, port: 6000 });
    const actualKill = process.kill.bind(process);
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid === -server.identity.pid) { server.child.kill(/** @type {NodeJS.Signals} */ (signal)); return true; }
      return actualKill(pid, signal);
    });
    expect(await reconcileServer(f.slot)).toMatchObject({ state: "stopped", pid: server.identity.pid, port: 6000 });
    expect(existsSync(f.record)).toBe(false); expect(readFileSync(f.owner, "utf8")).toBe(owner);
    expect(server.child.signalCode).toBe("SIGTERM");
  });
  it("settles an already exited empty group while preserving the provider record", async () => {
    const f = fixture(); const server = await serverFixture();
    record(f, { token: "11111111-1111-4111-8111-111111111111", runner: deadRunner, server: server.identity });
    const exited = once(server.child, "exit"); server.child.kill("SIGTERM"); await exited;
    const provider = readFileSync(f.owner, "utf8");
    expect(await reconcileServer(f.slot)).toMatchObject({ state: "stopped", alreadyExited: true });
    expect(existsSync(f.record)).toBe(false); expect(readFileSync(f.owner, "utf8")).toBe(provider);
  });
  it("protects surviving group members when their recorded leader is absent", async () => {
    const f = fixture(); const server = await serverFixture();
    const group = 999999998;
    boundaries.identities.set(Number(server.child.pid), `${String(server.child.pid)} ${String(group)} Sun Oct 11 20:00:00 2026 S node fixture-member`);
    record(f, { token: "11111111-1111-4111-8111-111111111111", runner: deadRunner,
      server: { ...server.identity, pid: group, group } });
    expect((await reconcileServer(f.slot)).state).toBe("unverified");
    expect(existsSync(f.record)).toBe(true); expect(server.child.exitCode).toBeNull();
  });

  it.each(["partial", "empty-token", "reused", "shared"])("retains %s identity evidence without signaling unrelated processes", async (kind) => {
    const f = fixture(); const server = await serverFixture();
    if (kind === "partial") writeFileSync(f.record, '{"token":');
    else record(f, { token: kind === "empty-token" ? "" : "11111111-1111-4111-8111-111111111111", runner: deadRunner, server: { ...server.identity,
      ...(kind === "reused" ? { started: "different lifetime" } : {}),
      ...(kind === "shared" ? { group: process.pid } : {}),
      ...(kind === "missing" ? { pid: 999999998, group: 999999998 } : {}) } });
    const before = readFileSync(f.record, "utf8");
    expect(["unverified", "identity-mismatch"]).toContain((await reconcileServer(f.slot)).state);
    expect(readFileSync(f.record, "utf8")).toBe(before); expect(server.child.exitCode).toBeNull();
  });
});
