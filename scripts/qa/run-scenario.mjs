// Runs one browser QA scenario against the runner's own server:
//
//   node scripts/qa/run-scenario.mjs <scenario> --bead <id>
//     [--port <n>] [--prod [--minify]] [--cwd <checkout>] [--arg key=value]...
//     [--viewports desktop,mobile] [--timeout <seconds>]
//
// <scenario> is a path to a module, a tracked scenario name
// (scripts/qa/scenarios/<name>.mjs), or a bead-local one
// (artifacts/qa/<bead>/<name>.mjs in the primary checkout). The module's
// default export is one self-contained `async (qa) => result` function, or
// an array of them (steps): the runner sends each one's source, after the
// helper prelude (`scripts/qa/prelude.mjs`), to the Playwright MCP's
// `browser_run_code_unsafe`, so it may not read bindings from its own module.
// Each step is its own MCP call on the same page; a step reads what the
// previous one returned as `qa.carry`, and the last step's return is the
// result. The module may export `viewports` (`--viewports` overrides it): the
// steps run once per viewport, each pass with `qa.viewport` set, and the
// result is keyed by viewport when there is more than one. One MCP call's
// response is lost when the call outlasts about five minutes, so a longer
// walk is split into steps or viewports.
//
// The runner takes one of the repository's browser slots (README § Browser
// QA) and serves <checkout> (default: this one) with a strict port, the first
// free one in its slot's range from 5174 (never 5173): `scripts/dev.mjs`, or
// with --prod `vite build` into a temporary directory and `vite preview`. The production build skips
// minification unless --minify, so `__caps` names the real identifiers; the
// chunking and module evaluation order are the production bundle's. It opens its own MCP client, whose
// first root is the primary checkout, so captures land in
// artifacts/qa/<bead>/invocations/run-*/. Each viewport pass's persisted game log is saved there
// as <scenario>[-prod]-<viewport>.jsonl before the browser closes, also when the
// scenario throws. It prints the result as JSON, writes it beside the
// captures as <scenario>.result.json, stops its own process group, and exits
// non-zero when the scenario throws or any document's __caps is not empty.

import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { loadavg, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createBattleDriver, createQa } from "./prelude.mjs";
import { acquireBrowserLease, browserLeasePath, tryBrowserLock } from "./browser-lease.mjs";
import { spawnOwnedServer } from "./server-ownership.mjs";
import { BrowserOwnerClearError, BrowserOwnerRecord } from "./browser-owner-record.mjs";
import { parseProviderIdentity } from "./provider-identity.mjs";
import { QA_PORTS_PER_SLOT } from "./browser-qa-capacity.mjs";
import {
  connectPlaywrightMcp,
  listenerOwnedBy,
  McpToolResponseError,
  parseMcpResult,
  sleep,
  stopProcessTree,
} from "../screenshot-runtime.mjs";

const DEVELOPER_PORT = 5173;
const FIRST_QA_PORT = 5174;
const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const VIEWPORTS = /** @type {const} */ (["desktop", "mobile"]);

/**
 * One MCP call's response is lost when the call outlasts this (likely Node
 * fetch's 300 s body timeout in the MCP client), so the runner stops waiting
 * for a call a little after it; a walk this long is split into steps.
 */
const CALL_LIMIT_MS = 300_000;

/** A call longer than this is near the limit, and the runner warns. */
const LONG_CALL_MS = 240_000;

/**
 * @typedef {object} RunnerOptions
 * @property {string} scenario
 * @property {string} bead
 * @property {number | null} port
 * @property {boolean} prod
 * @property {boolean} minify
 * @property {string | null} cwd
 * @property {Record<string, string>} args
 * @property {import("./prelude.mjs").ViewportName[] | null} viewports `--viewports`, overriding the module's.
 * @property {number} timeoutS
 */

/**
 * @param {unknown} raw
 * @param {string} where
 * @returns {import("./prelude.mjs").ViewportName[]}
 */
function parseViewports(raw, where) {
  const names = typeof raw === "string" ? raw.split(",") : raw;
  if (!Array.isArray(names) || names.length === 0) throw new Error(`${where}: expected a list of ${VIEWPORTS.join(", ")}`);
  return names.map((name) => {
    const found = VIEWPORTS.find((viewport) => viewport === name);
    if (found === undefined) throw new Error(`${where}: unknown viewport ${String(name)}; one of ${VIEWPORTS.join(", ")}`);
    return found;
  });
}

/**
 * @param {string[]} argv
 * @returns {RunnerOptions}
 */
