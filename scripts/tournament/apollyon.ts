import { battleSeed, type Side } from "../../src/engine/state/ids";
import { parseGameId, type DreamwellCardId, type ApollyonIncarnationId } from "../../src/types/identifiers";
import { outcomesDigest } from "./journal";
import { winStatistics } from "./statistics";
import type { DeckPool, GameRecord, MatchSpec, TournamentConfig } from "./types";
import SETTINGS from "./catalog.json";

/** The public matrix covers the supplied authored catalog, including missing/duplicate pool entries. */
export function assertApollyonPool(pool: DeckPool, incarnationIds: readonly ApollyonIncarnationId[]): void {
  const expected = new Set(incarnationIds);
  const actual = pool.decks.flatMap((deck) => deck.incarnationId === undefined ? [] : [deck.incarnationId]);
  if (expected.size === 0 || expected.size !== incarnationIds.length || actual.length !== expected.size || new Set(actual).size !== expected.size || actual.some((id) => !expected.has(id))) throw new Error("Matrix pool must contain each authored incarnation exactly once");
}

/** A mirror-policy matrix measures the physical boss deck, independent of policy labels. */
export function apollyonSchedule(config: TournamentConfig, pool: DeckPool, dreamwell: readonly DreamwellCardId[], scoreTargets: readonly number[]): MatchSpec[] {
  const bosses = pool.decks.filter((deck) => deck.incarnationId !== undefined).sort((a, b) => a.incarnationId! < b.incarnationId! ? -1 : 1);
  const opponents = pool.decks.filter((deck) => deck.incarnationId === undefined && deck.layer === SETTINGS.apollyon.layer);
  if (config.matchup !== "apollyon" || config.a !== config.b || bosses.length === 0 || opponents.length === 0 || new Set(bosses.map((boss) => boss.incarnationId)).size !== bosses.length || !Number.isSafeInteger(config.games) || config.games <= 0 || config.games % (2 * bosses.length) !== 0) throw new Error("Invalid Apollyon matrix");
  const pairs = config.games / bosses.length / 2;
  if (pairs < opponents.length) throw new Error("Matrix must exercise each Atlas opponent");
  const scoreToWin = scoreTargets[Math.min(SETTINGS.apollyon.layer, scoreTargets.length - 1)];
  if (scoreToWin === undefined || !Number.isSafeInteger(scoreToWin) || scoreToWin <= 0) throw new Error("Missing boss score target");
  return bosses.flatMap((boss, incarnationIndex) => Array.from({ length: pairs }, (_, index) => {
    const opponent = opponents[(index + incarnationIndex) % opponents.length];
    if (opponent === undefined) throw new Error("Missing Atlas opponent");
    const pair = incarnationIndex * pairs + index;
    const seed = battleSeed(`${config.seed}|apollyon|${boss.incarnationId!}|${String(index)}`);
    const startingSide: Side = index % 2 === 0 ? "player" : "enemy";
    return ([0, 1] as const).map((leg): MatchSpec => {
      const ordinal = 2 * pair + leg;
      const decks = leg === 0 ? { player: boss, enemy: opponent } : { player: opponent, enemy: boss };
      return { ordinal, pair, leg, gameId: parseGameId(`${config.seed}|game|${String(ordinal)}`), policies: { player: config.a, enemy: config.b }, decks,
        init: { seed, startingSide, scoreToWin, dreamwell,
          decks: { player: decks.player.cards.map((cardId) => ({ cardId })), enemy: decks.enemy.cards.map((cardId) => ({ cardId })) },
          avatars: { ...(decks.player.abilityActive ? { player: decks.player.avatarId } : {}), ...(decks.enemy.abilityActive ? { enemy: decks.enemy.avatarId } : {}) },
          dreamsigns: { player: decks.player.dreamsigns, enemy: decks.enemy.dreamsigns },
        } };
    });
  }).flat());
}

