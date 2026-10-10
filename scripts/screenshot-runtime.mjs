import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export const DEFAULT_SCREENSHOT_PORT = 5178;

/**
 * An MCP tool result. Only its `isError` flag and the text blocks of its
 * `content` are read.
 *
 * @typedef {Record<string, unknown>} McpToolResult
 */

/**
 * @param {{ name?: string, url?: string, roots?: string[] }} [options]
 */

export async function connectPlaywrightMcp({
  name = `quest-screenshots-${String(process.pid)}`,
  url = process.env.PLAYWRIGHT_MCP_URL ?? "http://localhost:8931/mcp",
  roots = [process.cwd()],
} = {}) {
  const client = new Client(
    { name, version: "1.0.0" },
    { capabilities: { roots: { listChanged: false } } },
  );
  client.setRequestHandler(ListRootsRequestSchema, () =>
    Promise.resolve({
      roots: roots.map((root) => ({
        uri: pathToFileURL(root).href,
        name: root,
      })),
    }));
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);

  return {
    /**
     * @param {string} name
     * @param {Record<string, unknown>} [args]
     * @param {{ timeoutMs?: number }} [options] The request timeout; the
     *   SDK's default is 60 s, too short for a long scenario.
     * @returns {Promise<McpToolResult>}
     */
    async call(name, args = {}, { timeoutMs } = {}) {
      const result = await client.callTool(
        { name, arguments: args },
        undefined,
        timeoutMs === undefined ? undefined : { timeout: timeoutMs },
      );
      if (result.isError) {
        throw new Error(mcpText(result) || `${name} failed`);
      }
      return result;
    },
    async close() {
      try {
        await client.callTool({ name: "browser_close", arguments: {} });
      } finally {
        await client.close();
      }
    },
  };
}

/**
 * @param {McpToolResult} result
 * @returns {string}
 */
export function mcpText(result) {
  const content = Array.isArray(result.content) ? result.content : [];
  return content
    .filter(
      /** @returns {entry is { type: "text", text: string }} */
      (/** @type {unknown} */ entry) =>
        typeof entry === "object" && entry !== null &&
        "type" in entry && entry.type === "text",
    )
    .map((entry) => entry.text)
    .join("\n");
}

/**
 * @param {McpToolResult} result
 * @returns {unknown}
 */
export function parseMcpResult(result) {
  const text = mcpText(result);
  const marker = "### Result\n";
  const start = text.indexOf(marker);
  if (start === -1)
    throw new Error(
      `MCP result is missing a result block: ${text.slice(0, 300)}`,
    );
  const valueStart = start + marker.length;
  const end = text.indexOf("\n### ", valueStart);
  const raw = text.slice(valueStart, end === -1 ? undefined : end).trim();
  try {
    return /** @type {unknown} */ (JSON.parse(raw));
  } catch (error) {
    throw new Error(`Could not parse MCP result: ${raw.slice(0, 300)}`, {
      cause: error,
    });
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} baseUrl
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
export async function waitForServer(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl, { method: "GET" });
      if (response.ok || response.status < 500) return true;
    } catch {
      // The server is still starting.
    }
    await sleep(500);
  }
  return false;
}

/**
 * @param {number} port
 * @param {{ cwd?: string, stderr?: NodeJS.WriteStream }} [options]
 * @returns {Promise<import("node:child_process").ChildProcess>}
 */
export async function startScreenshotDevServer(
  port,
  { cwd = process.cwd(), stderr = process.stderr } = {},
) {
  stderr.write(`Starting dev server on port ${String(port)} …\n`);
  const child = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
    cwd,
    stdio: ["ignore", stderr, stderr],
    detached: process.platform !== "win32",
  });
  const baseUrl = `http://localhost:${String(port)}`;
  const ready = await waitForServer(baseUrl, 90_000);
  if (!ready) {
    await stopProcessTree(child);
    throw new Error(`dev server did not become ready at ${baseUrl} within 90s`);
  }
  return child;
}

/**
 * @param {import("node:child_process").ChildProcess | null} child
 * @param {number} [timeoutMs]
 */
export async function stopProcessTree(child, timeoutMs = 5_000) {
  if (child === null || child.exitCode !== null) return;
  const pid = child.pid;
  // A child that never spawned has no process group to signal.
  if (process.platform !== "win32" && pid === undefined) return;
  const exited = new Promise((resolve) => {
    child.once("exit", resolve);
  });
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-Number(pid), "SIGTERM");
  } catch {
    return;
  }
  const graceful = await Promise.race([
    exited.then(() => true),
    sleep(timeoutMs).then(() => false),
  ]);
  if (graceful) return;
  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-Number(pid), "SIGKILL");
  } catch {
    // The process tree exited between the timeout and the signal.
  }
  await Promise.race([exited, sleep(1_000)]);
}

/**
 * @param {string} baseUrl
 * @param {{
 *   route?: string,
 *   params?: Array<[string, string | number | boolean | null | undefined]>,
 * }} [options]
 * @returns {string}
 */
export function buildAppUrl(baseUrl, { route = "/", params = [] } = {}) {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  const url = new URL(normalizedRoute, `${baseUrl.replace(/\/+$/, "")}/`);
  for (const [key, value] of params) {
    if (value !== null && value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
}