export function parseRunnerArgs(argv) {
  /** @type {RunnerOptions} */
  const options = { scenario: "", bead: "", port: null, prod: false, minify: false, cwd: null, args: {}, viewports: null, timeoutS: 900 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === "--bead") options.bead = value();
    else if (arg === "--port") options.port = Number(value());
    else if (arg === "--prod") options.prod = true;
    else if (arg === "--minify") options.minify = true;
    else if (arg === "--cwd") options.cwd = resolve(value());
    else if (arg === "--timeout") options.timeoutS = Number(value());
    else if (arg === "--viewports") options.viewports = parseViewports(value(), "--viewports");
    else if (arg === "--arg") {
      const pair = value();
      const split = pair.indexOf("=");
      if (split < 1) throw new Error(`--arg expects key=value, got ${pair}`);
      options.args[pair.slice(0, split)] = pair.slice(split + 1);
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else if (options.scenario === "") options.scenario = arg;
    else throw new Error(`unexpected argument ${arg}`);
  }
  if (options.scenario === "") throw new Error("missing <scenario>");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.bead)) {
    throw new Error("--bead <id> is required (the capture directory's name)");
  }
  if (options.port !== null && (!Number.isInteger(options.port) || options.port < FIRST_QA_PORT)) {
    throw new Error(`--port must be an integer of at least ${String(FIRST_QA_PORT)}; ${String(DEVELOPER_PORT)} is the developer's`);
  }
  if (options.minify && !options.prod) throw new Error("--minify applies only to --prod");
  if (!(options.timeoutS > 0)) throw new Error("--timeout must be a positive number of seconds");
  return options;
}

/**
 * @param {string} scenario
 * @param {{ primaryCheckout: string, bead: string }} where
 * @returns {string}
 */
export function resolveScenarioPath(scenario, { primaryCheckout, bead }) {
  const candidates = [
    resolve(scenario),
    join(repoRoot, "scripts", "qa", "scenarios", `${scenario}.mjs`),
    join(primaryCheckout, "artifacts", "qa", bead, `${scenario}.mjs`),
  ];
  const found = candidates.find((path) => path.endsWith(".mjs") && existsSync(path));
  if (found === undefined) {
    throw new Error(`no scenario ${scenario}; looked for ${candidates.join(", ")}`);
  }
  return found;
}

/**
 * The `browser_run_code_unsafe` source: the prelude (`createQa` and the
 * battle driver it builds), the scenario, and the call that returns the
 * prelude's report.
 *
 * @param {string} scenarioSource
 * @param {import("./prelude.mjs").QaConfig} config
 * @returns {string}
 */
export function buildScenarioCode(scenarioSource, config) {
  return `async (page) => {
  const createQa = ${createQa.toString()};
  const createBattleDriver = ${createBattleDriver.toString()};
  const scenario = ${scenarioSource};
  const qa = await createQa(page, ${JSON.stringify(config)});
  let result = null;
  let error = null;
  try {
    result = (await scenario(qa)) ?? null;
  } catch (thrown) {
    error = thrown instanceof Error ? String(thrown.stack ?? thrown) : String(thrown);
  }
  return await qa.finish(result, error);
}`;
}

/**
 * A scenario module: its steps' sources and the viewports it runs at.
 *
 * @typedef {{ steps: string[], viewports: import("./prelude.mjs").ViewportName[] }} ScenarioPlan
 */

/**
 * @param {string} path
 * @returns {Promise<ScenarioPlan>}
 */
async function loadScenario(path) {
  /** @type {unknown} */
  const loaded = await import(pathToFileURL(path).href);
  const module = typeof loaded === "object" && loaded !== null ? /** @type {Record<string, unknown>} */ (loaded) : {};
  const entry = module.default;
  const steps = Array.isArray(entry) ? /** @type {unknown[]} */ (entry) : [entry];
  if (steps.length === 0 || steps.some((step) => typeof step !== "function")) {
    throw new Error(`${path} default-exports neither a function nor a non-empty array of functions`);
  }
  return {
    steps: steps.map(String),
    viewports: module.viewports === undefined ? ["desktop"] : parseViewports(module.viewports, `${path} viewports`),
  };
}

/**
 * A bead's capture directory, `artifacts/qa/<bead>/` of the primary checkout.
 *
 * @param {string} bead
 */
export function qaCaptureDir(bead) {
  return join(primaryCheckoutOf(repoRoot), "artifacts", "qa", bead);
}

/** @returns {string} */
function primaryCheckoutOf(/** @type {string} */ checkout) {
  const commonDir = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: checkout, encoding: "utf8" },
  ).trim();
  return dirname(commonDir);
}

/**
 * @param {number} port
 * @returns {Promise<boolean>}
 */
