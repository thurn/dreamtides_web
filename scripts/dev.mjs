// `npm run dev`: prepares the workspace, then runs Vite on the given port
// (default 5173, strict). Records its process tree under
// node_modules/.cache/journey-dev/ so `npm run dev:status` and `dev:stop` can
// find it.

import { spawn } from "node:child_process";
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const children = new Set();
const runtimeStateDir = join(
  process.cwd(),
  "node_modules",
  ".cache",
  "journey-dev",
);
const runtimeStatePath = join(runtimeStateDir, `${String(process.pid)}.json`);
const runtimeStartedAt = new Date().toISOString();
let shuttingDown = false;

/** Vite arguments with the default strict port added unless the caller set them. */
export function normalizeForwardedViteArgs(argv) {
  const forwardedArgs = argv[0] === "--" ? argv.slice(1) : [...argv];
  const hasPort = forwardedArgs.some(
    (arg) => arg === "--port" || arg.startsWith("--port="),
  );
  const hasStrictPort = forwardedArgs.some((arg) => arg === "--strictPort");
  const defaultArgs = [];

  if (!hasPort) {
    defaultArgs.push("--port", "5173");
  }
  if (!hasStrictPort) {
    defaultArgs.push("--strictPort");
  }

  return [...defaultArgs, ...forwardedArgs];
}

function writeRuntimeState() {
  mkdirSync(runtimeStateDir, { recursive: true });
  const temporaryPath = `${runtimeStatePath}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify(
      {
        pid: process.pid,
        cwd: process.cwd(),
        startedAt: runtimeStartedAt,
        children: [...children]
          .filter((child) => child.pid !== undefined)
          .map((child) => ({
            pid: child.pid,
            command: child.spawnfile,
            args: child.spawnargs.slice(1),
          })),
      },
      null,
      2,
    )}\n`,
  );
  renameSync(temporaryPath, runtimeStatePath);
}

function removeRuntimeState() {
  try {
    unlinkSync(runtimeStatePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function spawnChild(command, args) {
  const useProcessGroup = process.platform !== "win32";
  const child = spawn(command, args, {
    stdio: "inherit",
    detached: useProcessGroup,
    shell: process.platform === "win32",
  });
  children.add(child);
  writeRuntimeState();
  child.on("exit", () => {
    children.delete(child);
    writeRuntimeState();
  });
  return child;
}

function killChild(child, signal) {
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code !== "ESRCH") {
        console.warn(
          `Failed to signal child process group ${child.pid}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }
  child.kill(signal);
}

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
    removeRuntimeState();
  });
}

/** Prepares the workspace, then serves Vite with `argv` forwarded to it. */
export async function runDev(argv = process.argv.slice(2)) {
  registerShutdownHandlers();
  writeRuntimeState();
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
