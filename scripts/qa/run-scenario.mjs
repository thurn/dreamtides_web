// Runs one browser QA scenario against the runner's own server:
//
//   node scripts/qa/run-scenario.mjs <scenario> --bead <id>
//     [--port <n>] [--prod [--minify]] [--cwd <checkout>] [--arg key=value]...
//     [--timeout <seconds>]
//
// <scenario> is a path to a module, a tracked scenario name
// (scripts/qa/scenarios/<name>.mjs), or a bead-local one
// (artifacts/qa/<bead>/<name>.mjs in the primary checkout). The module's
// default export is one self-contained `async (qa) => result` function: the
// runner sends its source, after the helper prelude (`scripts/qa/prelude.mjs`),
// to the Playwright MCP's `browser_run_code_unsafe`, so it may not read
// bindings from its own module.
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

/**
 * @typedef {object} RunnerOptions
 * @property {string} scenario
 * @property {string} bead
 * @property {number | null} port
 * @property {boolean} prod
 * @property {boolean} minify
 * @property {string | null} cwd
 * @property {Record<string, string>} args
 * @property {number} timeoutS
 */

/**
 * @param {string[]} argv
 * @returns {RunnerOptions}
 */
export function parseRunnerArgs(argv) {
  /** @type {RunnerOptions} */
  const options = { scenario: "", bead: "", port: null, prod: false, minify: false, cwd: null, args: {}, timeoutS: 900 };
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
 * @param {string} path
 * @returns {Promise<Function>}
 */
async function loadScenario(path) {
  /** @type {unknown} */
  const loaded = await import(pathToFileURL(path).href);
  const entry = typeof loaded === "object" && loaded !== null && "default" in loaded ? loaded.default : undefined;
  if (typeof entry !== "function") throw new Error(`${path} has no default-exported function`);
  return entry;
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
function say(message) {
  process.stderr.write(`[qa] ${message}\n`);
}

async function main() {
  const options = parseRunnerArgs(process.argv.slice(2));
  const checkout = options.cwd ?? repoRoot;
  const primaryCheckout = primaryCheckoutOf(repoRoot);
  const scenarioPath = resolveScenarioPath(options.scenario, { primaryCheckout, bead: options.bead });
  const scenarioName = basename(scenarioPath, ".mjs");
  const reportName = `${scenarioName}${options.prod ? "-prod" : ""}`;
  const captureDir = join(primaryCheckout, "artifacts", "qa", options.bead);
  mkdirSync(captureDir, { recursive: true });
  const scenario = await loadScenario(scenarioPath);
  const scenarioSource = scenario.toString();

  const startedAt = Date.now();
  const hostLoad = loadavg()[0];
  const port = options.port ?? (await findFreePort());
  if (!(await isPortFree(port))) throw new Error(`port ${String(port)} is in use`);
  const baseUrl = `http://localhost:${String(port)}`;
  const serverLog = join(captureDir, `${reportName}.server.log`);
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
  const cleanup = async () => {
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
      void cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
    });
  }

  try {
    say(`${scenarioName} for ${options.bead}: serving ${checkout} ${options.prod ? "(production build)" : "(dev)"} on port ${String(port)}; server log ${serverLog}`);
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
      name: `qa-${scenarioName}-${String(process.pid)}`,
      roots: [...new Set([primaryCheckout, repoRoot, checkout])],
    });
    const scenarioStart = Date.now();
    const code = buildScenarioCode(scenarioSource, {
      baseUrl,
      bead: options.bead,
      captureDir,
      prod: options.prod,
      args: options.args,
    });
    const report = /** @type {import("./prelude.mjs").QaResult} */ (
      parseMcpResult(await mcp.call("browser_run_code_unsafe", { code }, { timeoutMs: options.timeoutS * 1000 }))
    );
    wallMs.scenario = Date.now() - scenarioStart;
    wallMs.total = Date.now() - startedAt;
    const ok = report.error === null && report.caps.length === 0;
    const summary = {
      scenario: scenarioName,
      bead: options.bead,
      mode: options.prod ? "prod" : "dev",
      checkout,
      port,
      serverPid: server.pid ?? null,
      hostLoad,
      wallMs,
      ok,
      ...report,
    };
    const json = JSON.stringify(summary, null, 2);
    writeFileSync(join(captureDir, `${reportName}.result.json`), `${json}\n`);
    process.stdout.write(`${json}\n`);
    say(`${ok ? "PASS" : "FAIL"} ${scenarioName} in ${String(Math.round(wallMs.scenario / 100) / 10)} s (total ${String(Math.round(wallMs.total / 100) / 10)} s, load ${hostLoad.toFixed(2)})`);
    if (report.error !== null) say(`scenario error: ${report.error}`);
    for (const entry of report.caps) say(`__caps on ${entry.href}: ${JSON.stringify(entry.caps)}`);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((/** @type {unknown} */ error) => {
    say(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = process.exitCode || 2;
  });
}