async function isPortFree(port) {
  for (const host of ["127.0.0.1", "::1"]) {
    const answered = await new Promise((/** @type {(value: boolean) => void} */ done) => {
      const socket = createConnection({ port, host });
      socket.once("connect", () => {
        socket.destroy();
        done(true);
      });
      socket.once("error", () => done(false));
    });
    if (answered) return false;
  }
  return new Promise((/** @type {(value: boolean) => void} */ done) => {
    const server = createServer();
    server.once("error", () => done(false));
    server.listen({ port, host: "127.0.0.1" }, () => server.close(() => done(true)));
  });
}

/**
 * The first free port in a browser slot's range. Slot holders exclude each
 * other, so two holders never pick the same port.
 *
 * @param {number} slot
 * @returns {Promise<number>}
 */
async function findFreePort(slot) {
  const first = FIRST_QA_PORT + slot * QA_PORTS_PER_SLOT;
  for (let port = first; port < first + QA_PORTS_PER_SLOT; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`no free port in browser slot ${String(slot)}'s range from ${String(first)}`);
}

/**
 * Spawns in its own process group, so stopping it stops its whole tree.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, logFd: number }} options
 */
function spawnLogged(command, args, { cwd, logFd }) {
  return spawn(command, args, {
    cwd,
    env: { ...process.env, PATH: `${join(cwd, "node_modules", ".bin")}:${process.env.PATH ?? ""}` },
    stdio: ["ignore", logFd, logFd],
    detached: true,
  });
}

/**
 * @param {import("node:child_process").ChildProcess} child
 * @returns {Promise<number | null>}
 */
function exitOf(child) {
  return new Promise((done, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) done(child.exitCode);
    else {
      child.once("error", reject);
      child.once("exit", (code) => done(code));
    }
  });
}

/**
 * @param {string} baseUrl
 * @param {import("node:child_process").ChildProcess} child
 * @param {number} timeoutMs
 * @param {AbortSignal} signal
 */
async function waitUntilServing(baseUrl, child, timeoutMs, signal) {
  const deadline = Date.now() + timeoutMs;
  let failure = /** @type {Error | null} */ (null);
  const failed = (/** @type {Error} */ error) => { failure = error; };
  child.once("error", failed);
  try {
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      if (failure !== null) throw failure;
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`server exited with ${String(child.exitCode)} before serving ${baseUrl}`);
      }
      try {
        const response = await fetch(baseUrl, { signal });
        if (response.status < 500) return;
      } catch {
        // Still starting.
      }
      await sleep(300);
    }
    throw new Error(`server did not serve ${baseUrl} within ${String(timeoutMs / 1000)} s`);
  } finally {
    child.removeListener("error", failed);
  }
}

/** Error formatting is subordinate to retaining the actual cause.
 * @param {unknown} error
 */
function describeFailure(error) {
  try { return String(error); } catch { return "unprintable cleanup cause"; }
}

/** @param {string} message */
export function say(message) {
  process.stderr.write(`[qa] ${message}\n`);
}

/**
 * @typedef {object} QaSession
 * @property {number} port
 * @property {number | null} serverPid
 * @property {string} captureDir
 * @property {string} invocation
 * @property {string} leasePath The repository's browser admission path (`browserLeasePath`).
 * @property {number} slot The browser slot the session holds until `close()` settles.
 * @property {string} ownerPath The slot's ownership record.
 * @property {Record<string, number>} wallMs Browser lease wait, build, and serve times.
 * @property {(scenarioSource: string, args: Record<string, string>, timeoutMs: number, call?: QaCall) => Promise<import("./prelude.mjs").QaResult>} run
 *   Runs one scenario function's source with the helper prelude on the session's server.
 * @property {(plan: ScenarioPlan, args: Record<string, string>, timeoutMs: number, options?: { gameLogName?: string }) => Promise<PlanResult>} runPlan
 *   Runs every step of a scenario at each of its viewports, one MCP call
 *   each, within `timeoutMs` in all; stops at the first error. With
 *   `gameLogName`, saves each pass's game log (`runScenarioPlan`).
 * @property {() => Promise<void>} close Closes the MCP client and stops the server's process group.
 * @property {() => boolean} closed Whether cleanup started or provider completion
 *   is uncertain, making the session non-runnable.
 */

/**
 * Which call of a scenario run this is (`QaConfig`'s run fields).
 *
 * @typedef {{ viewport: import("./prelude.mjs").ViewportName, step: number, steps: number, carry: unknown, exportGameLog?: boolean }} QaCall
 */

/**
 * One viewport pass's saved game log: the JSONL file and its row count, or
 * (`path: null`) why the pass had none.
 *
 * @typedef {{ viewport: string, path: string | null, gameId: string | null, selectedBy: "url" | "latest" | null, rows: number, reason: string | null }} SavedGameLog
 */

