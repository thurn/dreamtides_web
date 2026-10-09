/**
 * Compares engine performance at a base commit (A) with this checkout (B,
 * uncommitted changes included) in interleaved rounds: A B A B ….
 *
 *   npm run perf:ab -- <base-oid> [--workload fuzz|bench|fuzz,bench] [--rounds 5]
 *     [--args "<workload arguments>"] [--snapshot-parent <dir>]
 *
 * - The base is a detached `git worktree add --detach` snapshot in a fresh
 *   directory under `--snapshot-parent` (default: the OS temporary directory),
 *   never inside this checkout. It shares this checkout's `node_modules`
 *   through a symlink when both have the same `package-lock.json`, and runs
 *   `npm ci` otherwise. The snapshot is removed (`git worktree remove
 *   --force`) when the run ends, fails, or is interrupted.
 * - Workloads, run as `node --import tsx <script>` in each tree: `fuzz` is
 *   scripts/fuzz-engine.ts (default `--games 50`), `bench` is
 *   scripts/bench-engine.ts (default `--games 30 --step-games 5
 *   --interactive-games 5`). `--args` replaces the default arguments.
 * - One short untimed warm-up run per tree precedes the rounds.
 * - Each round records wall time, CPU time (user plus system, from the child's
 *   own `process.resourceUsage()` at exit, scripts/lib/report-resource-usage.mjs),
 *   and the 1-minute load average when the round starts. The summary prints
 *   each side's median, range, and spread ((max - min) / median), and B's
 *   median change against A.
 *
 * Nothing here is gated; timings are evidence for docs/plan measurement files.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORTER = join(ROOT, "scripts/lib/report-resource-usage.mjs");

interface Workload {
  readonly script: string;
  readonly args: string;
  /** A short untimed run in each tree first, so neither side's timed rounds pay for tsx's first transforms. */
  readonly warmup: string;
  /** The line of the workload's output echoed after each round. */
  readonly summary: RegExp;
}

const WORKLOADS: Record<string, Workload> = {
  fuzz: { script: "scripts/fuzz-engine.ts", args: "--games 50", warmup: "--games 1", summary: /^fuzz:engine / },
  bench: {
    script: "scripts/bench-engine.ts",
    args: "--games 30 --step-games 5 --interactive-games 5",
    warmup: "--games 1 --step-games 0 --interactive-games 0",
    summary: /^battles: /,
  },
};

interface Round {
  readonly wallS: number;
  readonly cpuS: number;
  readonly load: number;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function describe(values: readonly number[]): string {
  const center = median(values);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = center > 0 ? ((high - low) / center) * 100 : 0;
  return `median ${center.toFixed(2)} s (${low.toFixed(2)}–${high.toFixed(2)}, spread ${spread.toFixed(1)}%)`;
}

function change(base: readonly number[], head: readonly number[]): string {
  const delta = ((median(head) - median(base)) / median(base)) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

let snapshot: string | null = null;
let running: ChildProcess | null = null;

function cleanUp(): void {
  if (snapshot === null) return;
  const path = snapshot;
  snapshot = null;
  // Unlink a shared node_modules symlink first so nothing can follow it.
  rmSync(join(path, "node_modules"), { force: true });
  try {
    git("worktree", "remove", "--force", path);
  } catch (error) {
    console.error(`perf:ab: git worktree remove failed (${String(error)}); removing ${path}`);
    rmSync(path, { recursive: true, force: true });
    git("worktree", "prune");
  }
  console.log(`perf:ab: removed snapshot ${path}`);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    running?.kill(signal);
    cleanUp();
    process.exit(130);
  });
}

function createSnapshot(base: string, parent: string): string {
  const path = mkdtempSync(join(parent, "dreamtides-perf-ab-"));
  snapshot = path;
  git("worktree", "add", "--detach", path, base);
  const sameLock = git("rev-parse", `${base}:package-lock.json`) === git("hash-object", "package-lock.json");
  if (sameLock) {
    symlinkSync(join(ROOT, "node_modules"), join(path, "node_modules"), "dir");
  } else {
    console.log("perf:ab: package-lock.json differs from the base; running npm ci in the snapshot");
    execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: path, stdio: "inherit" });
  }
  return path;
}

