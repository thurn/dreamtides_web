// Server reconciliation is local process cleanup; it does not certify the
// separately recorded Playwright provider or remove its quarantine record.
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { serverRecordPath, tryBrowserLock } from "./browser-lease.mjs";
export { serverRecordPath } from "./browser-lease.mjs";

/** @param {string} line */
function parseIdentity(line) {
  const match = /^(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(\S+)\s+(.+)$/u.exec(line.trim());
  return match === null ? null : { pid: Number(match[1]), group: Number(match[2]), started: match[3], state: match[4], command: match[5] };
}

/** @param {number} group */
function groupMembers(group) {
  return execFileSync("ps", ["-A", "-o", "pid=,pgid=,lstart=,stat=,command="],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n")
    .flatMap((line) => { const value = parseIdentity(line); return value?.group === group ? [value] : []; });
}

/** @param {number} pid */
export function processIdentity(pid) {
  try {
    const line = execFileSync("ps", ["-p", String(pid), "-o", "pid=,pgid=,lstart=,stat=,command="],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return parseIdentity(line);
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 1) return null;
    throw error;
  }
}

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
    let record = JSON.stringify({ token, runner, server, cwd, port }) + "\n";
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
    let stopping = /** @type {Promise<void> | null} */ (null);
    return { child, stop: () => {
      stopping ??= (async () => {
        if (readFileSync(recordPath, "utf8") !== record) throw new Error(`server record changed: ${recordPath}`);
        const value = parsedRecord(/** @type {unknown} */ (JSON.parse(record)));
        if (value === null) throw new Error(`server record invalid: ${recordPath}`);
        const result = await settleServer(recordPath, record, value, (next) => { record = next; });
        if (result.state !== "stopped") throw new Error(`server cleanup ${result.state}: ${recordPath}`);
        await closed;
      })();
      return stopping;
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
  const members = "members" in value ? value.members : undefined;
  if (members !== undefined && (!Array.isArray(members) || !members.every((/** @type {unknown} */ member) =>
    typeof member === "object" && member !== null && "pid" in member && typeof member.pid === "number" &&
    Number.isInteger(member.pid) && member.pid > 1 && "group" in member && member.group === server.pid &&
    "started" in member && typeof member.started === "string" && "command" in member && typeof member.command === "string"))) return null;
  return { token: value.token, runner: { pid: runner.pid },
    server: { pid: server.pid, group: server.pid, started: server.started, command: server.command },
    port: "port" in value && typeof value.port === "number" ? value.port : null,
    members: /** @type {Array<Omit<NonNullable<ReturnType<typeof processIdentity>>, "state">> | undefined} */ (members) };
}

/** @param {Omit<NonNullable<ReturnType<typeof processIdentity>>, "state">} expected @param {ReturnType<typeof processIdentity>} actual */
const sameIdentity = (expected, actual) => sameLifetime(expected, actual) && expected.command === actual?.command;

/** @param {Omit<NonNullable<ReturnType<typeof processIdentity>>, "state">} expected @param {ReturnType<typeof processIdentity>} actual */
const sameLifetime = (expected, actual) => actual !== null && expected.pid === actual.pid &&
  expected.group === actual.group && expected.started === actual.started;

/** A recorded zombie has exited; wait for its reaping without treating its OS
 * display command as an executing identity. Live commands stay exact.
 * @param {Omit<NonNullable<ReturnType<typeof processIdentity>>, "state">} expected
 * @param {ReturnType<typeof processIdentity>} actual
 */
const settledIdentity = (expected, actual) => sameIdentity(expected, actual) ||
  (sameLifetime(expected, actual) && actual?.state.startsWith("Z") === true);

/**
 * Settle the exact recorded group, including verified descendants after leader
 * exit. Unknown members or a changed record stop signals and preserve evidence.
 * @param {string} path
 * @param {string} raw
 * @param {NonNullable<ReturnType<typeof parsedRecord>>} record
 * @param {(next: string) => void} [updated]
 */
async function settleServer(path, raw, record, updated) {
  const expected = record.server;
  if (expected.pid === process.pid || expected.group === processIdentity(process.pid)?.group) return { state: "unverified", path };
  const current = processIdentity(expected.pid);
  if (current !== null && !settledIdentity(expected, current)) return { state: "identity-mismatch", path };
  let remaining = groupMembers(expected.group);
  let members = record.members;
  if (members === undefined && remaining.length > 0) {
    if (current === null) return { state: "unverified", path };
    if (current.state.startsWith("Z")) {
      // The launch record verifies only this exited lifetime. Unknown
      // descendants require their own durable pre-shutdown identities.
      if (!remaining.every((member) => settledIdentity(expected, member))) return { state: "unverified", path };
    } else if (!remaining.some((member) => sameIdentity(expected, member))) return { state: "identity-mismatch", path };
    members = remaining;
    if (readFileSync(path, "utf8") !== raw) return { state: "record-changed", path };
    const next = JSON.stringify({ .../** @type {Record<string, unknown>} */ (JSON.parse(raw)), members }) + "\n";
    const temporary = `${path}.${record.token}.tmp`;
    try {
      writeFileSync(temporary, next, { flag: "wx" });
      if (readFileSync(path, "utf8") !== raw) return { state: "record-changed", path };
      renameSync(temporary, path);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    raw = next;
    updated?.(next);
  }
  let sentSignal = false;
  let observeOnly = false;
  let leaderNow = current;
  const settled = () => leaderNow === null && remaining.length === 0;
  const checked = () => {
    if (readFileSync(path, "utf8") !== raw) return "record-changed";
    leaderNow = processIdentity(expected.pid);
    if (leaderNow !== null && !settledIdentity(expected, leaderNow)) {
      if (!sentSignal || !sameLifetime(expected, leaderNow)) return "identity-mismatch";
      observeOnly = true;
    }
    remaining = groupMembers(expected.group);
    for (const member of remaining) {
      const original = members?.find((identity) => sameLifetime(identity, member));
      if (original === undefined) return "identity-mismatch";
      if (!settledIdentity(original, member)) {
        if (!sentSignal) return "identity-mismatch";
        observeOnly = true;
      }
    }
    return null;
  };
  let invalid = checked();
  if (invalid !== null) return { state: invalid, path };
  for (const [signal, attempts] of /** @type {Array<[NodeJS.Signals, number]>} */ ([["SIGTERM", 50], ["SIGKILL", 10]])) {
    if (settled()) break;
    invalid = checked();
    if (invalid !== null) return { state: invalid, path };
    if (settled()) break;
    // After a verified own signal, a same-lifetime ambiguous observation
    // permanently disables further signals. Empty group + absent leader is
    // the only successful terminal condition; persistent ambiguity is retained.
    if (!observeOnly && remaining.some((member) => !member.state.startsWith("Z"))) {
      try { process.kill(-expected.group, signal); sentSignal = true; } catch (error) {
        if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH")) throw error;
      }
    }
    for (let attempt = 0; attempt < attempts && !settled(); attempt++) {
      await delay(100);
      invalid = checked();
      if (invalid !== null) return { state: invalid, path };
    }
  }
  if (!settled()) return { state: observeOnly ? "server-observation-unsettled" : "server-unsettled", path };
  if (readFileSync(path, "utf8") !== raw) return { state: "record-changed", path };
  unlinkSync(path);
  return { state: "stopped", path, pid: expected.pid, port: record.port, ...(current === null ? { alreadyExited: true } : {}) };
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
    return await settleServer(path, raw, record);
  } finally { await lock.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slotPath = process.argv[2];
  if (slotPath === undefined || process.argv.length !== 3) throw new Error("usage: node scripts/qa/server-ownership.mjs <exact-slot-lock-path>");
  console.log(JSON.stringify(await reconcileServer(slotPath)));
}
