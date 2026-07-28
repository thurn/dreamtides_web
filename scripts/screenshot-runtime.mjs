import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";

export const DEFAULT_SCREENSHOT_PORT = 5178;

export function resolveAgentBrowser() {
  if (process.env.AGENT_BROWSER) {
    return process.env.AGENT_BROWSER.split(" ").filter(Boolean);
  }
  const homebrew = "/opt/homebrew/bin/agent-browser";
  if (existsSync(homebrew)) return [homebrew];
  return ["agent-browser"];
}

export function makeAgentBrowserRunner(binary, session, options = {}) {
  const globalArgs = options.globalArgs ?? [];
  return function run(args, { capture = false } = {}) {
    const full = [
      ...binary.slice(1),
      ...globalArgs,
      "--session",
      session,
      ...args,
    ];
    return execFileSync(binary[0], full, {
      stdio: capture
        ? ["ignore", "pipe", "pipe"]
        : ["ignore", "inherit", "inherit"],
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  };
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
  const child = spawn(
    "npm",
    ["run", "dev", "--", "--port", String(port)],
    {
      cwd,
      stdio: ["ignore", stderr, stderr],
      detached: process.platform !== "win32",
    },
  );
  const baseUrl = `http://localhost:${String(port)}`;
  const ready = await waitForServer(baseUrl, 90_000);
  if (!ready) {
    await stopProcessTree(child);
    throw new Error(
      `dev server did not become ready at ${baseUrl} within 90s`,
    );
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
