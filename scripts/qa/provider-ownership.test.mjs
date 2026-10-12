// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireBrowserLease, browserLeasePath, browserOwnerPath, browserSlotPath, serverRecordPath, tryBrowserLock } from "./browser-lease.mjs";

const directories = /** @type {string[]} */ ([]);
const servers = /** @type {import("node:http").Server[]} */ ([]);
// Test kernel holders stay inside the certified job's process group.
const children = vi.hoisted(() => /** @type {import("node:child_process").ChildProcess[]} */ ([]));
vi.mock("node:child_process", async (original) => {
  const actual = /** @type {typeof import("node:child_process")} */ (await original());
  return { ...actual, spawn: (/** @type {string} */ command, /** @type {string[]} */ args, /** @type {import("node:child_process").SpawnOptions} */ options) => {
    const child = actual.spawn(command, args, { ...options, detached: false }); children.push(child); return child;
  } };
});
const locks = /** @type {Array<{ release: () => Promise<void> }>} */ ([]);
const cliPath = fileURLToPath(new URL("./provider-ownership.mjs", import.meta.url));
afterEach(async () => {
  await Promise.all(locks.splice(0).map((lock) => lock.release()));
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const ended = once(child, "close"); child.kill("SIGKILL"); await ended;
  }
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** @param {import("node:http").Server} server */
async function listen(server) {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string" || address.port < 5174) throw new Error("private fixture port unavailable");
  return address.port;
}

/** @param {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, request: { id: string, method: string }) => void} respond */
async function fixture(respond = (_req, res) => { res.writeHead(404); res.end("Session not found"); }) {
  const directory = mkdtempSync(join(tmpdir(), "provider-ownership-")); directories.push(directory);
  const slot = join(directory, "slot.lock"); const owner = browserOwnerPath(slot);
  const requests = /** @type {Array<{ method: string | undefined, session: string | string[] | undefined, protocol: string | string[] | undefined, body: { id: string, method: string } }>} */ ([]);
  const server = createServer((req, res) => {
    let body = ""; req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const parsed = /** @type {unknown} */ (JSON.parse(body));
      if (typeof parsed !== "object" || parsed === null || !("id" in parsed) || typeof parsed.id !== "string" ||
        !("method" in parsed) || typeof parsed.method !== "string") throw new Error("invalid fixture request");
      const request = { id: parsed.id, method: parsed.method };
      requests.push({ method: req.method, session: req.headers["mcp-session-id"], protocol: req.headers["mcp-protocol-version"], body: request });
      respond(req, res, request);
    });
  }); servers.push(server);
  const mcpPort = await listen(server);
  const portProbe = createServer(); const port = await listen(portProbe);
  await new Promise((done) => portProbe.close(done));
  const runner = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await once(runner, "close");
  if (runner.pid === undefined) throw new Error("fixture runner did not spawn");
  const record = { token: "11111111-1111-4111-8111-111111111111", pid: runner.pid, port,
    mcpSessionId: "exact-recorded-session", mcpUrl: `http://127.0.0.1:${String(mcpPort)}/mcp`, mcpProtocolVersion: "2025-11-25",
    mcpExecutionCompleted: true, providerState: "execution-completed" };
  const raw = JSON.stringify(record, null, 2) + "\n"; writeFileSync(owner, raw);
  return { directory, slot, owner, record, raw, requests, mcpPort };
}

