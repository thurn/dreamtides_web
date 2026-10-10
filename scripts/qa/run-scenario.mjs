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
// The runner serves <checkout> (default: this one) on a free port of 5174 or
// higher (never 5173): `scripts/dev.mjs`, or with --prod `vite build` into a
// temporary directory and `vite preview`. The production build skips
// minification unless --minify, so `__caps` names the real identifiers; the
// chunking and module evaluation order are the production bundle's. It opens its own MCP client, whose
// first root is the primary checkout, so captures land in
// artifacts/qa/<bead>/. It prints the result as JSON, writes it beside the
// captures as <scenario>.result.json, stops its own process group, and exits
// non-zero when the scenario throws or any document's __caps is not empty.

import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { loadavg, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createQa } from "./prelude.mjs";
import {
  connectPlaywrightMcp,
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
 * The `browser_run_code_unsafe` source: the prelude, the scenario, and the
 * call that returns the prelude's report.
 *
 * @param {string} scenarioSource
 * @param {import("./prelude.mjs").QaConfig} config
 * @returns {string}
 */
export function buildScenarioCode(scenarioSource, config) {
  return `async (page) => {
  const createQa = ${createQa.toString()};
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

/** @returns {Promise<number>} */
async function findFreePort() {
  for (let port = FIRST_QA_PORT; port < FIRST_QA_PORT + 200; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error("no free port from 5174 upward");
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
  return new Promise((done) => {
    if (child.exitCode !== null) done(child.exitCode);
    else child.once("exit", (code) => done(code));
  });
}

/**
 * @param {string} baseUrl
 * @param {import("node:child_process").ChildProcess} child
 * @param {number} timeoutMs
 */
async function waitUntilServing(baseUrl, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited with ${String(child.exitCode)} before serving ${baseUrl}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) return;
    } catch {
      // Still starting.
    }
    await sleep(300);
  }
  throw new Error(`server did not serve ${baseUrl} within ${String(timeoutMs / 1000)} s`);
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
 * @property {Record<string, number>} wallMs Build and serve times.
 * @property {(scenarioSource: string, args: Record<string, string>, timeoutMs: number, call?: QaCall) => Promise<import("./prelude.mjs").QaResult>} run
 *   Runs one scenario function's source with the helper prelude on the session's server.
 * @property {(plan: ScenarioPlan, args: Record<string, string>, timeoutMs: number) => Promise<PlanResult>} runPlan
 *   Runs every step of a scenario at each of its viewports, one MCP call
 *   each, within `timeoutMs` in all; stops at the first error.
 * @property {() => Promise<void>} close Closes the MCP client and stops the server's process group.
 * @property {() => boolean} closed Whether the session has closed, as on SIGINT.
 */

/**
 * Which call of a scenario run this is (`QaConfig`'s run fields).
 *
 * @typedef {{ viewport: import("./prelude.mjs").ViewportName, step: number, steps: number, carry: unknown }} QaCall
 */

/**
 * A scenario run's merged report. `result` is the last step's return, keyed
 * by viewport when there is more than one; log lines carry `at`
 * (`<viewport>#<step>`) when the run made more than one call.
 *
 * @typedef {import("./prelude.mjs").QaResult & { calls: Array<{ viewport: string, step: number, ms: number }> }} PlanResult
 */

/**
 * Serves `options.cwd` (default: this checkout) on the runner's port and
 * opens its MCP client, for one or more scenario runs: the runner's own
 * `main`, and tools built on it such as the card sweep. Stops everything on
 * `close()`, SIGINT, or SIGTERM.
 *
 * @param {{ bead: string, label: string, port: number | null, prod: boolean, minify: boolean, cwd: string | null }} options
 * @returns {Promise<QaSession>}
 */
export async function openQaSession(options) {
  const checkout = options.cwd ?? repoRoot;
  const primaryCheckout = primaryCheckoutOf(repoRoot);
  const captureDir = join(primaryCheckout, "artifacts", "qa", options.bead);
  mkdirSync(captureDir, { recursive: true });
  const port = options.port ?? (await findFreePort());
  if (!(await isPortFree(port))) throw new Error(`port ${String(port)} is in use`);
  const baseUrl = `http://localhost:${String(port)}`;
  const serverLog = join(captureDir, `${options.label}.server.log`);
  const logFd = openSync(serverLog, "w");
  const outDir = options.prod ? mkdtempSync(join(tmpdir(), "dreamtides-qa-")) : null;
  /** @type {import("node:child_process").ChildProcess | null} */
  let builder = null;
  /** @type {import("node:child_process").ChildProcess | null} */
  let server = null;
  /** @type {Awaited<ReturnType<typeof connectPlaywrightMcp>> | null} */
  let mcp = null;
  /** @type {Record<string, number>} */
  const wallMs = {};

  let cleaned = false;
  const close = async () => {
    if (cleaned) return;
    cleaned = true;
    if (mcp !== null) {
      await mcp.close().catch((/** @type {unknown} */ error) => {
        say(`closing the MCP client failed: ${String(error)}`);
      });
    }
    await stopProcessTree(builder);
    await stopProcessTree(server);
    closeSync(logFd);
    if (outDir !== null) rmSync(outDir, { recursive: true, force: true });
    if (server !== null) {
      const free = await isPortFree(port);
      say(`runtime: server process group ${String(server.pid)} on port ${String(port)} stopped; port ${free ? "free" : "STILL IN USE"}`);
    }
  };
  for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
    process.once(signal, () => {
      say(`${signal}: stopping`);
      void close().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
    });
  }

  try {
    say(`${options.label} for ${options.bead}: serving ${checkout} ${options.prod ? "(production build)" : "(dev)"} on port ${String(port)}; server log ${serverLog}`);
    const serveStart = Date.now();
    if (outDir !== null) {
      for (const [command, args] of /** @type {Array<[string, string[]]>} */ ([
        [process.execPath, ["scripts/prepare-workspace.mjs"]],
        ["vite", ["build", "--outDir", outDir, "--emptyOutDir", ...(options.minify ? [] : ["--minify", "false"])]],
      ])) {
        builder = spawnLogged(command, args, { cwd: checkout, logFd });
        const code = await exitOf(builder);
        if (code !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${String(code)}; see ${serverLog}`);
      }
      wallMs.build = Date.now() - serveStart;
      server = spawnLogged("vite", ["preview", "--outDir", outDir, "--port", String(port), "--strictPort"], { cwd: checkout, logFd });
    } else {
      server = spawnLogged(process.execPath, ["scripts/dev.mjs", "--port", String(port)], { cwd: checkout, logFd });
    }
    await waitUntilServing(baseUrl, server, 120_000);
    wallMs.serve = Date.now() - serveStart;
    say(`server pid ${String(server.pid)} (process group) serving ${baseUrl}`);

    mcp = await connectPlaywrightMcp({
      name: `qa-${options.label}-${String(process.pid)}`,
      roots: [...new Set([primaryCheckout, repoRoot, checkout])],
    });
  } catch (error) {
    await close();
    throw error;
  }
  const client = mcp;
  /** @type {QaSession["run"]} */
  const run = async (scenarioSource, args, timeoutMs, call) => {
    const code = buildScenarioCode(scenarioSource, { baseUrl, bead: options.bead, captureDir, prod: options.prod, args, ...call });
    return /** @type {import("./prelude.mjs").QaResult} */ (
      parseMcpResult(await client.call("browser_run_code_unsafe", { code }, { timeoutMs }))
    );
  };
  return {
    port,
    serverPid: server.pid ?? null,
    captureDir,
    wallMs,
    run,
    async runPlan(plan, args, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      const many = plan.viewports.length * plan.steps.length > 1;
      /** @type {PlanResult} */
      const merged = { result: null, error: null, log: [], captures: [], caps: [], traces: [], calls: [] };
      /** @type {Record<string, unknown>} */
      const byViewport = {};
      for (const viewport of plan.viewports) {
        /** @type {unknown} */
        let carry = null;
        for (const [step, source] of plan.steps.entries()) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) {
            merged.error = `timed out before ${viewport} step ${String(step)}`;
            return merged;
          }
          const started = Date.now();
          /** @type {import("./prelude.mjs").QaResult} */
          let report;
          try {
            report = await run(source, args, Math.min(remaining, CALL_LIMIT_MS + 15_000), { viewport, step, steps: plan.steps.length, carry });
          } catch (error) {
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
    },
    close,
    closed: () => cleaned,
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
    const report = await session.runPlan(plan, options.args, options.timeoutS * 1000);
    const wallMs = { ...session.wallMs, scenario: Date.now() - scenarioStart, total: Date.now() - startedAt };
    const ok = report.error === null && report.caps.length === 0;
    const summary = {
      scenario: scenarioName,
      bead: options.bead,
      mode: options.prod ? "prod" : "dev",
      checkout: options.cwd ?? repoRoot,
      port: session.port,
      serverPid: session.serverPid,
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
