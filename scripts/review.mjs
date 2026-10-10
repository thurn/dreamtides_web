import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  buildReviewPlan,
  gateExecutionPlan,
  IMPORTER_EXTENSIONS,
  importersOf,
  importSearchNeedles,
  reviewNeedsPreparedWorkspace,
  STATIC_CHECK_STEPS,
  TYPECHECK_STEPS,
} from "./review-plan.mjs";
import {
  nodeTypecheckArgs,
  publishTypecheckState,
  seedTypecheckState,
  sharesTypecheckState,
  typecheckArgs,
  typecheckStatePaths,
} from "./typecheck-cache.mjs";
import {
  readReviewLockOwner,
  removeReviewLockIfUnchanged,
  replaceReviewLockOwner,
  snapshotReviewLock,
  tryCreateReviewLock,
} from "./review-lock.mjs";
import { thrownField } from "./lib/node-errors.mjs";

/**
 * @typedef {import("./review-plan.mjs").ReviewStep} ReviewStep
 * @typedef {import("./review-plan.mjs").ReviewPlanEntry} ReviewPlanEntry
 * @typedef {import("./review-lock.mjs").ReviewLockOwner} ReviewLockOwner
 */

const root = process.cwd();
const localAssetHome = resolve(
  process.env.DREAMTIDES_LOCAL_ASSET_HOME ?? homedir(),
);
const shouldRestoreLocalAssets =
  process.env.CI === undefined &&
  existsSync(
    join(localAssetHome, "Documents", "dreamsigns", "filtered", "outlined"),
  );
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
  "gate",
  "full",
]);

if (!validTasks.has(task)) {
  console.error(
    "Usage: node scripts/review.mjs " +
    "<lint|lint-full|typecheck|validate|test|test-full|quick|gate|full> " +
    "[args...]",
  );
  process.exit(2);
}

/** @param {string[]} args */
function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

/** @param {string} revision */
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

/**
 * The gate stage checks the tested commit against its parent. A root commit
 * diffs against the empty tree, so every file counts as changed.
 */
function gateBase() {
  if (revisionExists("HEAD^")) return gitOutput(["rev-parse", "HEAD^"]);
  return execFileSync("git", ["hash-object", "-t", "tree", "--stdin"], {
    cwd: root,
    encoding: "utf8",
    input: "",
  }).trim();
}

/** @param {string} value */
function splitNullDelimited(value) {
  return value.split("\0").filter((entry) => entry !== "");
}

/**
 * Paths changed since `base`, deletions included. Rename detection is off, so
 * a renamed file reports its old path as a deletion and its new path as an
 * addition.
 *
 * @param {string} base
 */
function changedFilesSince(base) {
  const tracked = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--no-renames",
      "--diff-filter=ACDMTUXB",
      "-z",
      base,
      "--",
    ],
    { cwd: root, encoding: "utf8" },
  );
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  );
  return [...splitNullDelimited(tracked), ...splitNullDelimited(untracked)];
}

/**
 * Tracked and untracked working-tree files that import one of the deleted
 * `targets`. `git grep` narrows the candidates to files that mention a
 * target's stem before their imports are resolved.
 *
 * @param {string[]} targets
 * @returns {string[]}
 */
