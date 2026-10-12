// Retire only a completed provider execution whose transport is confirmed absent.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { browserOwnerPath, serverRecordPath, tryBrowserLock } from "./browser-lease.mjs";
import { processIdentity } from "./server-ownership.mjs";

/** @param {unknown} value */
function parsedRecord(value) {
  if (typeof value !== "object" || value === null || !("pid" in value) ||
    typeof value.pid !== "number" || !Number.isInteger(value.pid) || value.pid <= 1 ||
    !("token" in value) || typeof value.token !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.token) ||
    !("port" in value) || typeof value.port !== "number" || !Number.isInteger(value.port) || value.port < 5174 || value.port > 65535 ||
    !("mcpSessionId" in value) || typeof value.mcpSessionId !== "string" || !/^[\x21-\x7e]+$/u.test(value.mcpSessionId) ||
    !("mcpUrl" in value) || typeof value.mcpUrl !== "string" ||
    !("mcpProtocolVersion" in value) || typeof value.mcpProtocolVersion !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value.mcpProtocolVersion)) return null;
  try {
    const url = new URL(value.mcpUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.href !== value.mcpUrl || url.username || url.password || url.hash) return null;
  } catch { return null; }
  return { pid: value.pid, port: value.port, sessionId: value.mcpSessionId,
    url: value.mcpUrl, protocolVersion: value.mcpProtocolVersion,
    completed: "mcpExecutionCompleted" in value && value.mcpExecutionCompleted === true && "providerState" in value &&
      (value.providerState === "execution-completed" || value.providerState === "close-unconfirmed") };
}

/** A listener is observed only; reconciliation never signals it. @param {number} port */
function portFree(port) {
  try {
    execFileSync("lsof", ["-nP", "-a", `-iTCP:${String(port)}`, "-sTCP:LISTEN", "-t"],
      { stdio: ["ignore", "pipe", "ignore"] });
    return false;
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 1) return true;
    throw error;
  }
}

/**
 * Read-only tools/list on the recorded transport, without initialization.
 * Playwright's public http.ts checks its session map before dispatch and
 * returns exactly 404 / "Session not found" for an absent session:
 * https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/tools/utils/mcp/http.ts
 * Generic HTTP failures do not certify absence; absence alone cannot certify
 * teardown. The caller also requires the runner's durable completion receipt.
 * @param {NonNullable<ReturnType<typeof parsedRecord>>} record
 */
async function probe(record) {
  const id = randomUUID();
  try {
    const response = await fetch(record.url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": record.sessionId, "Mcp-Protocol-Version": record.protocolVersion },
      body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list", params: {} }) });
    const body = await response.text();
    if (response.status === 404 && body === "Session not found") return "absent";
    if (response.status !== 200 || body.length > 65536) return "unknown";
    const contentType = response.headers.get("content-type")?.split(";")[0];
    const messages = contentType === "application/json" ? [body] : contentType === "text/event-stream"
      ? body.split(/\r?\n\r?\n/u).map((event) => event.split(/\r?\n/u).filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart()).join("\n")).filter(Boolean) : [];
    for (const message of messages) {
      const value = /** @type {unknown} */ (JSON.parse(message));
      if (typeof value === "object" && value !== null && "jsonrpc" in value && value.jsonrpc === "2.0" &&
        "id" in value && value.id === id && "result" in value && typeof value.result === "object" &&
        value.result !== null && "tools" in value.result && Array.isArray(value.result.tools)) return "present";
    }
  } catch { /* An ambiguous provider observation preserves quarantine. */ }
  return "unknown";
}

/**
 * Only a completed execution receipt, the exact locked slot, a dead runner,
 * a settled server and an unchanged record permit archival after the provider
 * confirms its transport absent. The archive preserves its exact bytes.
 * @param {string} slotPath
 */
export async function reconcileProvider(slotPath) {
  const lock = await tryBrowserLock(slotPath);
  if (lock === null) return { state: "busy" };
  try {
    const path = browserOwnerPath(slotPath);
    if (!existsSync(path)) return { state: "absent" };
    const raw = readFileSync(path);
    let record;
    try { record = parsedRecord(/** @type {unknown} */ (JSON.parse(raw.toString("utf8")))); } catch { return { state: "unverified", path }; }
    if (record === null) return { state: "unverified", path };
    if (!record.completed) return { state: "provider-completion-unconfirmed", path };
    const guards = () => {
      if (!existsSync(path) || !readFileSync(path).equals(raw)) return "record-changed";
      // A reused PID protects the record as conservatively as a live owner.
      if (processIdentity(record.pid) !== null) return "live-runner";
      if (existsSync(serverRecordPath(slotPath)) || !portFree(record.port)) return "server-unsettled";
      return null;
    };
    let guarded = guards();
    if (guarded !== null) return { state: guarded, path };
    const observed = await probe(record);
    guarded = guards();
    if (guarded !== null) return { state: guarded, path };
    if (observed !== "absent") return { state: `provider-${observed}`, path };
    const evidencePath = `${path}.reconciled-${randomUUID()}.json`;
    if (existsSync(evidencePath)) return { state: "unverified", path };
    renameSync(path, evidencePath);
    return { state: "retired", path, evidencePath, sessionId: record.sessionId };
  } finally { await lock.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slotPath = process.argv[2];
  if (slotPath === undefined || process.argv.length !== 3) throw new Error("usage: node scripts/qa/provider-ownership.mjs <exact-slot-lock-path>");
  console.log(JSON.stringify(await reconcileProvider(slotPath)));
}