export function apollyonStatistics(records: readonly GameRecord[]) {
  const completed = records.filter((record) => record.outcome.status === "completed");
  const ids = [...new Set(completed.flatMap((record) => [record.spec.decks.player.incarnationId, record.spec.decks.enemy.incarnationId]).filter((id) => id !== undefined))].sort();
  return ids.map((incarnationId) => {
    const games = completed.filter((record) => record.spec.decks.player.incarnationId === incarnationId || record.spec.decks.enemy.incarnationId === incarnationId);
    const sideOf = (record: GameRecord): Side => record.spec.decks.player.incarnationId === incarnationId ? "player" : "enemy";
    const stats = winStatistics(games.map((record) => record.outcome.status !== "completed" ? 0 : record.outcome.result.kind === "draw" ? 0.5 : record.outcome.result.winner === sideOf(record) ? 1 : 0));
    return { incarnationId, ...stats, first: games.filter((game) => game.spec.init.startingSide === sideOf(game)).length, player: games.filter((game) => sideOf(game) === "player").length,
      opponentIds: [...new Set(games.map((game) => game.spec.decks[sideOf(game) === "player" ? "enemy" : "player"].id))].sort() };
  });
}

export function apollyonReport(runId: string, config: TournamentConfig, records: readonly GameRecord[], batches: unknown): string {
  const rows = apollyonStatistics(records);
  const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
  const completed = rows.reduce((sum, row) => sum + row.games, 0);
  const decisions = records.filter((record) => record.outcome.status === "completed").reduce((sum, record) => sum + record.outcome.decisionCount, 0);
  const decisionMs = records.filter((record) => record.outcome.status === "completed").reduce((sum, record) => sum + record.outcome.decisionMs, 0);
  return ["# Provisional Apollyon sanity matrix", "", `Run: \`${runId}\`; policy: \`${config.a}\` on both seats. Status: ${completed === config.games ? "complete" : "partial"}; ${String(completed)}/${String(config.games)} completed; ${String(records.filter((record) => record.outcome.status === "failed").length)} failed attempts.`, "",
    `Seed: \`${config.seed}\`. Pool SHA-256: \`${config.poolHash}\`. Source SHA-256: \`${config.sourceHash}\`. Outcomes SHA-256: \`${outcomesDigest(records)}\`.`, "",
    `Iteration-only planning/response ceilings: ${String(config.budgets.turnPlanning.iterations)}/${String(config.budgets.response.iterations)}. Each pair shares a battle seed, Atlas opponent and starting seat, exchanging physical deck seats. Engine randomness remains seat-specific; this measures paired seat exchanges, not identical per-deck deals. Each incarnation starts half its games.`, "",
    "Boss scores use the incarnation's actual physical seat: (wins + ½ draws)/completed games. Failed and unfinished games supply zero observations. Wilson 95% intervals treat draws as fractional successes and games as observations; paired games are correlated, so intervals are descriptive. Mirror policies provide a deck sanity comparison without a policy Elo claim.", "",
    "| Incarnation UUID | Games | W/D/L | Boss win rate | Wilson 95% CI | Boss player / first | Atlas opponents |", "| --- | ---: | --- | ---: | --- | --- | ---: |",
    ...rows.map((row) => `| \`${row.incarnationId}\` | ${String(row.games)} | ${String(row.wins)}/${String(row.draws)}/${String(row.losses)} | ${percent(row.rate)} | ${percent(row.low)}–${percent(row.high)} | ${String(row.player)} / ${String(row.first)} | ${String(row.opponentIds.length)} |`), "",
    "The frozen pool retains the original Atlas records and appends the production curated recipe, permanent Aspect and Dreamsigns for each incarnation. The append provenance and generation JSONL record the reason and exact source/pool hashes. These provisional observations are not balance targets. Phase 7.8 repeats this matrix with the champion.", "",
    `Mean decision time: ${decisions === 0 ? "—" : (decisionMs / decisions).toFixed(3)} ms across ${String(decisions)} decisions. Per-game replay records: \`logs/tournaments/${runId}.jsonl\`.`, "", "Batch host load and lifecycle provenance:", "", "```json", JSON.stringify(batches, null, 2), "```", ""].join("\n");
}