function findImporters(targets) {
  /** @type {string} */
  let listed;
  try {
    listed = execFileSync(
      "git",
      [
        "grep",
        "--untracked",
        "-l",
        "-z",
        "-F",
        ...importSearchNeedles(targets).flatMap((needle) => ["-e", needle]),
        "--",
        ...IMPORTER_EXTENSIONS.map((extension) => `*${extension}`),
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (error) {
    // `git grep` exits 1 when nothing matches.
    if (thrownField(error, "status") === 1) return [];
    throw error;
  }
  return importersOf(
    targets,
    splitNullDelimited(listed).map((path) => ({
      path,
      source: readFileSync(join(root, path), "utf8"),
    })),
  );
}

const base = task === "gate" ? gateBase() : reviewBase();
const reviewPlan = buildReviewPlan(
  changedFilesSince(base),
  (file) => existsSync(join(root, file)),
  findImporters,
);

/** @param {number | undefined} pid */
function pidIsAlive(pid) {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return thrownField(error, "code") === "EPERM";
  }
}

function readOwner() {
  return readReviewLockOwner(lockPath);
}

/**
 * @param {ReviewLockOwner | null} owner
 * @returns {boolean}
 */
function ownerIsAlive(owner) {
  return owner !== null &&
    (pidIsAlive(owner.pid) || pidIsAlive(owner.childPid));
}

/**
 * @param {Partial<ReviewLockOwner>} [extra]
 * @returns {ReviewLockOwner}
 */
function ownerRecord(extra = {}) {
  return {
    pid: process.pid,
    cwd: root,
    task,
    startedAt: new Date().toISOString(),
    ...extra,
  };
}

/** @param {Partial<ReviewLockOwner>} [extra] */
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
    if (owner === null || !ownerIsAlive(owner)) {
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

/** @type {Set<import("node:child_process").ChildProcess>} */
const children = new Set();
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

for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
  process.on(signal, () => {
    for (const running of children) running.kill(signal);
    // Leave the owner record in place while a signalled child unwinds. The
    // next review waits for that exact PID, then recovers the stale lock.
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

/** @param {string[]} parts */
function nodeModulePath(...parts) {
  return join(root, "node_modules", ...parts);
}

const typecheckPaths = typecheckStatePaths({ root, commonGitDir });
// The gate stage certifies promotion, so like the exhaustive tasks it
// typechecks cold and never reads or publishes the shared build info.
const shareTypecheckState = task !== "gate" && sharesTypecheckState(task);

/**
 * @param {string} step
 * @param {string[]} [extraArgs]
 * @returns {[string, string[]]}
 */
function commandFor(step, extraArgs = []) {
  if (step === "lint") {
    return [process.execPath, [join(root, "scripts", "run-eslint.mjs"), ...extraArgs]];
  }
  if (step === "typecheck") {
    mkdirSync(dirname(typecheckPaths.buildInfo), { recursive: true });
    return [
      process.execPath,
      typecheckArgs({
        tsc: nodeModulePath("typescript", "bin", "tsc"),
        paths: typecheckPaths,
        extraArgs,
      }),
    ];
  }
  if (step === "typecheck-node") {
    mkdirSync(dirname(typecheckPaths.nodeBuildInfo), { recursive: true });
    return [
      process.execPath,
      nodeTypecheckArgs({
        tsc: nodeModulePath("typescript", "bin", "tsc"),
        paths: typecheckPaths,
      }),
    ];
  }
  if (step === "prepare") {
    return [process.execPath, [join(root, "scripts", "prepare-workspace.mjs")]];
  }
  if (step === "restore-local-assets") {
    return [
      process.execPath,
      ["--import", "tsx", join(root, "scripts", "setup-assets.ts")],
    ];
  }
  if (step === "bundle") {
    return [process.execPath, [join(root, "scripts", "qa", "check-production-bundle.mjs")]];
  }
  if (step === "import-cycles") {
    return [process.execPath, [join(root, "scripts", "import-cycles.mjs")]];
  }
  if (step === "test-related-capped") {
    return [
      process.execPath,
      [join(root, "scripts", "review-related-tests.mjs"), ...extraArgs],
    ];
  }
  if (step === "test-related") {
    return [
      process.execPath,
      [
        nodeModulePath("vitest", "vitest.mjs"),
        "related",
        "--run",
        "--passWithNoTests",
        ...extraArgs,
      ],
    ];
  }
  return [
    process.execPath,
    [nodeModulePath("vitest", "vitest.mjs"), "run", ...extraArgs],
  ];
}

/**
 * Runs one review step. A buffered step collects its output and prints it as
 * one block when it exits, so concurrent steps never interleave lines.
 *
 * @param {string} step
 * @param {string[]} [extraArgs]
 * @param {{ isolateLocalAssets?: boolean, buffered?: boolean }} [options]
 * @returns {Promise<number>}
 */
async function runStep(
  step,
  extraArgs = [],
  { isolateLocalAssets = true, buffered = false } = {},
) {
  if (step === "typecheck" && shareTypecheckState) {
    seedTypecheckState(typecheckPaths);
  }
  const [command, args] = commandFor(step, extraArgs);
  if (!buffered) console.log(`\n[review] ${step}`);
  const startedAt = Date.now();
  const env = isolateLocalAssets
    ? {
        ...process.env,
        DREAMTIDES_LOCAL_ASSET_HOME: join(
          root,
          "node_modules",
          ".cache",
          "journey-review",
          "local-assets",
        ),
      }
    : process.env;
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: buffered ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  children.add(child);
  /** @type {Buffer[]} */
  const output = [];
  child.stdout?.on("data", (/** @type {Buffer} */ chunk) => output.push(chunk));
  child.stderr?.on("data", (/** @type {Buffer} */ chunk) => output.push(chunk));
  writeOwner({ childPid: child.pid, step });
  /** @type {number} */
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal !== null) resolveExit(128 + (signal === "SIGINT" ? 2 : 15));
      else resolveExit(code ?? 1);
    });
  });
  children.delete(child);
  writeOwner({ step });
  const seconds = ((Date.now() - startedAt) / 1_000).toFixed(1);
  if (buffered) {
    console.log(`\n[review] ${step}`);
    process.stdout.write(Buffer.concat(output));
  }
  console.log(`[review] ${step} finished in ${seconds}s`);
  if (step === "typecheck" && exitCode === 0 && shareTypecheckState) {
    publishTypecheckState(typecheckPaths);
  }
  return exitCode;
}

