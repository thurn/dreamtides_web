// The scripted card sweep (workflow § Card QA, D21):
//
//   node scripts/qa/card-sweep.mjs --bead <id> --cards <uuid,...|starter>
//     [--variants all|<v>,...] [--as player|enemy|both] [--timeout <s>]
//     [--port <n>] [--capture]
//
// For each card, side, and variant it runs the `card-lab-play` scenario
// (scripts/qa/scenarios/card-lab-play.mjs) in the card-lab through one
// runner session (`openQaSession`: its own dev server and MCP client), and
// appends one QA ledger line per verdict to
// docs/plan/evidence/qa-ledger/<bead>.jsonl. The defaults sweep every
// variant on both sides. A card's base run reports the variants it can take;
// the others are recorded as `skip` without a run. A run that hangs fails at
// its timeout and the sweep goes on. `starter` names the catalog's Starter
// cards. Each ledger line's `commit` is the base OID the bead was built on,
// `git merge-base HEAD staging`. Exits 1 when any effective cell verdict is `fail`.

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openQaSession, say } from "./run-scenario.mjs";
import cardLabPlay from "./scenarios/card-lab-play.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const VARIANTS = ["base", "amplified", "empowered", "kindled", "resonant", "inspired", "enduring", "hastened", "attuned", "perfected"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * @typedef {{ bead: string, cards: string[], variants: string[], sides: string[], timeoutS: number, port: number | null, capture: boolean }} SweepOptions
 */

/**
 * @param {string[]} argv
 * @returns {SweepOptions}
 */
export function parseSweepArgs(argv) {
  /** @type {SweepOptions} */
  const options = { bead: "", cards: [], variants: VARIANTS, sides: ["player", "enemy"], timeoutS: 60, port: null, capture: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === "--bead") options.bead = value();
    else if (arg === "--cards") {
      const raw = value();
      options.cards = raw === "starter" ? starterCards() : raw.split(",");
    }
    else if (arg === "--variants") {
      const raw = value();
      options.variants = raw === "all" ? VARIANTS : raw.split(",");
    } else if (arg === "--as") {
      const raw = value();
      options.sides = raw === "both" ? ["player", "enemy"] : [raw];
    } else if (arg === "--timeout") options.timeoutS = Number(value());
    else if (arg === "--port") options.port = Number(value());
    else if (arg === "--capture") options.capture = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(options.bead)) throw new Error("--bead <id> is required");
  if (options.cards.length === 0) throw new Error("--cards <uuid,...|starter> is required");
  const badVariant = options.variants.find((variant) => !VARIANTS.includes(variant));
  if (badVariant !== undefined) throw new Error(`unknown variant ${badVariant}; one of ${VARIANTS.join(", ")}`);
  if (options.variants[0] !== "base") options.variants = ["base", ...options.variants.filter((variant) => variant !== "base")];
  if (options.sides.some((side) => side !== "player" && side !== "enemy")) throw new Error("--as is player, enemy, or both");
  if (!(options.timeoutS > 0)) throw new Error("--timeout must be a positive number of seconds");
  return options;
}

