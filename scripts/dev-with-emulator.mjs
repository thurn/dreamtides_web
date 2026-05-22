import { spawn } from "node:child_process";

const viteArgs = process.argv.slice(2);
const children = new Set();
let shuttingDown = false;
const childEnv = {
  ...process.env,
  PATH: [
    "/opt/homebrew/opt/openjdk@21/bin",
    "/usr/local/opt/openjdk@21/bin",
    process.env.PATH ?? "",
  ].join(":"),
};

function spawnChild(command, args) {
  const child = spawn(command, args, {
    env: childEnv,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  children.add(child);
  child.on("exit", () => {
    children.delete(child);
  });
  return child;
}

function shutdown(code = 0, signal = "SIGTERM") {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of children) {
    child.kill(signal);
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

async function waitForDatabaseEmulator() {
  const url = "http://127.0.0.1:9000/.json?ns=demo-quest-prototype";
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

process.on("SIGINT", () => shutdown(130, "SIGINT"));
process.on("SIGTERM", () => shutdown(143, "SIGTERM"));
process.on("exit", () => {
  if (!shuttingDown) {
    for (const child of children) {
      child.kill("SIGTERM");
    }
  }
});

const emulator = spawnChild("firebase", [
  "emulators:start",
  "--only",
  "database",
  "--project",
  "demo-quest-prototype",
]);

emulator.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.error(`Firebase emulator exited with ${signal ?? code}.`);
    shutdown(typeof code === "number" ? code : 1);
  }
});

try {
  await waitForExit(spawnChild(process.execPath, ["scripts/setup-assets.mjs"]));
  await waitForDatabaseEmulator();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
  await new Promise(() => {});
}

const vite = spawnChild("vite", ["--port", "5173", "--strictPort", ...viteArgs]);
vite.on("exit", (code, signal) => {
  if (!shuttingDown) {
    shutdown(typeof code === "number" ? code : signal === "SIGINT" ? 130 : 1);
  }
});
