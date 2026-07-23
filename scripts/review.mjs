import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  readReviewLockOwner,
  removeReviewLockIfUnchanged,
  replaceReviewLockOwner,
  snapshotReviewLock,
  tryCreateReviewLock,
} from "./review-lock.mjs";

const root = process.cwd();
const commonGitDir = resolve(
  root,
  execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
);
const lockPath = join(commonGitDir, "quest-review.lock");
const task = process.argv[2];
const passthrough = process.argv.slice(3);
const validTasks = new Set(["lint", "typecheck", "validate", "test", "all"]);

if (!validTasks.has(task)) {
  console.error("Usage: node scripts/review.mjs <lint|typecheck|validate|test|all> [args...]");
  process.exit(2);
}

function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readOwner() {
  return readReviewLockOwner(lockPath);
}

function ownerIsAlive(owner) {
  return owner !== null &&
    (pidIsAlive(owner.pid) || pidIsAlive(owner.childPid));
}

function ownerRecord(extra = {}) {
  return {
    pid: process.pid,
    cwd: root,
    task,
    startedAt: new Date().toISOString(),
    ...extra,
  };
}

function writeOwner(extra = {}) {
  replaceReviewLockOwner(lockPath, ownerRecord(extra));
}

async function acquireLock() {
  let lastNotice = 0;
  for (;;) {
    if (tryCreateReviewLock(lockPath, ownerRecord())) {
      return;
    }

    const snapshot = snapshotReviewLock(lockPath);
    const owner = readOwner();
    if (!ownerIsAlive(owner)) {
      removeReviewLockIfUnchanged(lockPath, snapshot);
      continue;
    }

    if (Date.now() - lastNotice >= 15_000) {
      const label = owner.cwd === undefined
        ? `PID ${String(owner.pid ?? owner.childPid)}`
        : `${String(owner.task ?? "review")} in ${String(owner.cwd)}`;
      console.log(`Waiting for the repository review slot (${label})...`);
      lastNotice = Date.now();
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
}

let child = null;
let lockHeld = false;

function releaseLock() {
  if (!lockHeld) return;
  lockHeld = false;
  const snapshot = snapshotReviewLock(lockPath);
  const owner = readOwner();
  if (owner?.pid === process.pid) {
    removeReviewLockIfUnchanged(lockPath, snapshot);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (child !== null) child.kill(signal);
    // Leave the owner record in place while a signalled child unwinds. The
    // next review waits for that exact PID, then recovers the stale lock.
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

function nodeModulePath(...parts) {
  return join(root, "node_modules", ...parts);
}

function commandFor(step, extraArgs = []) {
  if (step === "lint") {
    return [process.execPath, [join(root, "scripts", "run-eslint.mjs"), ...extraArgs]];
  }
  if (step === "typecheck") {
    const buildInfo = nodeModulePath(
      ".cache",
      "quest-review",
      "tsconfig.tsbuildinfo",
    );
    mkdirSync(dirname(buildInfo), { recursive: true });
    return [
      process.execPath,
      [
        nodeModulePath("typescript", "bin", "tsc"),
        "--noEmit",
        "--incremental",
        "--tsBuildInfoFile",
        buildInfo,
        ...extraArgs,
      ],
    ];
  }
  if (step === "validate") {
    return [process.execPath, [join(root, "scripts", "setup-assets.mjs"), ...extraArgs]];
  }
  return [
    process.execPath,
    [nodeModulePath("vitest", "vitest.mjs"), "run", ...extraArgs],
  ];
}

async function runStep(step, extraArgs = []) {
  const [command, args] = commandFor(step, extraArgs);
  console.log(`\n[review] ${step}`);
  const startedAt = Date.now();
  child = spawn(command, args, { cwd: root, env: process.env, stdio: "inherit" });
  writeOwner({ childPid: child.pid, step });
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) resolveExit(128 + (signal === "SIGINT" ? 2 : 15));
      else resolveExit(code ?? 1);
    });
  });
  child = null;
  writeOwner({ step });
  const seconds = ((Date.now() - startedAt) / 1_000).toFixed(1);
  console.log(`[review] ${step} finished in ${seconds}s`);
  return exitCode;
}

await acquireLock();
lockHeld = true;
try {
  const steps = task === "all" ? ["validate", "lint", "typecheck", "test"] : [task];
  for (const step of steps) {
    const exitCode = await runStep(step, task === "all" ? [] : passthrough);
    if (exitCode !== 0) {
      process.exitCode = exitCode;
      break;
    }
  }
} finally {
  releaseLock();
}
