/**
 * Seeded engine fuzzer: plays Random-policy games, checks invariants after
 * every step, and replays each game to confirm its final state hash.
 *
 *   npm run fuzz:engine -- --games 200 [--seed fuzz] [--first 0] [--interactive-every 10]
 *
 * Every Nth game is also replayed through the fold, suspending at every
 * prompt, and must match the inline game exactly.
 *
 * Passing games write no logs. A failing game writes its engine log
 * (src/engine/log.ts: the seed, decks, policies, and every action with its
 * answers, then the triggers, loops, and random draws they produced) to
 * logs/fuzz/<run-id>/<game>.jsonl, after a `fuzz.failure` line, and prints
 * the repro command.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createEngine } from "../src/engine";
import { engineLogLine } from "../src/engine/log";
import {
  fuzzEngineCatalog,
  fuzzGameLog,
  playFuzzGame,
  replayFinalHash,
  replayInteractively,
} from "../src/engine/testing/fuzz";
import { battleSeed } from "../src/engine/state/ids";
import { parseGameId } from "../src/types/identifiers";

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const games = Number.parseInt(option("games", "200"), 10);
const prefix = option("seed", "fuzz");
const first = Number.parseInt(option("first", "0"), 10);
const runId = `${prefix}-${String(first)}-${String(games)}`;
const interactiveEvery = Number.parseInt(option("interactive-every", "10"), 10);
const engine = createEngine(fuzzEngineCatalog());
let prompts = 0;
let reruns = 0;
let rerunMs = 0;
const started = performance.now();
let steps = 0;
let failures = 0;
const results = { player: 0, enemy: 0, draw: 0 };

for (let index = first; index < first + games; index++) {
  const seed = battleSeed(`${prefix}-${String(index)}`);
  let failure: string | null;
  let game;
  try {
    game = playFuzzGame(engine, seed);
    failure = game.failure;
    if (failure === null && replayFinalHash(engine, game) !== game.finalHash) {
      failure = "replay produced a different final hash";
    }
    if (failure === null && interactiveEvery > 0 && index % interactiveEvery === 0) {
      const interactive = replayInteractively(engine, game, () => performance.now());
      failure = interactive.failure;
      reruns += interactive.reruns;
      rerunMs += interactive.rerunMs;
    }
  } catch (error) {
    failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
  }
  if (game !== undefined) {
    steps += game.steps;
    prompts += game.prompts;
    const result = game.result;
    if (result?.kind === "victory" && result.winner !== undefined) results[result.winner] += 1;
    else if (result?.kind === "draw") results.draw += 1;
  }
  if (failure !== null) {
    failures += 1;
    const directory = `logs/fuzz/${runId}`;
    mkdirSync(directory, { recursive: true });
    const gameId = parseGameId(seed);
    const timestamp = new Date().toISOString();
    const lines = [
      JSON.stringify({ event: "fuzz.failure", gameId, timestamp, seed, failure, failedAction: game?.failedAction ?? null }),
      ...(game === undefined ? [] : fuzzGameLog(engine, game).map((record) => JSON.stringify(engineLogLine(record, gameId, timestamp)))),
    ];
    writeFileSync(`${directory}/${seed}.jsonl`, `${lines.join("\n")}\n`);
    console.error(`FAIL ${seed}: ${failure}`);
    console.error(`  repro: npm run fuzz:engine -- --seed ${prefix} --first ${String(index)} --games 1`);
  }
}

const seconds = (performance.now() - started) / 1000;
console.log(
  `fuzz:engine ${String(games)} games, ${String(steps)} steps, ${seconds.toFixed(1)} s ` +
    `(${(games / seconds).toFixed(1)} games/s); prompts ${String(prompts)}; ` +
    `interactive re-runs ${String(reruns)} (${reruns > 0 ? (rerunMs / reruns).toFixed(3) : "0"} ms each); ` +
    `results ${JSON.stringify(results)}; failures ${String(failures)}`,
);
process.exitCode = failures > 0 ? 1 : 0;
