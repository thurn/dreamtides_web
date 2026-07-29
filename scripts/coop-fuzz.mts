import {
  clearReplayFixtureProviders,
  registerReplayFixtureProviders,
} from "../src/rules/replay/fixture-providers";
import { runCoopFuzz } from "../src/testing/coop-fuzz-harness";

function integerOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const seed = integerOption("--seed", 20260729);
const runs = integerOption("--runs", 100);
const operations = integerOption("--operations", 35);

registerReplayFixtureProviders();
try {
  await runCoopFuzz({ seed, runs, operations });
  console.log(
    `coop fuzz passed seed=${seed} runs=${runs} operations<=${operations}`,
  );
} finally {
  clearReplayFixtureProviders();
}
