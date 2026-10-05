/**
 * Seeded engine fuzzer: plays Random-policy games, checks invariants after
 * every step, and replays each game to confirm its final state hash.
 *
 *   npm run fuzz:engine -- --games 200 [--seed fuzz] [--first 0]
 *
 * A failing game writes its seed, decks, and action log to
 * logs/fuzz/<run-id>/<game>.jsonl and prints the repro command.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createEngine } from "../src/engine";
import { playFuzzGame, replayFinalHash } from "../src/engine/testing/fuzz";
import { testCatalog } from "../src/engine/testing/synthetic-cards";
import { battleSeed } from "../src/engine/state/ids";

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const games = Number.parseInt(option("games", "200"), 10);
const prefix = option("seed", "fuzz");
const first = Number.parseInt(option("first", "0"), 10);
const runId = `${prefix}-${String(first)}-${String(games)}`;
const engine = createEngine(testCatalog());
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
    if (failure === null && replayFinalHash(engine, game.init, game.actions) !== game.finalHash) {
      failure = "replay produced a different final hash";
    }
  } catch (error) {
    failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
  }
  if (game !== undefined) {
    steps += game.steps;
    const result = game.result;
    if (result?.kind === "victory" && result.winner !== undefined) results[result.winner] += 1;
    else if (result?.kind === "draw") results.draw += 1;
  }
  if (failure !== null) {
    failures += 1;
    const directory = `logs/fuzz/${runId}`;
    mkdirSync(directory, { recursive: true });
    const lines = [
      JSON.stringify({ kind: "fuzzFailure", seed, failure }),
      ...(game === undefined
        ? []
        : [
            JSON.stringify({ kind: "init", init: game.init }),
            ...game.actions.map((entry) => JSON.stringify({ kind: "action", ...entry })),
          ]),
    ];
    writeFileSync(`${directory}/${seed}.jsonl`, `${lines.join("\n")}\n`);
    console.error(`FAIL ${seed}: ${failure}`);
    console.error(`  repro: npm run fuzz:engine -- --seed ${prefix} --first ${String(index)} --games 1`);
  }
}

const seconds = (performance.now() - started) / 1000;
console.log(
  `fuzz:engine ${String(games)} games, ${String(steps)} steps, ${seconds.toFixed(1)} s ` +
    `(${(games / seconds).toFixed(1)} games/s); results ${JSON.stringify(results)}; failures ${String(failures)}`,
);
process.exitCode = failures > 0 ? 1 : 0;