/**
 * A scenario run's merged report. `result` is the last step's return, keyed
 * by viewport when there is more than one; log lines carry `at`
 * (`<viewport>#<step>`) when the run made more than one call.
 *
 * @typedef {Omit<import("./prelude.mjs").QaResult, "gameLog"> & { calls: Array<{ viewport: string, step: number, ms: number }>, gameLogs: SavedGameLog[] }} PlanResult
 */

/** A scenario that only reports, for exporting the game log after a failed call. */
const EXPORT_ONLY_SOURCE = "async () => null";

/**
 * Runs every step of `plan` at each of its viewports through `run`, one call
 * each, within `timeoutMs` in all; stops at the first error.
 *
 * With `gameLogName`, each viewport pass's last call (or the call that
 * failed) reads the current game's persisted log in the page, and the log is
 * written to `<captureDir>/<gameLogName>-<viewport>.jsonl` before the next
 * call, so it is saved before the session closes the browser, also when the
 * scenario throws. When a call itself fails, one export-only call follows
 * while the session is still runnable. A pass with no game writes no file
 * and records why.
 *
 * @param {QaSession["run"]} run
 * @param {ScenarioPlan} plan
 * @param {Record<string, string>} args
 * @param {number} timeoutMs
 * @param {{ captureDir: string, gameLogName?: string, runnable: () => boolean }} options
 * @returns {Promise<PlanResult>}
 */
export async function runScenarioPlan(run, plan, args, timeoutMs, { captureDir, gameLogName, runnable }) {
  const deadline = Date.now() + timeoutMs;
  const many = plan.viewports.length * plan.steps.length > 1;
  const exportGameLog = gameLogName !== undefined;
  /** @type {PlanResult} */
  const merged = { result: null, error: null, log: [], captures: [], caps: [], traces: [], calls: [], gameLogs: [] };
  /** @type {Record<string, unknown>} */
  const byViewport = {};
  const none = (/** @type {string} */ reason) => ({ gameId: null, selectedBy: null, lines: [], reason });
  const save = (/** @type {string} */ viewport, /** @type {import("./prelude.mjs").GameLogRead} */ gameLog) => {
    if (gameLogName === undefined) return;
    const path = join(captureDir, `${gameLogName}-${viewport}.jsonl`);
    if (gameLog.gameId === null) {
      // A file left by an earlier run would pass for this one's.
      rmSync(path, { force: true });
      merged.gameLogs.push({ viewport, path: null, gameId: null, selectedBy: null, rows: 0, reason: gameLog.reason });
      say(`${viewport}: no game log (${String(gameLog.reason)})`);
      return;
    }
    writeFileSync(path, gameLog.lines.map((line) => `${line}\n`).join(""));
    merged.gameLogs.push({ viewport, path, gameId: gameLog.gameId, selectedBy: gameLog.selectedBy, rows: gameLog.lines.length, reason: gameLog.reason });
    say(`${viewport}: game ${gameLog.gameId} log, ${String(gameLog.lines.length)} rows, at ${path}`);
  };
  // After a call failed without a report, the page still holds its game.
  const recover = async (/** @type {import("./prelude.mjs").ViewportName} */ viewport) => {
    if (!exportGameLog) return;
    if (!runnable()) {
      save(viewport, none("the call failed and the session cannot run another to export the log"));
      return;
    }
    try {
      const report = await run(EXPORT_ONLY_SOURCE, args, 30_000,
        { viewport, step: plan.steps.length - 1, steps: plan.steps.length, carry: null, exportGameLog });
      save(viewport, report.gameLog ?? none("the export call returned no log"));
    } catch (error) {
      save(viewport, none(`the export call failed: ${String(error)}`));
    }
  };
  for (const viewport of plan.viewports) {
    /** @type {unknown} */
    let carry = null;
    for (const [step, source] of plan.steps.entries()) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        merged.error = `timed out before ${viewport} step ${String(step)}`;
        if (step > 0) await recover(viewport);
        return merged;
      }
      const started = Date.now();
      /** @type {import("./prelude.mjs").QaResult} */
      let report;
      try {
        report = await run(source, args, Math.min(remaining, CALL_LIMIT_MS + 15_000), { viewport, step, steps: plan.steps.length, carry, exportGameLog });
      } catch (error) {
        await recover(viewport);
        if (Date.now() - started < CALL_LIMIT_MS) throw error;
        merged.error = `${viewport} step ${String(step)} ran past one MCP call's ${String(CALL_LIMIT_MS / 1000)} s limit and its response was lost; split the scenario into steps (README § Scenario runner): ${String(error)}`;
        return merged;
      }
      const ms = Date.now() - started;
      merged.calls.push({ viewport, step, ms });
      if (ms > LONG_CALL_MS) say(`${viewport} step ${String(step)} took ${String(Math.round(ms / 1000))} s in one MCP call; split it into steps before it nears five minutes`);
      const at = `${viewport}#${String(step)}`;
      merged.log.push(...report.log.map((line) => (many ? { ...line, at } : line)));
      merged.captures.push(...report.captures);
      // A document a pass ends on is recorded again when the next pass navigates away from it.
      const seen = new Set(merged.caps.map((entry) => JSON.stringify(entry)));
      merged.caps.push(...report.caps.filter((entry) => !seen.has(JSON.stringify(entry))));
      merged.traces.push(...report.traces);
      if (report.gameLog !== undefined) save(viewport, report.gameLog);
      carry = report.result;
      if (report.error !== null) {
        merged.error = many ? `${at}: ${report.error}` : report.error;
        byViewport[viewport] = carry;
        merged.result = plan.viewports.length > 1 ? byViewport : carry;
        return merged;
      }
    }
    byViewport[viewport] = carry;
  }
  merged.result = plan.viewports.length > 1 ? byViewport : byViewport[plan.viewports[0] ?? "desktop"] ?? null;
  return merged;
}