/**
 * Runs independent steps concurrently; returns the first failing exit code.
 *
 * @param {ReviewStep[]} steps
 */
async function runConcurrentSteps(steps) {
  const exitCodes = await Promise.all(
    steps.map(({ step, args }) => runStep(step, args, { buffered: true })),
  );
  return exitCodes.find((exitCode) => exitCode !== 0) ?? 0;
}

/** @returns {ReviewPlanEntry[]} */
function executionPlan() {
  const needsPreparedWorkspace = reviewNeedsPreparedWorkspace(reviewPlan);

  if (task === "full") {
    // Lint, typecheck and the import-cycle check share no state, so they
    // overlap.
    return [
      { step: "prepare", args: [] },
      { concurrent: [{ step: "lint", args: [] }, ...STATIC_CHECK_STEPS] },
      { step: "test", args: [] },
      // The production bundle assertion (P7): no development-only module ships.
      { step: "bundle", args: [] },
    ];
  }
  if (task === "gate") {
    return gateExecutionPlan(reviewPlan);
  }
  if (task === "lint-full") {
    return [
      { step: "prepare", args: [] },
      { step: "lint", args: passthrough },
    ];
  }
  if (task === "test-full") {
    return [
      { step: "prepare", args: [] },
      { step: "test", args: passthrough },
    ];
  }
  if (task === "lint") {
    /** @type {ReviewPlanEntry[]} */
    const steps = [];
    if (needsPreparedWorkspace) steps.push({ step: "prepare", args: [] });
    if (reviewPlan.lintFiles.length > 0 || passthrough.length > 0) {
      steps.push({
        step: "lint",
        args: passthrough.length > 0 ? passthrough : reviewPlan.lintFiles,
      });
    }
    return steps;
  }
  if (task === "test") {
    if (passthrough.length > 0) {
      return [
        { step: "prepare", args: [] },
        { step: "test", args: passthrough },
      ];
    }
    return reviewPlan.testInputs.length === 0
      ? []
      : [
          { step: "prepare", args: [] },
          { step: "test-related", args: reviewPlan.testInputs },
        ];
  }
  if (task === "quick") {
    /** @type {ReviewPlanEntry[]} */
    const steps = [];
    if (needsPreparedWorkspace) steps.push({ step: "prepare", args: [] });
    if (reviewPlan.lintFiles.length > 0) {
      steps.push({ step: "lint", args: reviewPlan.lintFiles });
    }
    if (reviewPlan.shouldTypecheck) steps.push({ concurrent: STATIC_CHECK_STEPS });
    if (reviewPlan.testInputs.length > 0) {
      steps.push({ step: "test-related", args: reviewPlan.testInputs });
    }
    return steps;
  }
  if (task === "validate") {
    return [{ step: "prepare", args: [] }];
  }
  if (task === "typecheck") {
    return [
      { step: "prepare", args: [] },
      {
        concurrent: TYPECHECK_STEPS.map((entry) =>
          entry.step === "typecheck" ? { ...entry, args: passthrough } : entry
        ),
      },
    ];
  }
  return [
    { step: "prepare", args: [] },
    { step: task, args: passthrough },
  ];
}

const requiresFullReviewSlot = ["full", "lint-full", "test-full"].includes(task);
let restoreLocalAssets = false;
if (requiresFullReviewSlot) {
  await acquireLock();
  lockHeld = true;
}
try {
  const steps = executionPlan();
  if (["quick", "gate", "lint", "test"].includes(task)) {
    console.log(
      `[review] ${reviewPlan.changedFiles.length} changed file(s) since ${base.slice(0, 12)}`,
    );
    if (reviewPlan.importerFiles.length > 0) {
      console.log(
        `[review] ${reviewPlan.importerFiles.length} file(s) import a deleted ` +
        `module: ${reviewPlan.importerFiles.join(", ")}`,
      );
    }
  }
  if (steps.length === 0) {
    console.log("[review] no applicable checks");
  }
  for (const entry of steps) {
    const exitCode = "concurrent" in entry
      ? await runConcurrentSteps(entry.concurrent)
      : await runStep(entry.step, entry.args);
    if ("step" in entry && entry.step === "prepare" && exitCode === 0) {
      restoreLocalAssets = true;
    }
    if (exitCode !== 0) {
      process.exitCode = exitCode;
      break;
    }
  }
} finally {
  try {
    if (restoreLocalAssets && shouldRestoreLocalAssets) {
      const restoreExitCode = await runStep(
        "restore-local-assets",
        [],
        { isolateLocalAssets: false },
      );
      if (restoreExitCode !== 0 && (process.exitCode ?? 0) === 0) {
        process.exitCode = restoreExitCode;
      }
    }
  } finally {
    releaseLock();
  }
}
