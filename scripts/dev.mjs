// `npm run dev`: prepares the workspace, then runs Vite on the given port
// (default 5173, strict).

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { thrownField } from "./lib/node-errors.mjs";

/** @type {Set<import("node:child_process").ChildProcess>} */
const children = new Set();
let shuttingDown = false;

/**
 * Vite arguments with the default strict port added unless the caller set them.
 *
 * @param {string[]} argv
 * @returns {string[]}
 */
export function normalizeForwardedViteArgs(argv) {
  const forwardedArgs = argv[0] === "--" ? argv.slice(1) : [...argv];
  const hasPort = forwardedArgs.some(
    (arg) => arg === "--port" || arg.startsWith("--port="),
  );
  const hasStrictPort = forwardedArgs.some((arg) => arg === "--strictPort");
  /** @type {string[]} */
  const defaultArgs = [];

  if (!hasPort) {
    defaultArgs.push("--port", "5173");
  }
  if (!hasStrictPort) {
    defaultArgs.push("--strictPort");
  }

  return [...defaultArgs, ...forwardedArgs];
}

/**
 * @param {string} command
 * @param {string[]} args
 */
function spawnChild(command, args) {
  const useProcessGroup = process.platform !== "win32";
  const child = spawn(command, args, {
    stdio: "inherit",
    detached: useProcessGroup,
    shell: process.platform === "win32",
  });
  children.add(child);
  child.on("exit", () => {
    children.delete(child);
  });
  return child;
}

/**
 * @param {import("node:child_process").ChildProcess} child
 * @param {NodeJS.Signals} signal
 */
function killChild(child, signal) {
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (thrownField(error, "code") !== "ESRCH") {
        console.warn(
          `Failed to signal child process group ${child.pid}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
  child.kill(signal);
}

/**
 * @param {number} [code]
 * @param {NodeJS.Signals} [signal]
 */
function shutdown(code = 0, signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    killChild(child, signal);
  }
  const deadline = Date.now() + 8_000;
  const timer = setInterval(() => {
    if (children.size === 0 || Date.now() >= deadline) {
      clearInterval(timer);
      process.exit(code);
    }
  }, 100);
}

/**
 * @param {import("node:child_process").ChildProcess} child
 * @returns {Promise<void>}
 */
function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${child.spawnfile} exited with ${signal ?? code}`));
    });
  });
}

function registerShutdownHandlers() {
  process.on("SIGINT", () => shutdown(130, "SIGINT"));
  process.on("SIGTERM", () => shutdown(143, "SIGTERM"));
  process.on("exit", () => {
    if (!shuttingDown) {
      for (const child of children) {
        killChild(child, "SIGTERM");
      }
    }
  });
}

/**
 * Prepares the workspace, then serves Vite with `argv` forwarded to it.
 *
 * @param {string[]} [argv]
 */
export async function runDev(argv = process.argv.slice(2)) {
  registerShutdownHandlers();
  try {
    await waitForExit(
      spawnChild(process.execPath, ["scripts/prepare-workspace.mjs"]),
    );
    const vite = spawnChild("vite", normalizeForwardedViteArgs(argv));
    vite.on("exit", (code, signal) => {
      if (!shuttingDown) {
        shutdown(typeof code === "number" ? code : signal === "SIGINT" ? 130 : 1);
      }
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    shutdown(1);
    await new Promise(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runDev();
}
