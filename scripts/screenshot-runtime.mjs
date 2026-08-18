import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export const DEFAULT_SCREENSHOT_PORT = 5178;

export async function connectPlaywrightMcp({
  name = `quest-screenshots-${String(process.pid)}`,
  url = process.env.PLAYWRIGHT_MCP_URL ?? "http://localhost:8931/mcp",
  roots = [process.cwd()],
} = {}) {
  const client = new Client(
    { name, version: "1.0.0" },
    { capabilities: { roots: { listChanged: false } } },
  );
  client.setRequestHandler(ListRootsRequestSchema, async () => ({
    roots: roots.map((root) => ({
      uri: pathToFileURL(root).href,
      name: root,
    })),
  }));
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);

  return {
    async call(name, args = {}) {
      const result = await client.callTool({ name, arguments: args });
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

export function mcpText(result) {
  return (result.content ?? [])
    .filter((entry) => entry.type === "text")
    .map((entry) => entry.text)
    .join("\n");
}

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
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Could not parse MCP result: ${raw.slice(0, 300)}`, {
      cause: error,
    });
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export async function stopProcessTree(child, timeoutMs = 5_000) {
  if (child === null || child.exitCode !== null) return;
  const exited = new Promise((resolve) => {
    child.once("exit", resolve);
  });
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
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
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    // The process tree exited between the timeout and the signal.
  }
  await Promise.race([exited, sleep(1_000)]);
}

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
