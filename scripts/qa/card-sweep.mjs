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
// docs/plan/evidence/qa-ledger/<bead>.jsonl. A card's base run reports the
// variants it can take; the others are recorded as `skip` without a run. A
// run that hangs fails at its timeout and the sweep goes on. `starter`
// names the catalog's Starter cards. Exits 1 when any verdict is `fail`.

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { loadavg } from "node:os";
import { dirname, join, resolve } from "node:path";
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
  const options = { bead: "", cards: [], variants: VARIANTS, sides: ["player"], timeoutS: 60, port: null, capture: false };
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

async function main() {
  const options = parseSweepArgs(process.argv.slice(2));
  const badCard = options.cards.find((card) => !UUID.test(card));
  if (badCard !== undefined) say(`${badCard} is not a UUID; the card-lab will reject it`);
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const ledger = join(repoRoot, "docs", "plan", "evidence", "qa-ledger", `${options.bead}.jsonl`);
  mkdirSync(dirname(ledger), { recursive: true });
  const hostLoad = loadavg()[0];
  const startedAt = Date.now();
  /** @type {Record<string, number>} */
  const counts = {};
  const record = (/** @type {Record<string, unknown>} */ line) => {
    appendFileSync(ledger, `${JSON.stringify({ ...line, mode: "sweep", bead: options.bead, commit })}\n`);
    const verdict = String(line.verdict);
    counts[verdict] = (counts[verdict] ?? 0) + 1;
    say(`${verdict.padEnd(7)} ${String(line.uuid)} ${String(line.variant)}${line.as === "enemy" ? " as enemy" : ""}${line.notes === "" ? "" : ` (${String(line.notes)})`}`);
  };

  const session = await openQaSession({ bead: options.bead, label: "card-sweep", port: options.port, prod: false, minify: false, cwd: null });
  try {
    for (const card of options.cards) {
      for (const side of options.sides) {
        /** @type {string[] | null} */
        let eligible = null;
        for (const variant of options.variants) {
          if (session.closed()) return;
          const base = { uuid: card, variant, ...(side === "enemy" ? { as: "enemy" } : {}) };
          if (eligible !== null && !eligible.includes(variant)) {
            record({ ...base, verdict: "skip", notes: "the card cannot take this variant", screens: [] });
            continue;
          }
          const capture = options.capture ? `sweep-${card.slice(0, 8)}-${variant}-${side}` : "";
          const timeoutMs = options.timeoutS * 1000;
          /** @type {{ verdict: string, notes?: string, screens?: string[], lab?: { eligibleVariants?: string[] } }} */
          let result;
          try {
            const report = await session.run(
              cardLabPlay.toString(),
              { card, variant, as: side, timeoutMs: String(timeoutMs), capture },
              timeoutMs + 30_000,
            );
            result = /** @type {typeof result | null} */ (report.result) ?? { verdict: "fail", notes: report.error ?? "the scenario returned nothing" };
          } catch (error) {
            result = { verdict: "fail", notes: `the run failed: ${error instanceof Error ? error.message : String(error)}` };
          }
          eligible ??= Array.isArray(result.lab?.eligibleVariants) ? result.lab.eligibleVariants : null;
          record({ ...base, verdict: result.verdict, notes: result.notes ?? "", screens: result.screens ?? [] });
        }
      }
    }
  } finally {
    await session.close();
  }
  say(`swept in ${String(Math.round((Date.now() - startedAt) / 1000))} s at load ${hostLoad.toFixed(2)}: ${JSON.stringify(counts)}; ledger ${ledger}`);
  process.exitCode = (counts.fail ?? 0) > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((/** @type {unknown} */ error) => {
    say(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 2;
  });
}
