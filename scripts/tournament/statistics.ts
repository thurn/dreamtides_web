import SETTINGS from "./catalog.json";
import type { GameRecord, TournamentConfig } from "./types";
import type { PolicyId } from "../../src/engine/policy/types";
import type { Side } from "../../src/engine/state/ids";
import { outcomesDigest } from "./journal";

export function winStatistics(scores: readonly number[]) {
  if (scores.some((value) => value !== 0 && value !== 0.5 && value !== 1)) throw new Error("Invalid outcome score");
  const games = scores.length;
  const wins = scores.filter((score) => score === 1).length;
  const draws = scores.filter((score) => score === 0.5).length;
  if (games === 0) return { games, wins, draws, losses: 0, rate: null, low: null, high: null };
  const rate = scores.reduce((total, score) => total + score, 0) / games;
  const z2 = SETTINGS.confidenceZ ** 2;
  const denominator = 1 + z2 / games;
  const center = (rate + z2 / (2 * games)) / denominator;
  const radius = SETTINGS.confidenceZ * Math.sqrt(rate * (1 - rate) / games + z2 / (4 * games ** 2)) / denominator;
  return { games, wins, draws, losses: games - wins - draws, rate, low: center - radius, high: center + radius };
}
function score(game: GameRecord, side: Side): number {
  if (game.outcome.status !== "completed") throw new Error("Failed game has no score");
  return game.outcome.result.kind === "draw" ? 0.5 : game.outcome.result.winner === side ? 1 : 0;
}
/** This match runner plays exactly two distinct policies; estimate both together, centered at the catalog anchor. */
export function eloEstimate(scores: readonly number[]): readonly [number, number] {
  const total = scores.reduce((sum, value) => sum + value, 0);
  const probability = (total + SETTINGS.eloPriorGames / 2) / (scores.length + SETTINGS.eloPriorGames);
  const difference = SETTINGS.eloScale * Math.log10(probability / (1 - probability));
  return [SETTINGS.eloCenter + difference / 2, SETTINGS.eloCenter - difference / 2];
}
export function report(runLabel: string, config: TournamentConfig, records: readonly GameRecord[], batches: unknown): string {
  const completed = records.filter((game) => game.outcome.status === "completed");
  const sideOf = (game: GameRecord, policy: PolicyId): Side => game.spec.policies.player === policy ? "player" : "enemy";
  const scores = completed.map((game) => score(game, sideOf(game, config.a)));
  const estimate = eloEstimate(scores);
  const percent = (value: number | null) => value === null ? "—" : `${(100 * value).toFixed(2)}%`;
  function row(label: string, subset: readonly GameRecord[], policy: PolicyId): string {
    const stats = winStatistics(subset.map((game) => score(game, sideOf(game, policy))));
    return `| ${label} | ${String(stats.games)} | ${String(stats.wins)}/${String(stats.draws)}/${String(stats.losses)} | ${percent(stats.rate)} | ${percent(stats.low)}–${percent(stats.high)} |`;
  }
  const policies = [config.a, config.b] as const;
  const lines = [`# Tournament ${runLabel}`, "", `Status: ${completed.length === config.games ? "complete" : "partial"}; ${String(completed.length)}/${String(config.games)} completed games; ${String(records.filter((game) => game.outcome.status === "failed").length)} failed attempts.`, "",
    `Seed: \`${config.seed}\`. Pool SHA-256: \`${config.poolHash}\`. Source SHA-256: \`${config.sourceHash}\`. Outcomes SHA-256: \`${outcomesDigest(records)}\`.`, "",
    `Iteration-only budgets: planning ${String(config.budgets.turnPlanning.iterations)}, response ${String(config.budgets.response.iterations)}. Each pair exchanges policies on the same deck seats, battle seed and starting seat.`, "",
    "Win rate is (wins + ½ draws)/games; Wilson 95% intervals use fractional successes for draws and treat games as observations. Paired observations are correlated; the interval is descriptive. Failures and unfinished games contribute zero observations.", "",
    "| Policy | Games | W/D/L | Win rate | Wilson 95% CI |", "| --- | ---: | --- | ---: | --- |", ...policies.map((policy) => row(policy, completed, policy)), "",
    `Elo estimates across all policies played (${policies.join(", ")}): ${config.a} ${estimate[0].toFixed(2)}, ${config.b} ${estimate[1].toFixed(2)}. Two-policy Bradley–Terry/logistic fit, ${String(SETTINGS.eloScale)}-point scale, mean ${String(SETTINGS.eloCenter)}, ${String(SETTINGS.eloPriorGames)} symmetric prior game(s) per matchup. This prior makes perfect-score estimates finite; the ratings are relative to this dataset.`, "",
    "| Split / policy | Games | W/D/L | Win rate | Wilson 95% CI |", "| --- | ---: | --- | ---: | --- |"];
  for (const policy of policies) {
    for (const layer of [...new Set(completed.map((game) => game.spec.decks.player.layer))].sort((a, b) => a - b)) lines.push(row(`layer ${String(layer)} / ${policy}`, completed.filter((game) => game.spec.decks[sideOf(game, policy)].layer === layer), policy));
    const archetypes = [...new Set(completed.flatMap((game) => game.spec.decks[sideOf(game, policy)].archetypes))].sort();
    for (const tide of archetypes) lines.push(row(`archetype ${tide} / ${policy}`, completed.filter((game) => game.spec.decks[sideOf(game, policy)].archetypes.includes(tide)), policy));
  }
  const choices = completed.reduce((sum, game) => sum + game.outcome.decisionCount, 0);
  const ms = completed.reduce((sum, game) => sum + game.outcome.decisionMs, 0);
  lines.push("", "Archetype splits use the piloted deck's joined tide UUIDs. They overlap: one deck may appear in multiple splits. Layer splits use the piloted deck's Atlas layer.", "", `Mean decision time: ${choices === 0 ? "—" : (ms / choices).toFixed(3)} ms across ${String(choices)} policy decisions; forced actions are excluded.`, "", "Batch host load and lifecycle provenance:", "", "```json", JSON.stringify(batches, null, 2), "```", "");
  return lines.join("\n");
}
