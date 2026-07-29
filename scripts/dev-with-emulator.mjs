import { spawn } from "node:child_process";
import {
  mkdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";

const databaseHost = "127.0.0.1";
const preferredDatabasePort = 9000;
const preferredUiPort = 4000;
const preferredHubPort = 4400;
const preferredLoggingPort = 4500;
export const DEV_EMULATOR_PROJECT_ID = "demo-journey-prototype";
const children = new Set();
const runtimeStateDir = join(
  process.cwd(),
  "node_modules",
  ".cache",
  "journey-dev",
);
const runtimeStatePath = join(runtimeStateDir, `${String(process.pid)}.json`);
const reservedPorts = new Set();
let shuttingDown = false;
let tempConfigDir = null;
const runtimeStartedAt = new Date().toISOString();
const baseChildEnv = {
  ...process.env,
  PATH: [
    "/opt/homebrew/opt/openjdk@21/bin",
    "/usr/local/opt/openjdk@21/bin",
    process.env.PATH ?? "",
  ].join(":"),
};

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

function spawnChild(command, args, envOverrides = {}) {
  const useProcessGroup = process.platform !== "win32";
  const child = spawn(command, args, {
    env: {
      ...baseChildEnv,
      ...envOverrides,
    },
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

function writeRuntimeState() {
  mkdirSync(runtimeStateDir, { recursive: true });
  const temporaryPath = `${runtimeStatePath}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify({
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
    }, null, 2)}\n`,
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
  if (shuttingDown) {
    return;
  }
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
  timer.unref();
}

export function formatChildExit(code, signal) {
  if (typeof code === "number") {
    return `exit code ${code}`;
  }
  return `signal ${signal ?? "unknown"}`;
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function checkPort(host, port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, host);
  });
}

async function portIsAvailable(port) {
  return !reservedPorts.has(port) && (await checkPort(databaseHost, port));
}

async function findAvailablePort(preferredPort) {
  if (await portIsAvailable(preferredPort)) {
    reservedPorts.add(preferredPort);
    return preferredPort;
  }

  for (let port = preferredPort + 1; port < preferredPort + 100; port += 1) {
    if (await portIsAvailable(port)) {
      reservedPorts.add(port);
      return port;
    }
  }

  throw new Error(`Could not find an available port near ${preferredPort}.`);
}

async function writeFirebaseConfig(databasePort, uiPort, hubPort, loggingPort) {
  tempConfigDir = await mkdtemp(join(tmpdir(), "journey-firebase-emulator-"));
  const configPath = join(tempConfigDir, "firebase.json");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        database: {
          rules: "database.rules.json",
        },
        emulators: {
          database: {
            host: databaseHost,
            port: databasePort,
          },
          ui: {
            enabled: true,
            host: databaseHost,
            port: uiPort,
          },
          hub: {
            host: databaseHost,
            port: hubPort,
          },
          logging: {
            host: databaseHost,
            port: loggingPort,
          },
          singleProjectMode: true,
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(tempConfigDir, "database.rules.json"),
    await readFile("database.rules.json", "utf8"),
  );
  return configPath;
}

function cleanupTempConfig() {
  if (tempConfigDir === null) {
    return;
  }

  const directory = tempConfigDir;
  tempConfigDir = null;
  rmSync(directory, { recursive: true, force: true });
}

async function waitForDatabaseEmulator(databasePort) {
  const url = `http://${databaseHost}:${databasePort}/.json?ns=${DEV_EMULATOR_PROJECT_ID}`;
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // The emulator is still starting.
    }

    await sleep(250);
  }

  throw new Error("Timed out waiting for the Realtime Database emulator.");
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
    cleanupTempConfig();
    removeRuntimeState();
  });
}

export async function runDevWithEmulator(argv = process.argv.slice(2)) {
  registerShutdownHandlers();
  writeRuntimeState();

  try {
    const databasePort = await findAvailablePort(preferredDatabasePort);
    const uiPort = await findAvailablePort(preferredUiPort);
    const hubPort = await findAvailablePort(preferredHubPort);
    const loggingPort = await findAvailablePort(preferredLoggingPort);
    const firebaseConfigPath = await writeFirebaseConfig(
      databasePort,
      uiPort,
      hubPort,
      loggingPort,
    );
    const emulatorEnv = {
      VITE_FIREBASE_DATABASE_EMULATOR_HOST: databaseHost,
      VITE_FIREBASE_DATABASE_EMULATOR_PORT: String(databasePort),
    };

    console.log(
      `Firebase database emulator: ${databaseHost}:${databasePort}; Emulator UI: ${databaseHost}:${uiPort}; Hub: ${databaseHost}:${hubPort}; Logging: ${databaseHost}:${loggingPort}`,
    );

    const emulator = spawnChild("firebase", [
      "emulators:start",
      "--only",
      "database",
      "--project",
      DEV_EMULATOR_PROJECT_ID,
      "--config",
      firebaseConfigPath,
    ]);

    let viteStarted = false;
    emulator.on("exit", (code, signal) => {
      if (!shuttingDown) {
        if (!viteStarted) {
          console.error(
            `Firebase emulator exited before Vite started (${formatChildExit(
              code,
              signal,
            )}).`,
          );
          shutdown(1);
          return;
        }
        console.error(`Firebase emulator exited with ${formatChildExit(code, signal)}.`);
        shutdown(typeof code === "number" ? code : 1);
      }
    });

    await waitForExit(spawnChild(process.execPath, ["scripts/setup-assets.mjs"]));
    await waitForDatabaseEmulator(databasePort);

    viteStarted = true;
    const vite = spawnChild("vite", normalizeForwardedViteArgs(argv), emulatorEnv);
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
  await runDevWithEmulator();
}