/** @param {string} slot */
function startCli(slot) {
  const preload = `${slot}.contained-spawn.mjs`;
  // The actual CLI imports its unmodified production modules. Only its spawn
  // boundary is adapted, retaining lockf, the parent pipe and EOF recovery.
  writeFileSync(preload, `
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync } from "node:fs";
const actualSpawn = childProcess.spawn;
const group = (pid) => {
  try { return Number(childProcess.execFileSync("ps", ["-p", String(pid), "-o", "pgid="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()); }
  catch (error) { if (error.status === 1) return null; throw error; }
};
const trace = (event) => appendFileSync(${JSON.stringify(`${slot}.children.jsonl`)}, JSON.stringify(event) + "\\n");
childProcess.spawn = (command, args, options) => {
  const child = actualSpawn(command, args, { ...options, detached: false });
  trace({ pid: child.pid, group: group(child.pid), parentGroup: group(process.pid) });
  child.once("close", () => trace({ closed: child.pid }));
  return child;
};
syncBuiltinESMExports();
`);
  const child = spawn(process.execPath, ["--import", preload, cliPath, slot], { stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; let diagnostic = "";
  child.stdout?.on("data", (chunk) => { output += String(chunk); });
  child.stderr?.on("data", (chunk) => { diagnostic += String(chunk); });
  const result = once(child, "close").then(([code]) => {
    if (code !== 0) throw new Error(`CLI failed: ${diagnostic}`);
    const parsed = /** @type {unknown} */ (JSON.parse(output));
    if (typeof parsed !== "object" || parsed === null || !("state" in parsed) || typeof parsed.state !== "string") throw new Error("invalid CLI result");
    return { state: parsed.state, ...("evidencePath" in parsed && typeof parsed.evidencePath === "string" ? { evidencePath: parsed.evidencePath } : {}) };
  });
  return { child, result };
}

/** Actual CLI child identities; a fast nonblocking child may already be gone. @param {string} slot */
function cliChildren(slot) {
  return readFileSync(`${slot}.children.jsonl`, "utf8").trim().split("\n").flatMap((line) => {
    const entry = /** @type {unknown} */ (JSON.parse(line));
    if (typeof entry !== "object" || entry === null || !("pid" in entry) || typeof entry.pid !== "number" ||
      !("group" in entry) || (entry.group !== null && typeof entry.group !== "number") ||
      !("parentGroup" in entry) || typeof entry.parentGroup !== "number") return [];
    return [{ pid: entry.pid, group: entry.group, parentGroup: entry.parentGroup }];
  });
}

describe("provider ownership reconciliation", () => {
  it("keeps registered slot archives and server records ignored by actual Git", async () => {
    const f = await fixture();
    execFileSync("git", ["init", "-q", f.directory]);
    writeFileSync(join(f.directory, ".gitignore"), readFileSync(new URL("../../.gitignore", import.meta.url)));
    mkdirSync(join(f.directory, "artifacts", "qa"), { recursive: true });
    const admission = browserLeasePath(f.directory);
    const archives = [];
    for (const slot of [admission, browserSlotPath(admission, 1)]) {
      writeFileSync(browserOwnerPath(slot), f.raw);
      const result = await startCli(slot).result;
      expect(result.state).toBe("retired");
      if (result.evidencePath === undefined) throw new Error("missing archive evidence");
      expect(readFileSync(result.evidencePath, "utf8")).toBe(f.raw);
      archives.push(result.evidencePath);
    }
    const ignored = [...archives, serverRecordPath(admission)];
    expect(execFileSync("git", ["-C", f.directory, "check-ignore", ...ignored], { encoding: "utf8" }).trim().split("\n")).toEqual(ignored);
  });

  it("retires confirmed absence through the public CLI with exact archived bytes and idempotent restart", async () => {
    const f = await fixture();
    const result = await startCli(f.slot).result;
    expect(result.state).toBe("retired");
    expect(existsSync(f.owner)).toBe(false);
    expect(readFileSync(result.evidencePath ?? "", "utf8")).toBe(f.raw);
    const holders = cliChildren(f.slot);
    expect(holders.some((holder) => holder.group !== null)).toBe(true);
    for (const holder of holders) expect(holder.group === null || holder.group === holder.parentGroup).toBe(true);
    expect(readFileSync(`${f.slot}.children.jsonl`, "utf8")).toContain(`"closed":${String(holders[0]?.pid)}`);
    expect(f.requests).toMatchObject([{ method: "POST", session: f.record.mcpSessionId,
      protocol: f.record.mcpProtocolVersion, body: { method: "tools/list" } }]);
    expect(await startCli(f.slot).result).toEqual({ state: "absent" });
    expect(f.requests).toHaveLength(1);
    expect(readFileSync(result.evidencePath ?? "", "utf8")).toBe(f.raw);
  });

  it.each(["json", "sse"])("protects a present transport (%s) without closing or initializing it", async (kind) => {
    const f = await fixture((_req, res, request) => {
      const message = JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { tools: [] } });
      res.writeHead(200, { "Content-Type": kind === "json" ? "application/json" : "text/event-stream" });
      res.end(kind === "json" ? message : `event: message\ndata: ${message}\n\n`);
    });
    expect((await startCli(f.slot).result).state).toBe("provider-present");
    expect(readFileSync(f.owner, "utf8")).toBe(f.raw);
    expect(f.requests.map((request) => request.body.method)).toEqual(["tools/list"]);
  });

  it.each(["generic404", "malformed", "wrong-id", "sdk-error", "redirect", "network"])("retains an unknown %s observation", async (kind) => {
    const f = await fixture((req, res) => {
      if (kind === "network") { req.socket.destroy(); return; }
      res.writeHead(kind === "redirect" ? 302 : kind === "generic404" || kind === "sdk-error" ? 404 : 200,
        { "Content-Type": "application/json", Location: "/wrong-provider" });
      res.end(kind === "generic404" ? "Not Found" : kind === "sdk-error" ? '{"jsonrpc":"2.0","error":{"code":-32001,"message":"Session not found"},"id":null}'
        : kind === "wrong-id" ? '{"jsonrpc":"2.0","id":"other-session","result":{"tools":[]}}' : "malformed response");
    });
    expect((await startCli(f.slot).result).state).toBe("provider-unknown");
    expect(readFileSync(f.owner, "utf8")).toBe(f.raw);
    expect(f.requests).toHaveLength(1);
  });

  it.each(["partial", "legacy", "session", "url", "protocol", "port"])("protects unverified %s metadata without contacting the provider", async (kind) => {
    const f = await fixture(); const value = { ...f.record };
    if (kind === "session") value.mcpSessionId = "";
    if (kind === "url") value.mcpUrl = "";
    if (kind === "protocol") value.mcpProtocolVersion = "";
    if (kind === "port") value.port = 5173;
    const raw = kind === "partial" ? '{"pid":' : JSON.stringify(kind === "legacy" ? { pid: value.pid, token: value.token, port: value.port } : value);
    writeFileSync(f.owner, raw);
    expect((await startCli(f.slot).result).state).toBe("unverified");
    expect(readFileSync(f.owner, "utf8")).toBe(raw); expect(f.requests).toEqual([]);
  });

  it.each(["missing", "false", "call-unconfirmed", "call-and-close-unconfirmed", "unknown"])("retains unconfirmed or contradictory completion receipt (%s)", async (kind) => {
    const f = await fixture();
    const value = { ...f.record, ...(kind === "missing" ? { mcpExecutionCompleted: undefined } :
      kind === "false" ? { mcpExecutionCompleted: false } : { providerState: kind }) };
    const raw = JSON.stringify(value); writeFileSync(f.owner, raw);
    expect((await startCli(f.slot).result).state).toBe("provider-completion-unconfirmed");
    expect(readFileSync(f.owner, "utf8")).toBe(raw); expect(f.requests).toEqual([]);
  });

  it("protects any live or reused runner PID regardless of claimed old lifetime", async () => {
    const f = await fixture();
    const raw = JSON.stringify({ ...f.record, pid: process.pid, startedAt: "different-lifetime" });
    writeFileSync(f.owner, raw);
    expect((await startCli(f.slot).result).state).toBe("live-runner");
    expect(readFileSync(f.owner, "utf8")).toBe(raw); expect(f.requests).toEqual([]);
  });

  it.each(["record", "listener"])("protects an unsettled server %s without provider calls or signals", async (kind) => {
    const f = await fixture();
    if (kind === "record") writeFileSync(serverRecordPath(f.slot), "partial server record");
    else writeFileSync(f.owner, JSON.stringify({ ...f.record, port: f.mcpPort }));
    const raw = readFileSync(f.owner, "utf8");
    expect((await startCli(f.slot).result).state).toBe("server-unsettled");
    expect(readFileSync(f.owner, "utf8")).toBe(raw); expect(f.requests).toEqual([]);
  });

  it("leaves a busy kernel lock and its record untouched", async () => {
    const f = await fixture(); const lock = await tryBrowserLock(f.slot);
    if (lock === null) throw new Error("fixture lock unexpectedly busy"); locks.push(lock);
    expect((await startCli(f.slot).result).state).toBe("busy");
    expect(readFileSync(f.owner, "utf8")).toBe(f.raw); expect(f.requests).toEqual([]);
  });

  it.each(["owner", "server", "listener"])("rechecks %s changes during the absence probe", async (kind) => {
    let f = /** @type {Awaited<ReturnType<typeof fixture>>} */ ({});
    let listener = /** @type {import("node:http").Server | null} */ (null);
    f = await fixture((_req, res) => {
      if (kind === "owner") writeFileSync(f.owner, "changed owner bytes");
      if (kind === "server") writeFileSync(serverRecordPath(f.slot), "new server record");
      const finish = () => { res.writeHead(404); res.end("Session not found"); };
      if (kind === "listener") {
        listener = createServer(); servers.push(listener); listener.listen(f.record.port, "127.0.0.1", finish);
      } else finish();
    });
    expect((await startCli(f.slot).result).state).toBe(kind === "owner" ? "record-changed" : "server-unsettled");
    expect(readFileSync(f.owner, "utf8")).toBe(kind === "owner" ? "changed owner bytes" : f.raw);
    expect(readdirSync(f.directory).some((name) => name.includes(".reconciled-"))).toBe(false);
  });

  it("preserves quarantine and releases the native lock when interrupted during a probe", async () => {
    let observed = () => {};
    const requested = new Promise((/** @type {(value: void) => void} */ done) => { observed = done; });
    const f = await fixture(() => observed());
    const run = startCli(f.slot); const settled = run.result.catch(() => {});
    await requested;
    const ended = once(run.child, "close"); run.child.kill("SIGTERM"); await ended; await settled;
    expect(readFileSync(f.owner, "utf8")).toBe(f.raw);
    const lock = await tryBrowserLock(f.slot);
    if (lock === null) throw new Error("interrupted CLI retained native lock"); locks.push(lock);
    for (const holder of cliChildren(f.slot)) {
      expect(holder.group).toBe(holder.parentGroup);
      expect(() => execFileSync("ps", ["-p", String(holder.pid), "-o", "pid="], { stdio: "ignore" })).toThrow();
    }
  });

  it("reports each retained record once, server before provider, while acquiring another slot", async () => {
    const f = await fixture(); mkdirSync(join(f.directory, "qa"));
    const high = browserSlotPath(f.slot, 1); writeFileSync(browserOwnerPath(high), f.raw);
    writeFileSync(serverRecordPath(high), "retained server");
    rmSync(f.owner);
    const held = await tryBrowserLock(f.slot);
    if (held === null) throw new Error("fixture slot busy"); locks.push(held);
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    const lease = await acquireBrowserLease(f.slot, { slots: 2, onWait: () => { void held.release(); } }); locks.push(lease);
    expect(lease.slot).toBe(0); expect(diagnostic).toHaveBeenCalledTimes(2);
    expect(diagnostic.mock.calls[0]?.[0]).toContain(`node scripts/qa/server-ownership.mjs '${high}'`);
    expect(diagnostic.mock.calls[1]?.[0]).toContain(`node scripts/qa/provider-ownership.mjs '${high}'`);
    expect(readFileSync(browserOwnerPath(high), "utf8")).toBe(f.raw);
  });
});
