/**
 * Engine performance benchmark for the monitored targets in
 * docs/plan/engine-design.md § Performance targets. Timings are recorded in
 * docs/plan/evidence/metrics.md and never gated.
 *
 *   npx tsx scripts/bench-engine.ts [--games 100] [--seed bench] [--step-games 20] [--interactive-games 20]
 *
 * Measures, single-threaded, on seeded Random-policy fuzz games:
 *
 * - full battles per second (no invariant checks);
 * - one step (`runStep`, from a committed state, answers scripted): median,
 *   p90, p99, and max, each step timed as the median of 3 runs;
 * - clone plus hash of committed states, and the hashes loop detection
 *   computes (full-state, cycle, loop signature);
 * - fold re-runs per answer in interactive replay: mean and max;
 * - for the AI, a view and a determinization of a view (every 10th state).
 */
import { cpus, loadavg } from "node:os";
import { createEngine } from "../src/engine";
import {
  contentAvatarDefinitions,
  contentCardDefinitions,
  contentDreamsignDefinitions,
  contentDreamwellDefinitions,
  contentFigmentDefinitions,
} from "../src/engine/content-catalog";
import { cycleHash, loopSignature } from "../src/engine/loops/signature";
import type { Answer } from "../src/engine/prompts/types";
import { cloneState } from "../src/engine/state/clone";
import { stateHash } from "../src/engine/state/hash";
import { battleSeed, SIDES } from "../src/engine/state/ids";
import type { BattleState } from "../src/engine/state/types";
import type { Step } from "../src/engine/steps/kinds";
import { runStep } from "../src/engine/steps/runner";
import { fuzzEngineCatalog, fuzzInit, playFuzzGame, playRandomGame, replayInteractively, type FuzzPool } from "../src/engine/testing/fuzz";
import { PolicyRandom } from "../src/engine/policy/random";
import { determinize } from "../src/engine/view/determinize";
import { view } from "../src/engine/view/view";

function option(name: string, fallback: string): number | string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const games = Number(option("games", "100"));
const stepGames = Number(option("step-games", "20"));
const interactiveGames = Number(option("interactive-games", "20"));
const prefix = String(option("seed", "bench"));
/** The production catalog, so the fuzzer plays real content beside the synthetic fixtures. */
const pool: FuzzPool = {
  cards: contentCardDefinitions(),
  dreamwell: contentDreamwellDefinitions(),
  emblems: { avatars: contentAvatarDefinitions(), dreamsigns: contentDreamsignDefinitions() },
  figments: contentFigmentDefinitions(),
};
const engine = createEngine(fuzzEngineCatalog(pool));

interface RecordedStep {
  readonly start: BattleState;
  readonly step: Step;
  readonly answers: readonly Answer[];
  readonly automatic: boolean;
}

/** Plays one Random-policy game; `record` receives every step with its start state and answers. */
function playGame(seed: string, record?: (step: RecordedStep) => void): number {
  let given: Answer[] = [];
  let previous: BattleState | null = null;
  let automatic = true;
  let steps = 0;
  const game = playRandomGame(engine, fuzzInit(battleSeed(seed), pool), {
    answered: (_prompt, _work, answer) => {
      given.push(answer);
    },
    observe: (state, step) => {
      steps += 1;
      if (record === undefined) return;
      if (previous !== null) record({ start: previous, step, answers: given, automatic });
      given = [];
      previous = state;
      automatic = true;
    },
    choosing: (_chosen, state) => {
      previous = state;
      automatic = false;
      given = [];
    },
  });
  if (game.end !== "result") throw new Error(`${seed}: the game ended without a result (${game.end})`);
  return steps;
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
}

function micros(values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const format = (ms: number) => `${(ms * 1000).toFixed(1)} µs`;
  return `median ${format(percentile(sorted, 0.5))}, p90 ${format(percentile(sorted, 0.9))}, p99 ${format(percentile(sorted, 0.99))}, max ${format(sorted[sorted.length - 1] ?? 0)} (n=${String(sorted.length)})`;
}