function runRound(tree: string, workload: Workload, args: readonly string[], echo = true): Promise<Round> {
  const report = join(snapshot ?? tmpdir(), `.perf-ab-${String(process.pid)}.json`);
  rmSync(report, { force: true });
  const load = loadavg()[0] ?? 0;
  const started = performance.now();
  return new Promise((resolveRound, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--import", REPORTER, workload.script, ...args], {
      cwd: tree,
      env: { ...process.env, PERF_AB_REPORT: report },
      stdio: ["ignore", "pipe", "pipe"],
    });
    running = child;
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      running = null;
      const wallS = (performance.now() - started) / 1000;
      if (code !== 0 || !existsSync(report)) {
        reject(new Error(`${workload.script} in ${tree} exited with ${String(code)}\n${stdout}${stderr}`));
        return;
      }
      const usage = JSON.parse(readFileSync(report, "utf8")) as NodeJS.ResourceUsage;
      rmSync(report, { force: true });
      const line = stdout.split("\n").find((entry) => workload.summary.test(entry));
      if (echo && line !== undefined) console.log(`    ${line}`);
      resolveRound({ wallS, cpuS: (usage.userCPUTime + usage.systemCPUTime) / 1e6, load });
    });
  });
}

async function main(): Promise<void> {
  const baseArgument = process.argv[2];
  if (baseArgument === undefined || baseArgument.startsWith("--")) {
    throw new Error('usage: npm run perf:ab -- <base-oid> [--workload fuzz|bench|fuzz,bench] [--rounds 5] [--args "..."] [--snapshot-parent <dir>]');
  }
  const base = git("rev-parse", "--verify", `${baseArgument}^{commit}`);
  const rounds = Number.parseInt(option("rounds") ?? "5", 10);
  const names = (option("workload") ?? "fuzz").split(",");
  const parent = resolve(option("snapshot-parent") ?? tmpdir());
  if (resolve(parent).startsWith(ROOT)) throw new Error(`--snapshot-parent must be outside ${ROOT}`);
  const workloads = names.map((name) => {
    const workload = WORKLOADS[name];
    if (workload === undefined) throw new Error(`unknown workload ${name}; expected ${Object.keys(WORKLOADS).join(", ")}`);
    return { name, workload };
  });

  const head = git("rev-parse", "HEAD");
  const dirty = git("status", "--porcelain", "--untracked-files=no") !== "";
  const tree = createSnapshot(base, parent);
  console.log(`perf:ab: A = base ${base.slice(0, 9)} (snapshot ${tree}); B = this checkout at ${head.slice(0, 9)}${dirty ? " plus uncommitted changes" : ""}`);
  for (const { name, workload } of workloads) {
    const args = (option("args") ?? workload.args).split(/\s+/).filter((entry) => entry !== "");
    console.log(`\n${name}: ${workload.script} ${args.join(" ")}, ${String(rounds)} rounds A B …`);
    const warmup = workload.warmup.split(" ");
    for (const side of [tree, ROOT]) await runRound(side, workload, warmup, false);
    const results: Record<"A" | "B", Round[]> = { A: [], B: [] };
    for (let round = 1; round <= rounds; round++) {
      for (const side of ["A", "B"] as const) {
        const result = await runRound(side === "A" ? tree : ROOT, workload, args);
        results[side].push(result);
        console.log(`  round ${String(round)} ${side}: wall ${result.wallS.toFixed(2)} s, CPU ${result.cpuS.toFixed(2)} s, load ${result.load.toFixed(2)}`);
      }
    }
    console.log(`\n${name} summary (${String(rounds)} rounds each):`);
    for (const side of ["A", "B"] as const) {
      const sideRounds = results[side];
      console.log(`  ${side} wall ${describe(sideRounds.map((r) => r.wallS))}`);
      console.log(`  ${side} CPU  ${describe(sideRounds.map((r) => r.cpuS))}`);
      console.log(`  ${side} load median ${median(sideRounds.map((r) => r.load)).toFixed(2)}`);
    }
    const wall = (side: "A" | "B") => results[side].map((r) => r.wallS);
    const cpu = (side: "A" | "B") => results[side].map((r) => r.cpuS);
    console.log(`  B vs A: wall ${change(wall("A"), wall("B"))}, CPU ${change(cpu("A"), cpu("B"))}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  cleanUp();
}
