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
      if (command === "ps" && args[0] === "-A") return [...boundaries.identities].filter(([pid]) => {
        const child = boundaries.children.get(pid); return child?.exitCode === null && child.signalCode === null;
      }).map(([, line]) => line).join("\n");
      const pid = command === "ps" ? Number(args[1]) : 0;
      if (boundaries.missingIdentity && boundaries.launched.some((child) => child.pid === pid)) return "";
      const line = boundaries.identities.get(pid);
      if (line !== undefined) {
        const child = boundaries.children.get(pid);
        return child?.exitCode === null && child.signalCode === null ? line : "";
      }
      return actual.execFileSync(command, args, options);
    },
  };
});
const directories = /** @type {string[]} */ ([]);
const children = /** @type {import("node:child_process").ChildProcess[]} */ ([]);
afterEach(async () => {
  vi.restoreAllMocks();
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
  }
  boundaries.missingIdentity = false; boundaries.launched.splice(0);
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
  boundaries.identities.set(pid, `${String(pid)} ${String(pid)} Sun Oct 11 20:00:00 2026 node 11111111-1111-4111-8111-111111111111`);
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
    boundaries.identities.set(Number(server.child.pid), `${String(server.child.pid)} ${String(group)} Sun Oct 11 20:00:00 2026 node fixture-member`);
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
