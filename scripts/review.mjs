import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildReviewPlan } from "./review-plan.mjs";
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
const lockPath = join(commonGitDir, "journey-full-review.lock");
const task = process.argv[2];
const passthrough = process.argv.slice(3);
const validTasks = new Set([
  "lint",
  "lint-full",
  "typecheck",
  "validate",
  "test",
  "test-full",
  "quick",
  "full",
]);

if (!validTasks.has(task)) {
  console.error(
    "Usage: node scripts/review.mjs " +
    "<lint|lint-full|typecheck|validate|test|test-full|quick|full> [args...]",
  );
  process.exit(2);
}

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function revisionExists(revision) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", revision], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function reviewBase() {
  const configuredBase = process.env.JOURNEY_REVIEW_BASE;
  if (configuredBase !== undefined) {
    if (!revisionExists(configuredBase)) {
      throw new Error(`JOURNEY_REVIEW_BASE does not exist: ${configuredBase}`);
    }
    return gitOutput(["rev-parse", configuredBase]);
  }

  const branch = gitOutput(["branch", "--show-current"]);
  if (branch !== "" && branch !== "master" && revisionExists("master")) {
    return gitOutput(["merge-base", "HEAD", "master"]);
  }
  return gitOutput(["rev-parse", "HEAD"]);
}

function splitNullDelimited(value) {
  return value.split("\0").filter((entry) => entry !== "");
}

function changedFilesSince(base) {
  const tracked = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMRTUXB", "-z", base, "--"],
    { cwd: root, encoding: "utf8" },
  );
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  );
  return [...splitNullDelimited(tracked), ...splitNullDelimited(untracked)];
}

const base = reviewBase();
const reviewPlan = buildReviewPlan(
  changedFilesSince(base),
  (file) => existsSync(join(root, file)),
);

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
  if (!lockHeld) return;
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
  if (step === "ron-format-check") {
    return [
      process.execPath,
      [join(root, "scripts", "format-ron.mjs"), "--check"],
    ];
  }
  if (step === "typecheck") {
    const buildInfo = nodeModulePath(
      ".cache",
      "journey-review",
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
  if (step === "test-related") {
    return [
      process.execPath,
      [
        nodeModulePath("vitest", "vitest.mjs"),
        "related",
        "--run",
        "--passWithNoTests",
        "--maxWorkers=1",
        ...extraArgs,
      ],
    ];
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

function executionPlan() {
  if (task === "full") {
    return [
      { step: "validate", args: [] },
      { step: "ron-format-check", args: [] },
      { step: "lint", args: [] },
      { step: "typecheck", args: [] },
      { step: "test", args: [] },
    ];
  }
  if (task === "lint-full") {
    return [
      { step: "ron-format-check", args: [] },
      { step: "lint", args: passthrough },
    ];
  }
  if (task === "test-full") return [{ step: "test", args: passthrough }];
  if (task === "lint") {
    const steps = [];
    if (reviewPlan.shouldCheckRonFormatting) {
      steps.push({ step: "ron-format-check", args: [] });
    }
    if (reviewPlan.lintFiles.length > 0 || passthrough.length > 0) {
      steps.push({
        step: "lint",
        args: passthrough.length > 0 ? passthrough : reviewPlan.lintFiles,
      });
    }
    return steps;
  }
  if (task === "test") {
    if (passthrough.length > 0) return [{ step: "test", args: passthrough }];
    return reviewPlan.testInputs.length === 0
      ? []
      : [{ step: "test-related", args: reviewPlan.testInputs }];
  }
  if (task === "quick") {
    const steps = [];
    if (reviewPlan.shouldValidate) steps.push({ step: "validate", args: [] });
    if (reviewPlan.shouldCheckRonFormatting) {
      steps.push({ step: "ron-format-check", args: [] });
    }
    if (reviewPlan.lintFiles.length > 0) {
      steps.push({ step: "lint", args: reviewPlan.lintFiles });
    }
    if (reviewPlan.shouldTypecheck) steps.push({ step: "typecheck", args: [] });
    if (reviewPlan.testInputs.length > 0) {
      steps.push({ step: "test-related", args: reviewPlan.testInputs });
    }
    return steps;
  }
  return [{ step: task, args: passthrough }];
}

const requiresFullReviewSlot = ["full", "lint-full", "test-full"].includes(task);
if (requiresFullReviewSlot) {
  await acquireLock();
  lockHeld = true;
}
try {
  const steps = executionPlan();
  if (["quick", "lint", "test"].includes(task)) {
    console.log(
      `[review] ${reviewPlan.changedFiles.length} changed file(s) since ${base.slice(0, 12)}`,
    );
  }
  if (steps.length === 0) {
    console.log("[review] no applicable checks");
  }
  for (const { step, args } of steps) {
    const exitCode = await runStep(step, args);
    if (exitCode !== 0) {
      process.exitCode = exitCode;
      break;
    }
  }
} finally {
  releaseLock();
}
