import { parseArgs } from "node:util";
import { AI } from "../../src/content/ai";
import { POLICY_IDS, type PolicyId } from "../../src/engine/policy/types";
import { parseGameId } from "../../src/types/identifiers";
import { parseJourneySeed } from "../../src/types/journey-seed";
import { integer } from "./pool";
import SETTINGS from "./catalog.json";

export function policyOption(value: unknown): PolicyId {
  const matched = POLICY_IDS.find((policy) => policy === value);
  if (matched === undefined) throw new Error("Unknown policy");
  return matched;
}
/** Bare integer or iterations:N sets both ceilings; scale:F scales each existing D23 iteration budget. */
export function budgetOption(value: string) {
  const iteration = /^(?:iterations:)?([1-9]\d*)$/u.exec(value);
  if (iteration !== null) {
    const iterations = integer(Number(iteration[1]), 1);
    return { turnPlanning: { iterations }, response: { iterations } };
  }
  const scaled = /^scale:(\d+(?:\.\d+)?|\d+\/\d+)$/u.exec(value);
  if (scaled === null) throw new Error("Budget must be iterations:N, N, or scale:F (decimal or fraction)");
  const [numerator, denominator] = (scaled[1] ?? "").split("/").map(Number);
  const scale = (numerator ?? 0) / (denominator ?? 1);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Budget scale must be positive and finite");
  const amount = (base: number) => integer(Math.max(1, Math.floor(base * scale)), 1);
  return { turnPlanning: { iterations: amount(AI.enginePolicy.budgets.turnPlanning.iterations) }, response: { iterations: amount(AI.enginePolicy.budgets.response.iterations) } };
}
export function options(args: readonly string[]) {
  const { values } = parseArgs({ args: [...args], options: {
    a: { type: "string", default: "random" }, b: { type: "string", default: "greedy" }, games: { type: "string" },
    budget: { type: "string", default: SETTINGS.defaultBudget }, pool: { type: "string", default: "scripts/tournament/deck-pool.json" }, seed: { type: "string", default: "tournament" },
    workers: { type: "string", default: String(SETTINGS.defaultWorkers) }, "batch-ms": { type: "string", default: String(SETTINGS.maximumBatchMs) },
    apollyon: { type: "boolean", default: false },
    "run-id": { type: "string" }, resume: { type: "boolean", default: false }, recover: { type: "boolean", default: false },
  } });
  const a = policyOption(values.a), b = policyOption(values.b);
  if (values.apollyon ? a !== b : a === b) throw new Error(values.apollyon ? "Apollyon matrix requires one mirror policy" : "Choose two distinct policies");
  const games = values.apollyon ? SETTINGS.apollyon.gamesPerIncarnation : integer(Number(values.games ?? SETTINGS.defaultGames), 2);
  if (values.apollyon && values.games !== undefined) throw new Error("Matrix game count comes from the tournament catalog");
  if (games % 2 !== 0) throw new Error("Games must be even to preserve paired seats");
  const runId = values["run-id"];
  if (runId !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(runId)) throw new Error("Run-id must be a safe filename component");
  if (values.resume && runId === undefined) throw new Error("Resume requires --run-id");
  return { a, b, games, apollyon: values.apollyon ?? false, seed: parseJourneySeed(values.seed), budgets: budgetOption(values.budget ?? SETTINGS.defaultBudget), pool: values.pool ?? "scripts/tournament/deck-pool.json",
    workers: integer(Number(values.workers), 1, SETTINGS.maximumWorkers), batchMs: integer(Number(values["batch-ms"]), 1, SETTINGS.maximumBatchMs),
    runId: runId === undefined ? undefined : parseGameId(runId), resume: values.resume ?? false, recover: values.recover ?? false };
}