/** The Starter cards' UUIDs, from their content modules (one card per module, `src/content/define.ts`). */
function starterCards() {
  const files = execFileSync("git", ["grep", "-l", "isStarter: true", "--", "src/content/cards"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter((file) => file !== "");
  return files.map((file) => {
    const id = /\bid: "([0-9a-f-]{36})"/u.exec(readFileSync(join(repoRoot, file), "utf8"))?.[1];
    if (id === undefined) throw new Error(`${file} declares no card UUID`);
    return id;
  });
}

/** The base OID the bead was built on (workflow § Card QA, QA ledger): where HEAD leaves Tollgate's `staging` branch. */
function baseCommit() {
  try {
    return execFileSync("git", ["merge-base", "HEAD", "staging"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
    say(`no merge base with staging; the ledger records HEAD ${head} as the commit`);
    return head;
  }
}

/**
 * Runs one cell, retaining every attempt. Only an explicit timeout-only
 * scenario result from a healthy, settled session permits one fresh retry.
 * @param {{ run: (attempt: number) => Promise<import("./prelude.mjs").QaResult>,
 * closed: () => boolean,
 * save: (report: import("./prelude.mjs").QaResult, attempt: number) => string,
 * record: (line: Record<string, unknown>) => void }} operations
 * @returns {Promise<import("./scenarios/card-lab-play.mjs").CardLabPlayResult>}
 */
export async function runSweepCell({ run, closed, save, record }) {
  for (const attempt of [1, 2]) {
    /** @type {import("./prelude.mjs").QaResult} */
    let report;
    try { report = await run(attempt); }
    catch (error) {
      report = { result: null, error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        caps: [], log: [], captures: [], traces: [] };
    }
    const rawReport = save(report, attempt);
    const value = report.result;
    const raw = typeof value === "object" && value !== null && "verdict" in value &&
      ["pass", "fail", "pending", "skip"].includes(String(value.verdict)) && "notes" in value && typeof value.notes === "string"
      ? /** @type {import("./scenarios/card-lab-play.mjs").CardLabPlayResult} */ (value) : null;
    let result = raw ?? { verdict: "fail", notes: report.error ?? "the scenario returned nothing", failureKinds: ["unknown"] };
    if (report.error !== null || (result.verdict !== "skip" && report.caps.length > 0)) {
      result = { ...result, verdict: "fail",
        failureKinds: [...(result.failureKinds ?? []), "unknown"],
        notes: [result.notes, report.error, report.caps.length > 0 ? `__caps: ${JSON.stringify(report.caps)}` : null].filter(Boolean).join("; ") };
    }
    const retry = attempt === 1 && !closed() && report.error === null && report.caps.length === 0 &&
      result.verdict === "fail" && Array.isArray(result.failureKinds) && result.failureKinds.length > 0 &&
      result.failureKinds.every((kind) => kind === "timeout");
    record({ verdict: result.verdict, notes: result.notes, screens: result.screens ?? [], attempt,
      effective: !retry, failureKinds: result.failureKinds ?? [], rawReport });
    if (!retry) return result;
  }
  throw new Error("sweep cell exhausted without an effective verdict");
}

/** Effective cells and raw attempts are separate public summary counters. */
export function createSweepCounts() {
  /** @type {Record<string, number>} */
  const counts = {};
  /** @type {Record<string, number>} */
  const attemptCounts = {};
  return { counts, attemptCounts, record: (/** @type {Record<string, unknown>} */ line) => {
    const verdict = String(line.verdict);
    attemptCounts[verdict] = (attemptCounts[verdict] ?? 0) + 1;
    if (line.effective !== false) counts[verdict] = (counts[verdict] ?? 0) + 1;
  } };
}

async function main() {
  const options = parseSweepArgs(process.argv.slice(2));
  const badCard = options.cards.find((card) => !UUID.test(card));
  if (badCard !== undefined) say(`${badCard} is not a UUID; the card-lab will reject it`);
  const commit = baseCommit();
  const ledger = join(repoRoot, "docs", "plan", "evidence", "qa-ledger", `${options.bead}.jsonl`);
  mkdirSync(dirname(ledger), { recursive: true });
  const hostLoad = loadavg()[0];
  const startedClock = performance.now();
  const totals = createSweepCounts();
  const { counts, attemptCounts } = totals;
  const record = (/** @type {Record<string, unknown>} */ line) => {
    appendFileSync(ledger, `${JSON.stringify({ ...line, mode: "sweep", bead: options.bead, commit })}\n`);
    const verdict = String(line.verdict);
    totals.record(line);
    say(`${verdict.padEnd(7)} ${String(line.uuid)} ${String(line.variant)}${line.as === "enemy" ? " as enemy" : ""}${line.notes === "" ? "" : ` (${String(line.notes)})`}`);
  };

  const session = await openQaSession({ bead: options.bead, label: "card-sweep", port: options.port, prod: false, minify: false, cwd: null });
  /** @type {string | null} */
  let invocationDir = null;
  const scenarioStarted = performance.now();
  let scenarioMs = 0;
  let cleanupMs = 0;
  try {
    const artifacts = mkdtempSync(join(session.captureDir, "sweep-"));
    invocationDir = artifacts;
    const invocation = basename(artifacts);
    cells: for (const card of options.cards) {
      for (const side of options.sides) {
        /** @type {string[] | null} */
        let eligible = null;
        for (const variant of options.variants) {
          if (session.closed()) break cells;
          const base = { uuid: card, variant, ...(side === "enemy" ? { as: "enemy" } : {}) };
          if (eligible !== null && !eligible.includes(variant)) {
            record({ ...base, verdict: "skip", notes: "the card cannot take this variant", screens: [], attempt: 1, effective: true });
            continue;
          }
          const capture = options.capture ? `sweep-${card.slice(0, 8)}-${variant}-${side}` : "";
          const timeoutMs = options.timeoutS * 1000;
          const result = await runSweepCell({
            run: (attempt) => session.run(cardLabPlay.toString(),
              { card, variant, as: side, timeoutMs: String(timeoutMs), capture: capture === "" ? "" : `${invocation}/${capture}-attempt-${String(attempt)}` }, timeoutMs + 30_000),
            closed: session.closed,
            save: (report, attempt) => {
              const filename = `sweep-${card}-${variant}-${side}-attempt-${String(attempt)}.result.json`;
              writeFileSync(join(artifacts, filename), JSON.stringify(report, null, 2) + "\n");
              return `${invocation}/${filename}`;
            },
            record: (line) => record({ ...base, ...line }),
          });
          eligible ??= Array.isArray(result.lab?.eligibleVariants) ? result.lab.eligibleVariants : null;
        }
      }
    }
  } finally {
    scenarioMs = performance.now() - scenarioStarted;
    const cleanupStarted = performance.now();
    await session.close();
    cleanupMs = performance.now() - cleanupStarted;
  }
  const total = performance.now() - startedClock;
  const browserLeaseWait = session.wallMs.browserLeaseWait ?? 0;
  const summary = { event: "cardSweepSummary", counts, attemptCounts, hostLoad,
    wallMs: { ...session.wallMs, scenario: scenarioMs, cleanup: cleanupMs, execution: total - browserLeaseWait, total } };
  if (invocationDir !== null) writeFileSync(join(invocationDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(session.captureDir, "card-sweep.summary.json"), JSON.stringify(summary, null, 2) + "\n");
  say(JSON.stringify(summary));
  say(`sweep total ${(total / 1000).toFixed(1)} s: browser lease wait ${(browserLeaseWait / 1000).toFixed(1)} s, execution ${((total - browserLeaseWait) / 1000).toFixed(1)} s at load ${hostLoad.toFixed(2)}: cells ${JSON.stringify(counts)}, attempts ${JSON.stringify(attemptCounts)}; ledger ${ledger}`);
  process.exitCode = (counts.fail ?? 0) > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((/** @type {unknown} */ error) => {
    say(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 2;
  });
}
