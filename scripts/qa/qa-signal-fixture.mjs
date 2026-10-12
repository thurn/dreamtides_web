// Standalone private child: actual OS signals target this process, never a test worker.
// Native descendants and locks stay inside the parent test job; SDK/network are synthetic.
import cp from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { childProcessMocks, networkMocks } from "./qa-session-mocks.mjs";
const [checkout, root, mode] = process.argv.slice(2);
if (checkout === undefined || root === undefined) throw new Error("signal fixture paths required");
const actual = { ...cp };
const actualFs = { ...fs };
const io = /** @type {import("./qa-session-mocks.mjs").SessionFixtureIo} */ ({
  gitCwd: root, children: [], ready: Promise.resolve(), groups: [],
});
const adapter = childProcessMocks(actual, io);
Object.defineProperty(cp, "spawn", { value: adapter.spawn.bind(adapter) });
// The shared fixture models server identity and network availability; every
// process lifetime used in the final proof is read through the actual OS API.
Object.defineProperty(cp, "execFileSync", { value:
  (/** @type {string} */ command, /** @type {string[]} */ args, /** @type {import("node:child_process").ExecFileSyncOptionsWithStringEncoding} */ options) =>
    command === "lsof" ? `${String(io.children.find((child) => child.spawnargs[1]?.endsWith("/server-launcher.mjs"))?.pid)}\n` : adapter.execFileSync(command, args, options),
});
const sockets = networkMocks(net);
Object.defineProperty(net, "createConnection", { value: sockets.createConnection.bind(sockets) });
Object.defineProperty(net, "createServer", { value: sockets.createServer.bind(sockets) });
const realKill = process.kill.bind(process);
Object.defineProperty(process, "kill", { value: (/** @type {number} */ pid, /** @type {NodeJS.Signals | number | undefined} */ signal) => {
  const child = pid < 0 ? io.children.find((entry) => entry.pid === -pid) : undefined;
  if (child !== undefined) { child.stdin?.end(); return child.kill(signal); }
  return realKill(pid, signal);
} });
const interruption = new Error("synthetic interruption cause");
interruption.toString = () => { throw new Error("synthetic coercion rejection"); };
const diagnostic = new Error("synthetic signal diagnostic");
const output = process.stderr.write.bind(process.stderr);
process.stderr.write = (/** @type {string | Uint8Array} */ text) => {
  if (String(text).includes(mode !== "interruption" ? ": stopping" : "server interruption requires reconciliation")) throw diagnostic;
  return output(text);
};
fs.unlinkSync = (path) => {
  actualFs.unlinkSync(path);
  if (mode === "interruption" && String(path).endsWith(".server.json")) throw interruption;
};
syncBuiltinESMExports();
globalThis.fetch = async () => { await io.ready; return new Response(null, { status: 200 }); };
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
Object.defineProperty(StreamableHTTPClientTransport.prototype, "sessionId", { get: () => "synthetic-signal-session" });
Object.defineProperty(StreamableHTTPClientTransport.prototype, "protocolVersion", { get: () => "2025-11-25" });
const events = /** @type {string[]} */ ([]);
Client.prototype.connect = () => Promise.resolve();
let resumeBrowser = () => {};
const browserResponse = /** @type {Promise<{ content: [] }>} */ (new Promise((resolve) => { resumeBrowser = () => resolve({ content: [] }); }));
if (mode === "concurrent") for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) process.once(signal, () => resumeBrowser());
Client.prototype.callTool = () => {
  events.push("browser-close");
  if (mode === "concurrent") { process.send?.({ type: "closing" }); return browserResponse; }
  return Promise.resolve({ content: [] });
};
Client.prototype.close = () => { events.push("transport-close"); return Promise.resolve(); };
const { openQaSession } = await import("./run-scenario.mjs");
const { lockHeld } = await import("./browser-lease-fixture.mjs");
const { browserSlotPath, serverRecordPath } = await import("./browser-lease.mjs");
const session = await openQaSession({ bead: "synthetic-signal", label: "signal", port: null, prod: false, minify: false, cwd: root });
const identities = () => actual.execFileSync("ps", ["-axo", "pid=,ppid=,lstart=,command="], { encoding: "utf8" })
  .trim().split("\n").map((line) => {
    const fields = /^\s*(\d+)\s+(\d+)\s+((?:\S+\s+){4}\S+)\s+(.*)$/u.exec(line);
    if (fields === null) throw new Error("unreadable actual fixture process identity");
    return { pid: Number(fields[1]), parent: Number(fields[2]), started: String(fields[3]).replace(/\s+/gu, " "), command: fields[4] };
  });
const owned = identities().filter((identity) => io.children.some((child) => child.pid === identity.pid || child.pid === identity.parent));
const exit = process.exit.bind(process);
let reporting = false;
/** @param {unknown} error @returns {unknown[]} */
const causes = (error) => error instanceof AggregateError ? error.errors.flatMap(causes) : [error];
/** @param {number | undefined} code @param {boolean} [uncaught] */
async function report(code, uncaught = false) {
  if (reporting) return;
  reporting = true;
  const before = { events: [...events], leaseHeld: lockHeld(browserSlotPath(session.leasePath, session.slot)),
    evidenceHeld: lockHeld(join(session.captureDir, "signal.server.log")) };
  // Reporter fallback only settles broken-source fixtures. Assertions use the
  // state above, so fallback cannot certify production signal cleanup.
  const closing = session.close();
  const idempotent = session.close() === closing;
  const error = await closing.catch((/** @type {unknown} */ value) => value);
  const remaining = identities();
  process.send?.({ type: "done", code, uncaught, before, idempotent,
    causes: causes(error).map((cause) => cause === diagnostic ? "diagnostic" : cause === interruption ? "interruption" : cause === undefined ? "none" : "other"),
    ownerExists: fs.existsSync(session.ownerPath), serverExists: fs.existsSync(serverRecordPath(browserSlotPath(session.leasePath, session.slot))),
    leaseHeld: lockHeld(browserSlotPath(session.leasePath, session.slot)), evidenceHeld: lockHeld(join(session.captureDir, "signal.server.log")),
    owned, remainingOwned: owned.filter((identity) => remaining.some((entry) => entry.pid === identity.pid && entry.started === identity.started)),
  }, () => exit(code));
}
Object.defineProperty(process, "exit", { value: (/** @type {number | undefined} */ code) => { void report(code); } });
process.on("uncaughtException", () => { void report(0, true); });
process.send?.({ type: "ready", pid: process.pid,
  group: actual.execFileSync("ps", ["-p", String(process.pid), "-o", "pgid="], { encoding: "utf8" }).trim(), owned });

// Public close starts first; the real signal arrives while its browser RPC waits.
if (mode === "concurrent") process.once("message", () => { void session.close().catch(() => {}); });
