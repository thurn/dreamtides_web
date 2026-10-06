import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Incremental typecheck state for `review.mjs`.
 *
 * The typecheck emits declarations only, so tsc's build info records each
 * module's exported signature and an edit that keeps a module's API rechecks
 * only that module. Every worktree shares the git common dir, so a fresh
 * worktree can seed its build info from the last passing local review. Build
 * info stores paths relative to itself and file versions as content hashes,
 * so a sibling worktree's seed only rechecks what differs. The exhaustive
 * tasks never read or write the shared copy, keeping the gate's typecheck
 * cold and hermetic.
 */

/**
 * @typedef {{
 *   buildInfo: string,
 *   declarations: string,
 *   sharedBuildInfo: string,
 *   nodeBuildInfo: string,
 * }} TypecheckStatePaths
 */

const EXHAUSTIVE_TASKS = new Set(["full", "lint-full", "test-full"]);

/**
 * Whether a review task may read and publish the shared build info.
 *
 * @param {string} task
 * @returns {boolean}
 */
export function sharesTypecheckState(task) {
  return !EXHAUSTIVE_TASKS.has(task);
}

/**
 * Local and shared locations of the typecheck state.
 *
 * @param {{ root: string, commonGitDir: string }} locations
 * @returns {TypecheckStatePaths}
 */
export function typecheckStatePaths({ root, commonGitDir }) {
  const cache = join(root, "node_modules", ".cache", "journey-review");
  return {
    buildInfo: join(cache, "tsconfig.tsbuildinfo"),
    declarations: join(cache, "declarations"),
    sharedBuildInfo: join(commonGitDir, "journey-review", "tsconfig.tsbuildinfo"),
    nodeBuildInfo: join(cache, "tsconfig.node.tsbuildinfo"),
  };
}

/**
 * Arguments for the declaration-only incremental tsc run.
 *
 * @param {{ tsc: string, paths: TypecheckStatePaths, extraArgs?: string[] }} options
 * @returns {string[]}
 */
export function typecheckArgs({ tsc, paths, extraArgs = [] }) {
  return [
    tsc,
    "--noEmit",
    "false",
    "--declaration",
    "--emitDeclarationOnly",
    "--outDir",
    paths.declarations,
    "--incremental",
    "--tsBuildInfoFile",
    paths.buildInfo,
    ...extraArgs,
  ];
}

/**
 * Arguments for the incremental tsc run over `tsconfig.node.json`, the build
 * configs and scripts/. That project emits nothing, and its build info stays
 * in the worktree.
 *
 * @param {{ tsc: string, paths: TypecheckStatePaths }} options
 * @returns {string[]}
 */
export function nodeTypecheckArgs({ tsc, paths }) {
  return [
    tsc,
    "-p",
    "tsconfig.node.json",
    "--incremental",
    "--tsBuildInfoFile",
    paths.nodeBuildInfo,
  ];
}

/**
 * Copies the shared build info in when the worktree has none of its own.
 *
 * @param {TypecheckStatePaths} paths
 * @returns {boolean}
 */
export function seedTypecheckState(paths) {
  if (existsSync(paths.buildInfo) || !existsSync(paths.sharedBuildInfo)) {
    return false;
  }
  mkdirSync(dirname(paths.buildInfo), { recursive: true });
  copyFileSync(paths.sharedBuildInfo, paths.buildInfo);
  return true;
}

/**
 * Atomically replaces the shared build info with this worktree's.
 *
 * @param {TypecheckStatePaths} paths
 * @param {number} [pid]
 * @returns {boolean}
 */
export function publishTypecheckState(paths, pid = process.pid) {
  if (!existsSync(paths.buildInfo)) return false;
  mkdirSync(dirname(paths.sharedBuildInfo), { recursive: true });
  const staged = `${paths.sharedBuildInfo}.${String(pid)}.tmp`;
  copyFileSync(paths.buildInfo, staged);
  renameSync(staged, paths.sharedBuildInfo);
  return true;
}
