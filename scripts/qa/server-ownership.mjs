// Server reconciliation is local process cleanup; it does not certify the
// separately recorded Playwright provider or remove its quarantine record.
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { tryBrowserLock } from "./browser-lease.mjs";

/** @param {string} line */
function parseIdentity(line) {
  const match = /^(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.+)$/u.exec(line.trim());
  return match === null ? null : { pid: Number(match[1]), group: Number(match[2]), started: match[3], command: match[4] };
}

/** @param {number} group */
function groupMembers(group) {
  return execFileSync("ps", ["-A", "-o", "pid=,pgid=,lstart=,command="],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n")
    .flatMap((line) => { const value = parseIdentity(line); return value?.group === group ? [value] : []; });
}

/** @param {number} pid */
export function processIdentity(pid) {
  try {
    const line = execFileSync("ps", ["-p", String(pid), "-o", "pid=,pgid=,lstart=,command="],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return parseIdentity(line);
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 1) return null;
    throw error;
  }
}

/** @param {string} slotPath */
export const serverRecordPath = (slotPath) => `${slotPath}.server.json`;

/**
 * Records an isolated launcher before releasing its gate. Its token appears
 * in the exact OS command identity, protecting against PID reuse.
 * @param {{ slotPath: string, command: string, args: string[], cwd: string, logFd: number, port: number }} options
 */
export async function spawnOwnedServer({ slotPath, command, args, cwd, logFd, port }) {
  const recordPath = serverRecordPath(slotPath);
  if (existsSync(recordPath)) throw new Error(`server requires reconciliation: ${recordPath}`);
  const token = randomUUID();
  const launcher = fileURLToPath(new URL("./server-launcher.mjs", import.meta.url));
  const child = spawn(process.execPath, [launcher, recordPath, token, command, ...args], {
    cwd, detached: true, stdio: ["pipe", logFd, logFd],
    env: { ...process.env, PATH: `${cwd}/node_modules/.bin:${process.env.PATH ?? ""}` },
  });
  child.stdin?.on("error", () => {});
  const closed = new Promise((done) => child.once("close", done));
  try {
    await new Promise((done, reject) => { child.once("spawn", done); child.once("error", reject); });
    const server = child.pid === undefined ? null : processIdentity(child.pid);
    const runner = processIdentity(process.pid);
    if (server === null || runner === null) {
      child.stdin?.end();
      throw new Error("server launcher identity could not be established");
    }
    const record = JSON.stringify({ token, runner, server, cwd, port }) + "\n";
    const temporary = `${recordPath}.${token}.tmp`;
    try {
      writeFileSync(temporary, record, { flag: "wx" });
      // The slot lock excludes other cooperating record writers.
      if (existsSync(recordPath)) throw new Error(`server record appeared during launch: ${recordPath}`);
      renameSync(temporary, recordPath);
      child.stdin?.end("start\n");
    } catch (error) {
      child.stdin?.end();
      if (existsSync(temporary)) unlinkSync(temporary);
      throw error;
    }
    return { child, clear: () => {
      if (readFileSync(recordPath, "utf8") !== record) throw new Error(`server record changed: ${recordPath}`);
      if (processIdentity(server.pid) !== null || groupMembers(server.group).length > 0) throw new Error(`server group remains live: ${String(server.group)}`);
      unlinkSync(recordPath);
    } };
  } catch (error) {
    child.stdin?.end();
    await closed;
    throw error;
  }
}

/** @param {unknown} value */
function parsedRecord(value) {
  if (typeof value !== "object" || value === null || !("token" in value) ||
    typeof value.token !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.token) ||
    !("runner" in value) || !("server" in value)) return null;
  const runner = value.runner; const server = value.server;
  if (typeof runner !== "object" || runner === null || !("pid" in runner) ||
    typeof runner.pid !== "number" || !Number.isInteger(runner.pid) || runner.pid <= 1 ||
    typeof server !== "object" || server === null || !("pid" in server) || !("group" in server) ||
    !("started" in server) || !("command" in server) || typeof server.pid !== "number" ||
    !Number.isInteger(server.pid) || server.pid <= 1 || server.group !== server.pid ||
    typeof server.started !== "string" || typeof server.command !== "string" || !server.command.includes(value.token)) return null;
  return { token: value.token, runner: { pid: runner.pid },
    server: { pid: server.pid, group: server.pid, started: server.started, command: server.command },
    port: "port" in value && typeof value.port === "number" ? value.port : null };
}

/**
 * Takes the exact slot lock and stops only a dead runner's identity-matched
 * isolated server group. Malformed, reused, live, or ambiguous records remain.
 * Provider owner records are never read or changed here.
 * @param {string} slotPath
 */
export async function reconcileServer(slotPath) {
  const lock = await tryBrowserLock(slotPath);
  if (lock === null) return { state: "busy" };
  try {
    const path = serverRecordPath(slotPath);
    if (!existsSync(path)) return { state: "absent" };
    const raw = readFileSync(path, "utf8");
    let record;
    try { record = parsedRecord(/** @type {unknown} */ (JSON.parse(raw))); } catch { return { state: "unverified", path }; }
    if (record === null) return { state: "unverified", path };
    // Any live runner PID, including a reused one, protects the record.
    if (processIdentity(record.runner.pid) !== null) return { state: "live-runner", path };
    const expected = record.server;
    const matches = (/** @type {ReturnType<typeof processIdentity>} */ actual) => actual !== null &&
      actual.pid === expected.pid && actual.group === expected.group && actual.started === expected.started && actual.command === expected.command;
    if (expected.pid === process.pid || expected.group === processIdentity(process.pid)?.group) return { state: "unverified", path };
    const current = processIdentity(expected.pid);
    if (current === null) {
      // An absent leader is settled only when its entire recorded group is empty.
      if (groupMembers(expected.group).length > 0) return { state: "unverified", path };
      if (readFileSync(path, "utf8") !== raw) return { state: "record-changed", path };
      unlinkSync(path);
      return { state: "stopped", path, pid: expected.pid, port: record.port, alreadyExited: true };
    }
    if (!matches(current)) return { state: "identity-mismatch", path };
    if (readFileSync(path, "utf8") !== raw) return { state: "record-changed", path };
    const members = groupMembers(expected.group);
    if (!members.some((member) => matches(member))) return { state: "identity-mismatch", path };
    process.kill(-expected.group, "SIGTERM");
    let remaining = groupMembers(expected.group);
    for (let attempt = 0; attempt < 50 && remaining.length > 0; attempt++) {
      await delay(100);
      remaining = groupMembers(expected.group);
    }
    if (remaining.length > 0) {
      if (!remaining.every((member) => members.some((original) => JSON.stringify(original) === JSON.stringify(member)))) {
        return { state: "identity-mismatch", path };
      }
      process.kill(-expected.group, "SIGKILL");
      for (let attempt = 0; attempt < 10 && remaining.length > 0; attempt++) {
        await delay(100);
        remaining = groupMembers(expected.group);
      }
    }
    if (remaining.length > 0) return { state: "server-unsettled", path };
    if (readFileSync(path, "utf8") !== raw) return { state: "record-changed", path };
    unlinkSync(path);
    return { state: "stopped", path, pid: expected.pid, port: record.port };
  } finally { await lock.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slotPath = process.argv[2];
  if (slotPath === undefined || process.argv.length !== 3) throw new Error("usage: node scripts/qa/server-ownership.mjs <exact-slot-lock-path>");
  console.log(JSON.stringify(await reconcileServer(slotPath)));
}