function time(run: () => unknown): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

function medianOf3(run: () => unknown): number {
  const runs = [time(run), time(run), time(run)].sort((a, b) => a - b);
  return runs[1] ?? 0;
}

console.log(`host: ${cpus()[0]?.model ?? "unknown"}, node ${process.version}, 1-min load ${loadavg()[0]?.toFixed(2) ?? "?"}`);

// Warm up the JIT and the catalog caches.
for (let index = 0; index < 5; index++) playGame(`${prefix}-warmup-${String(index)}`);

// 1. Full battles per second.
let totalSteps = 0;
const battlesStarted = performance.now();
for (let index = 0; index < games; index++) totalSteps += playGame(`${prefix}-${String(index)}`);
const battleSeconds = (performance.now() - battlesStarted) / 1000;
console.log(`battles: ${String(games)} in ${battleSeconds.toFixed(2)} s = ${(games / battleSeconds).toFixed(1)} battles/s; ${String(totalSteps)} steps (${((battleSeconds * 1e6) / totalSteps).toFixed(1)} µs per step incl. policy and decisions)`);

// 2–3. Steps, clone plus hash, and loop-detection hashes on committed states.
const stepTimes: number[] = [];
const cloneHash: number[] = [];
const fullHash: number[] = [];
const cycle: number[] = [];
const signature: number[] = [];
const views: number[] = [];
const samples: number[] = [];
for (let index = 0; index < stepGames; index++) {
  const recorded: RecordedStep[] = [];
  const seed = `${prefix}-${String(index)}`;
  playGame(seed, (step) => recorded.push(step));
  const decklists = fuzzInit(battleSeed(seed), pool).decks;
  const random = new PolicyRandom(battleSeed(`determinize|${seed}`));
  recorded.forEach(({ start }, position) => {
    if (position % 10 !== 0) return;
    for (const viewer of SIDES) {
      views.push(medianOf3(() => view(start, viewer, engine.catalog)));
      const seen = view(start, viewer, engine.catalog);
      samples.push(medianOf3(() => determinize(seen, decklists, () => random.next(), engine.catalog)));
    }
  });
  for (const { start, step, answers, automatic } of recorded) {
    stepTimes.push(
      medianOf3(() => {
        let next = 0;
        const scripted = { answer: () => answers[next++] ?? [] };
        runStep(start, step, scripted, engine.catalog, { automatic });
      }),
    );
    cloneHash.push(medianOf3(() => stateHash(cloneState(start))));
    fullHash.push(medianOf3(() => stateHash(start)));
    cycle.push(medianOf3(() => cycleHash(start)));
    signature.push(medianOf3(() => loopSignature(start)));
  }
}
console.log(`step (runStep): ${micros(stepTimes)}`);
console.log(`clone + hash: ${micros(cloneHash)}`);
console.log(`full-state hash: ${micros(fullHash)}`);
console.log(`cycle hash: ${micros(cycle)}`);
console.log(`loop signature: ${micros(signature)}`);
console.log(`view: ${micros(views)}`);
console.log(`determinize: ${micros(samples)}`);

// 4. Interactive re-runs per answer.
let reruns = 0;
let rerunMs = 0;
let rerunMaxMs = 0;
for (let index = 0; index < interactiveGames; index++) {
  const game = playFuzzGame(engine, battleSeed(`${prefix}-${String(index)}`), pool);
  const replay = replayInteractively(engine, game, () => performance.now());
  if (replay.failure !== null) throw new Error(`${prefix}-${String(index)}: ${replay.failure}`);
  reruns += replay.reruns;
  rerunMs += replay.rerunMs;
  rerunMaxMs = Math.max(rerunMaxMs, replay.rerunMaxMs);
}
console.log(`interactive re-run per answer: mean ${(reruns > 0 ? rerunMs / reruns : 0).toFixed(3)} ms, max ${rerunMaxMs.toFixed(3)} ms (n=${String(reruns)})`);
console.log(`1-min load at end ${loadavg()[0]?.toFixed(2) ?? "?"}`);
