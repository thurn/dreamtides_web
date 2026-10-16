import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadavg, hostname, platform } from "node:os";
import { loadJourneyContent } from "../../src/data/journey-content";
import { journeyContentEngine } from "../../src/session/providers/battle-init-provider";
import { catalogManifest } from "../../src/engine/policy/catalog-manifest";
import { parseGameId } from "../../src/types/identifiers";
import { readPool } from "./pool";
import { digest, sourceProvenance } from "./provenance";
import { appendApollyon } from "./append-apollyon";
import { assertApollyonPool, apollyonSchedule, apollyonReport } from "./apollyon";
import { schedule } from "./schedule";
import { options } from "./options";
import { acquireRunLock, appendRecord, readJournal, type JournalHeader } from "./journal";
import { runBatch } from "./batch";
import { report } from "./statistics";
import type { TournamentConfig } from "./types";

const args = process.argv.slice(2);
if (args.includes("--append-apollyon")) {
  appendApollyon(args.filter((argument) => argument !== "--append-apollyon"));
} else {
const input = options(args);
const content = loadJourneyContent();
const engine = journeyContentEngine(content);
const tides4Decks = content.poolContext.poolData.tides4Decks;
if (tides4Decks === undefined) throw new Error("Tides4 deck catalog unavailable");
const { pool, poolHash } = readPool(input.pool, engine.catalog, { tides: new Set(tides4Decks.tides.map((tide) => tide.id)), affiliations: new Set(content.affiliations.map((affiliation) => affiliation.id)), ...content.opponentsData.progression, deckSize: content.opponentsData.opponentDeckSize, incarnations: content.apollyonIncarnations, rosterAvatarIds: new Set(content.avatars.map((avatar) => avatar.id)) });
if (input.apollyon) assertApollyonPool(pool, content.apollyonIncarnations.map((boss) => boss.id));
const provenance = sourceProvenance(process.cwd());
const config: TournamentConfig = { a: input.a, b: input.b, games: input.apollyon ? input.games * pool.decks.filter((deck) => deck.incarnationId !== undefined).length : input.games, ...(input.apollyon ? { matchup: "apollyon" as const } : {}), seed: input.seed, budgets: input.budgets, poolHash, sourceHash: provenance.sourceHash, scheduleVersion: 1, runtime: { node: process.version, platform: process.platform, architecture: process.arch } };
const fingerprint = digest(JSON.stringify(config));
const runId = input.runId ?? parseGameId(`${new Date().toISOString().replace(/[:.]/gu, "-")}-${fingerprint.slice(0, 12)}`);
const matches = (input.apollyon ? apollyonSchedule : schedule)(config, pool, content.dreamwellCards.map((card) => card.id), content.opponentsData.battle.scoreTargets);
const logs = join("logs/tournaments", `${runId}.jsonl`);
const header: JournalHeader = { event: "tournament.started", config, fingerprint, timestamp: new Date().toISOString(), sourceFiles: provenance.files };
const release = acquireRunLock(`${logs}.lock`, input.recover);
try {
  const games = readJournal(logs, header, matches, input.resume);
  const completed = new Set(games.filter((game) => game.outcome.status === "completed").map((game) => game.ordinal));
  const pending = matches.filter((match) => !completed.has(match.ordinal));
  const combined = { ...matches[0]?.init, seed: matches[0]?.init.seed, scoreToWin: matches[0]?.init.scoreToWin,
    decks: { player: pool.decks.flatMap((deck) => deck.cards.map((cardId) => ({ cardId }))), enemy: [] },
    avatars: { player: pool.decks[0]?.avatarId }, dreamsigns: { player: pool.decks.flatMap((deck) => deck.dreamsigns) }, dreamwell: content.dreamwellCards.map((card) => card.id) };
  if (combined.seed === undefined || combined.scoreToWin === undefined) throw new Error("Empty schedule");
  // catalogManifest accepts only one Avatar per side; collect all pool emblems explicitly from the same catalog.
  const baseManifest = catalogManifest(engine.catalog, combined);
  const manifest = { ...baseManifest, avatars: [...new Set(pool.decks.map((deck) => deck.avatarId))].map((id) => ({ id, status: engine.catalog.avatar(id).status })) };
  appendRecord(logs, { event: "tournament.batch", timestamp: new Date().toISOString(), stage: "start", detail: { pid: process.pid, host: hostname(), platform: platform(), node: process.version, workers: input.workers, batchMs: input.batchMs, load: loadavg(), pending: pending.length } });
  const batch = await runBatch({ manifest, matches: pending, budgets: config.budgets, workers: input.workers, batchMs: input.batchMs,
    onGame(record) { appendRecord(logs, record); games.push(record); console.log(JSON.stringify({ event: "tournament.progress", runId, ordinal: record.ordinal, status: record.outcome.status, completed: games.filter((game) => game.outcome.status === "completed").length, requested: config.games })); } });
  appendRecord(logs, { event: "tournament.batch", timestamp: new Date().toISOString(), stage: "end", detail: batch });
  const batches = readFileSync(logs, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { event: string }).filter((line) => line.event === "tournament.batch");
  const directory = "docs/plan/evidence/ai";
  mkdirSync(directory, { recursive: true });
  const destination = join(directory, input.apollyon ? "apollyon.md" : `${runId}.md`);
  const temporary = `${destination}.${String(process.pid)}.tmp`;
  writeFileSync(temporary, (input.apollyon ? apollyonReport : report)(runId, config, games, batches)); renameSync(temporary, destination);
  console.log(JSON.stringify({ event: "tournament.finished", runId, report: destination, logs, ...batch }));
  process.exitCode = batch.reason === "failure" ? 1 : batch.reason === "signal" ? 130 : 0;
} finally { release(); }
}