/** A new invocation namespace, beneath the bead root used by legacy runners.
 * @param {string} bead
 * @param {string} [prefix]
 */
export function qaInvocationDir(bead, prefix = "run") {
  const root = join(qaCaptureDir(bead), "invocations");
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, `${prefix}-`));
}

/**
 * Serves `options.cwd` (default: this checkout) on the runner's port and
 * opens its MCP client, for one or more scenario runs: the runner's own
 * `main`, and tools built on it such as the card sweep. Stops everything on
 * `close()`, SIGINT, or SIGTERM.
 *
 * Each session owns an invocation directory below the bead's capture root,
 * so same-label sessions and legacy bead-root writers have disjoint evidence.
 * It holds a native lock on its invocation's server log until cleanup settles.
 * Sessions serving the same
 * checkout start their servers one at a time, under a kernel lock keyed by
 * the checkout, because workspace preparation is not safe to run twice at
 * once in one checkout.
 *
 * @param {{ bead: string, label: string, port: number | null, prod: boolean, minify: boolean, cwd: string | null, invocationDir?: string }} options
 * @returns {Promise<QaSession>}
 */
export async function openQaSession(options) {
  const checkout = options.cwd ?? repoRoot;
  const primaryCheckout = primaryCheckoutOf(repoRoot);
  const captureDir = options.invocationDir === undefined ? qaInvocationDir(options.bead) : mkdtempSync(join(options.invocationDir, "run-"));
  const serverLog = join(captureDir, `${options.label}.server.log`);
  mkdirSync(dirname(serverLog), { recursive: true });
  const controller = new AbortController();
  const { signal } = controller;
  let port = options.port ?? FIRST_QA_PORT;
  let logFd = /** @type {number | null} */ (null);
  let outDir = /** @type {string | null} */ (null);
  const leasePath = browserLeasePath(primaryCheckout);
  let ownerPath = "";
  let record = /** @type {BrowserOwnerRecord | null} */ (null);
  let owner = /** @type {Record<string, string | number | boolean> | null} */ (null);
  const retainOwner = (/** @type {string} */ providerState) => {
    if (record === null || owner === null) return;
    owner.providerState = providerState;
    record.publish(owner);
  };
  let evidence = /** @type {Awaited<ReturnType<typeof tryBrowserLock>>} */ (null);
  let starting = /** @type {Awaited<ReturnType<typeof tryBrowserLock>>} */ (null);
  const startPath = join(primaryCheckout, "artifacts", "qa", `.serve-${createHash("sha256").update(checkout).digest("hex").slice(0, 16)}.lock`);
  let lease = /** @type {import("./browser-lease.mjs").BrowserLease | null} */ (null);
  let builder = /** @type {import("node:child_process").ChildProcess | null} */ (null);
  let ownedServer = /** @type {Awaited<ReturnType<typeof spawnOwnedServer>> | null} */ (null);
  let server = /** @type {import("node:child_process").ChildProcess | null} */ (null);
  let mcp = /** @type {Awaited<ReturnType<typeof connectPlaywrightMcp>> | null} */ (null);
  let browserAdmitted = false;
  let startupUnconfirmed = "startup-unconfirmed";
  /** @type {Record<string, number>} */
  const wallMs = {};
  const activeCalls = /** @type {Set<Promise<void>>} */ (new Set());
  let uncertainCall = false;
  let startup = Promise.resolve();
  let cleanup = /** @type {Promise<void> | null} */ (null);
  const handlers = /** @type {Map<NodeJS.Signals, () => void>} */ (new Map());
  const interruptionFailures = /** @type {Array<{ stage: string, error: unknown }>} */ ([]);
  const close = () => {
    cleanup ??= (async () => {
      // A startup connection may finish after interruption. Drain it before
      // closing its browser and releasing the repository lease.
      await startup.catch(() => {});
      let closeUnconfirmed = false;
      const failures = interruptionFailures;
      /** Attempt every owned cleanup stage; rejection does not replace earlier causes.
       * @param {string} stage @param {() => unknown | Promise<unknown>} operation
       */
      const attempt = async (stage, operation) => {
        try { await operation(); } catch (error) { failures.push({ stage, error }); }
      };
      try {
        try {
          // Closing the page interrupts pending unsafe execution. Join its
          // local RPC only afterwards; transport rejection cannot certify
          // whether the remote invocation completed.
          if (mcp !== null && !browserAdmitted) {
            await mcp.disconnect();
            throw new Error("browser identity admission did not complete; no browser tool was sent");
          }
          if (mcp !== null) await mcp.close(async (browserCloseConfirmed) => {
            await Promise.all(activeCalls);
            if (browserCloseConfirmed && !uncertainCall && owner !== null) {
              owner.mcpExecutionCompleted = true;
              retainOwner("execution-completed");
            }
          });
        } catch (error) {
          closeUnconfirmed = true;
          throw error;
        } finally {
          await Promise.all(activeCalls);
        }
        if (uncertainCall) throw new Error("browser RPC transport rejected; provider completion is unconfirmed");
        // A settled connection failure sent no browser command. Otherwise
        // only a confirmed browser_close permits another cooperating owner.
        record?.clear();
      } catch (error) {
        let failure = error;
        if (!(error instanceof BrowserOwnerClearError)) {
          try {
            retainOwner(mcp !== null && !browserAdmitted ? startupUnconfirmed :
              uncertainCall ? (closeUnconfirmed ? "call-and-close-unconfirmed" : "call-unconfirmed") : "close-unconfirmed");
          } catch (retentionError) {
            failure = new AggregateError([error, retentionError], `browser cleanup and ownership persistence failed: ${describeFailure(error)}; ${describeFailure(retentionError)}`);
          }
        }
        failures.push({ stage: "browser completion and ownership", error: failure });
        await attempt("browser reconciliation diagnostic", () => say(error instanceof BrowserOwnerClearError
          ? `browser owner clear ${error.phase} failed at ${ownerPath}; ${error.unlinked ? "record unlinked, deletion durability unconfirmed" : "this cleanup did not unlink"}; no republication: ${describeFailure(failure)}`
          : `browser provider completion or ownership persistence requires reconciliation at ${ownerPath}: ${describeFailure(failure)}`));
      }
      await attempt("builder cleanup", () => stopProcessTree(builder));
      await attempt("owned server cleanup", () => ownedServer?.stop());
      await attempt("server log descriptor", () => {
        if (logFd !== null) { closeSync(logFd); logFd = null; }
      });
      await attempt("build directory cleanup", () => {
        if (outDir !== null) { rmSync(outDir, { recursive: true, force: true }); outDir = null; }
      });
      await attempt("server port diagnostic", async () => {
        if (server !== null) {
          const free = await isPortFree(port);
          say(`runtime: server process group ${String(server.pid)} on port ${String(port)} cleanup attempted; port ${free ? "free" : "STILL IN USE"}`);
        }
      });
      for (const [name, handler] of handlers) {
        await attempt(`${name} handler removal`, () => process.removeListener(name, handler));
      }
      await attempt("server startup lock release", () => starting?.release());
      await attempt("browser lease release", () => lease?.release());
      await attempt("evidence lock release", () => evidence?.release());
      if (failures.length === 1) throw failures[0]?.error;
      if (failures.length > 1) throw new AggregateError(failures.map(({ error }) => error),
        `QA cleanup failed for ${captureDir}; owner ${ownerPath}: ${failures.map(({ stage, error }) => `${stage}: ${describeFailure(error)}`).join("; ")}`);
    })();
    return cleanup;
  };
  for (const name of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
    const handler = () => {
      controller.abort();
      try { say(`${name}: stopping`); }
      catch (error) { interruptionFailures.push({ stage: `${name} diagnostic`, error }); }
      // Abort before diagnostics, settle interruption, and always join cached
      // cleanup. Reporting errors cannot prevent resource and lease release.
      void (async () => {
        try {
          const stages = ["builder interruption", "server interruption"];
          const interrupted = await Promise.allSettled([stopProcessTree(builder), ownedServer?.stop()]);
          for (const [index, result] of interrupted.entries()) {
            if (result.status !== "rejected") continue;
            interruptionFailures.push({ stage: stages[index] ?? "startup interruption", error: result.reason });
            try { say(`server interruption requires reconciliation: ${describeFailure(result.reason)}`); }
            catch (diagnosticError) { interruptionFailures.push({ stage: "server interruption diagnostic", error: diagnosticError }); }
          }
          try { await close(); }
          catch (error) {
            try { say(`signal cleanup failed: ${describeFailure(error)}`); } catch { /* Cleanup is already settled. */ }
          }
        } finally { process.exit(name === "SIGINT" ? 130 : 143); }
      })();
    };
    handlers.set(name, handler);
    process.once(name, handler);
  }

  startup = (async () => {
    evidence = await tryBrowserLock(serverLog, signal);
    if (evidence === null) throw new Error(`another live QA run owns ${serverLog} and the evidence its label names`);
    const waitStart = Date.now();
    lease = await acquireBrowserLease(leasePath, { signal, onWait: () => say(`waiting for a browser slot (${leasePath})`) });
    wallMs.browserLeaseWait = Date.now() - waitStart;
    ownerPath = lease.ownerPath;
    say(`holding browser slot ${String(lease.slot)} (${lease.path})`);
    signal.throwIfAborted();
    const firstPort = FIRST_QA_PORT + lease.slot * QA_PORTS_PER_SLOT;
    const requestedFits = options.port !== null && options.port >= firstPort && options.port < firstPort + QA_PORTS_PER_SLOT;
    port = requestedFits ? Number(options.port) : await findFreePort(lease.slot);
    if (options.port !== null && !requestedFits) say(`requested port ${String(options.port)} is outside browser slot ${String(lease.slot)}; selected port ${String(port)}`);
    if (!(await isPortFree(port))) throw new Error(`port ${String(port)} is in use`);
    signal.throwIfAborted();
    const baseUrl = `http://localhost:${String(port)}`;
    logFd = openSync(serverLog, "w");
    outDir = options.prod ? mkdtempSync(join(tmpdir(), "dreamtides-qa-")) : null;
    say(`${options.label} for ${options.bead}: serving ${checkout} ${options.prod ? "(production build)" : "(dev)"} on port ${String(port)}; server log ${serverLog}`);
    const serveStart = Date.now();
    while ((starting = await tryBrowserLock(startPath, signal)) === null) {
      if (wallMs.serveWait === undefined) say(`waiting for another run's server startup in ${checkout}`);
      wallMs.serveWait = Date.now() - serveStart;
      await delay(300, undefined, { signal });
    }
    if (outDir !== null) {
      for (const [command, args] of /** @type {Array<[string, string[]]>} */ ([
        [process.execPath, ["scripts/prepare-workspace.mjs"]],
        ["vite", ["build", "--outDir", outDir, "--emptyOutDir", ...(options.minify ? [] : ["--minify", "false"])]],
      ])) {
        signal.throwIfAborted();
        builder = spawnLogged(command, args, { cwd: checkout, logFd });
        const code = await exitOf(builder);
        if (code !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${String(code)}; see ${serverLog}`);
      }
      wallMs.build = Date.now() - serveStart;
      signal.throwIfAborted();
      ownedServer = await spawnOwnedServer({ slotPath: lease.path, command: "vite", args: ["preview", "--outDir", outDir, "--port", String(port), "--strictPort"], cwd: checkout, logFd, port });
      server = ownedServer.child;
    } else {
      ownedServer = await spawnOwnedServer({ slotPath: lease.path, command: process.execPath, args: ["scripts/dev.mjs", "--port", String(port), "--strictPort"], cwd: checkout, logFd, port });
      server = ownedServer.child;
    }
    await waitUntilServing(baseUrl, server, 120_000, signal);
    if (!listenerOwnedBy(port, Number(server.pid))) throw new Error(`port ${String(port)} is answered by a process outside server ${String(server.pid)}`);
    await starting.release();
    wallMs.serve = Date.now() - serveStart;
    signal.throwIfAborted();
    say(`server pid ${String(server.pid)} (process group) serving ${baseUrl}`);
    owner = { token: randomUUID(), pid: process.pid, bead: options.bead, label: options.label, checkout, slot: lease.slot, port, startedAt: new Date().toISOString(), providerState: "startup-unconfirmed" };
    record = new BrowserOwnerRecord(ownerPath);
    record.publish(owner);
    mcp = await connectPlaywrightMcp({
      name: `qa-${options.label}-${String(process.pid)}`,
      roots: [...new Set([primaryCheckout, repoRoot, checkout])],
    });
    const identity = parseProviderIdentity(mcp.sessionId, mcp.url, mcp.protocolVersion);
    if (identity === null) {
      startupUnconfirmed = "metadata-unverified";
      throw new Error("unsupported MCP session metadata; stateful transport identity is required before browser tools");
    }
    owner.mcpSessionId = identity.sessionId;
    owner.mcpUrl = identity.url;
    owner.mcpProtocolVersion = identity.protocolVersion;
    retainOwner("active");
    browserAdmitted = true;
    signal.throwIfAborted();
  })();
  try {
    await startup;
  } catch (error) {
    try { await close(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `QA startup failed: ${describeFailure(error)}; cleanup: ${describeFailure(cleanupError)}`);
    }
    throw error;
  }
  const baseUrl = `http://localhost:${String(port)}`;
  const client = /** @type {Awaited<ReturnType<typeof connectPlaywrightMcp>> | null} */ (mcp);
  const held = /** @type {import("./browser-lease.mjs").BrowserLease | null} */ (lease);
  if (client === null || held === null) {
    await close();
    throw new Error("QA startup did not create its MCP client");
  }
  /** @type {QaSession["run"]} */
  const run = async (scenarioSource, args, timeoutMs, call) => {
    if (cleanup !== null) throw new Error("QA session is closed");
    if (uncertainCall) throw new Error("QA session requires provider reconciliation");
    const code = buildScenarioCode(scenarioSource, { baseUrl, bead: options.bead, captureDir, prod: options.prod, args, timeoutMs: Math.min(timeoutMs, CALL_LIMIT_MS), ...call });
    const rpc = client.call("browser_run_code_unsafe", { code }, { timeoutMs });
    const settled = rpc.then(() => {}, (/** @type {unknown} */ error) => {
      if (!(error instanceof McpToolResponseError)) uncertainCall = true;
    });
    activeCalls.add(settled);
    void settled.finally(() => activeCalls.delete(settled));
    return /** @type {import("./prelude.mjs").QaResult} */ (parseMcpResult(await rpc));
  };
  return {
    port,
    serverPid: server?.pid ?? null,
    captureDir,
    invocation: basename(captureDir),
    leasePath,
    slot: held.slot,
    ownerPath,
    wallMs,
    run,
    runPlan: (plan, args, timeoutMs, options = {}) =>
      runScenarioPlan(run, plan, args, timeoutMs, { ...options, captureDir, runnable: () => cleanup === null && !uncertainCall }),
    close,
    closed: () => cleanup !== null || uncertainCall,
  };
}

async function main() {
  const options = parseRunnerArgs(process.argv.slice(2));
  const primaryCheckout = primaryCheckoutOf(repoRoot);
  const scenarioPath = resolveScenarioPath(options.scenario, { primaryCheckout, bead: options.bead });
  const scenarioName = basename(scenarioPath, ".mjs");
  const reportName = `${scenarioName}${options.prod ? "-prod" : ""}`;
  const plan = await loadScenario(scenarioPath);
  if (options.viewports !== null) plan.viewports = options.viewports;

  const startedAt = Date.now();
  const hostLoad = loadavg()[0];
  const session = await openQaSession({ ...options, label: reportName });
  try {
    const scenarioStart = Date.now();
    const report = await session.runPlan(plan, options.args, options.timeoutS * 1000, { gameLogName: reportName });
    const wallMs = { ...session.wallMs, scenario: Date.now() - scenarioStart, total: Date.now() - startedAt };
    const ok = report.error === null && report.caps.length === 0;
    const summary = {
      scenario: scenarioName,
      bead: options.bead,
      mode: options.prod ? "prod" : "dev",
      checkout: options.cwd ?? repoRoot,
      port: session.port,
      slot: session.slot,
      serverPid: session.serverPid,
      invocation: session.invocation,
      evidenceDir: session.captureDir,
      hostLoad,
      wallMs,
      ok,
      ...report,
    };
    const json = JSON.stringify(summary, null, 2);
    writeFileSync(join(session.captureDir, `${reportName}.result.json`), `${json}\n`);
    process.stdout.write(`${json}\n`);
    say(`${ok ? "PASS" : "FAIL"} ${scenarioName} in ${String(Math.round(wallMs.scenario / 100) / 10)} s (total ${String(Math.round(wallMs.total / 100) / 10)} s, load ${hostLoad.toFixed(2)})`);
    if (report.error !== null) say(`scenario error: ${report.error}`);
    for (const entry of report.caps) say(`__caps on ${entry.href}: ${JSON.stringify(entry.caps)}`);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await session.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((/** @type {unknown} */ error) => {
    say(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = process.exitCode || 2;
  });
}
