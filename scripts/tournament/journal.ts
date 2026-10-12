import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, truncateSync } from "node:fs";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { tryCreateReviewLock, snapshotReviewLock, removeReviewLockIfUnchanged } from "../review-lock.mjs";
import { digest } from "./provenance";
import { object, array, integer, text } from "./pool";
import { parseContentHash } from "../../src/types/content-hash";
import type { ContentHash } from "../../src/types/content-hash";
import type { GameRecord, MatchSpec, TournamentConfig } from "./types";

export interface JournalHeader { readonly event: "tournament.started"; readonly config: TournamentConfig; readonly fingerprint: ContentHash; readonly timestamp: string; readonly sourceFiles: readonly { path: string; sha256: ContentHash }[] }
export type JournalRecord = JournalHeader | GameRecord | { readonly event: "tournament.batch"; readonly timestamp: string; readonly stage: "start" | "end"; readonly detail: unknown };

/** Fully-written lock owners are published atomically with the existing review-lock primitive. */
export function acquireRunLock(path: string, recover = false): () => void {
  mkdirSync(dirname(path), { recursive: true });
  const token = randomUUID();
  const owner = { pid: process.pid, cwd: process.cwd(), task: "tournament", startedAt: new Date().toISOString(), host: hostname(), token };
  if (!tryCreateReviewLock(path, owner)) {
    const stale = snapshotReviewLock(path);
    const prior = stale?.ownerContents === null || stale?.ownerContents === undefined ? null : object(JSON.parse(stale.ownerContents));
    if (!recover || prior?.host !== hostname() || typeof prior.pid !== "number" || !Number.isSafeInteger(prior.pid) || prior.pid <= 0) throw new Error("Run lock held or ambiguous; --recover permits only a dead owner on this host");
    try { process.kill(prior.pid, 0); throw new Error("Run lock owner is alive"); }
    catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") throw error; }
    if (!removeReviewLockIfUnchanged(path, stale) || !tryCreateReviewLock(path, owner)) throw new Error("Run lock changed during recovery");
  }
  const owned = snapshotReviewLock(path);
  return () => { removeReviewLockIfUnchanged(path, owned); };
}

/** One complete game per fsynced JSONL line. Partial trailing writes are recoverable prefixes. */
export function appendRecord(path: string, record: JournalRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ ...record, recordHash: digest(JSON.stringify(record)) })}\n`);
  const fd = openSync(path, "r+");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
export function readJournal(path: string, header: JournalHeader, matches: readonly MatchSpec[], resume: boolean): GameRecord[] {
  if (!existsSync(path)) {
    if (resume) throw new Error("Resume journal does not exist");
    appendRecord(path, header);
    return [];
  }
  if (!resume) throw new Error("Run already exists; choose another run-id or --resume");
  const bytes = readFileSync(path);
  const newline = bytes.lastIndexOf(10);
  const retained = newline + 1;
  if (retained === 0) throw new Error("Journal has no committed header");
  const lines: unknown[] = bytes.subarray(0, retained).toString("utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as unknown);
  function checked(value: unknown): Record<string, unknown> {
    const { recordHash, ...record } = object(value);
    if (parseContentHash(recordHash) !== digest(JSON.stringify(record))) throw new Error("Journal record checksum differs");
    return record;
  }
  const first = checked(lines[0]);
  if (first.event !== "tournament.started" || first.fingerprint !== header.fingerprint || digest(JSON.stringify(first.config)) !== digest(JSON.stringify(header.config))) throw new Error("Resume configuration or source provenance differs");
  const games: GameRecord[] = [];
  const completed = new Set<number>();
  for (const value of lines.slice(1)) {
    const line = checked(value);
    if (line.event === "tournament.batch") continue;
    if (line.event !== "tournament.game") throw new Error("Unknown journal record");
    const ordinal = integer(line.ordinal, 0, matches.length - 1);
    if (JSON.stringify(line.spec) !== JSON.stringify(matches[ordinal])) throw new Error("Journal game differs from scheduled match");
    const outcome = object(line.outcome);
    integer(outcome.decisionCount, 0);
    if (typeof outcome.decisionMs !== "number" || !Number.isFinite(outcome.decisionMs) || outcome.decisionMs < 0) throw new Error("Invalid decision timing");
    array(outcome.logs); array(outcome.actions); array(outcome.startAnswers);
    text(line.timestamp);
    if (outcome.status === "completed") {
      const result = object(outcome.result);
      if (result.kind !== "draw" && !(result.kind === "victory" && (result.winner === "player" || result.winner === "enemy"))) throw new Error("Invalid game result");
      parseContentHash(outcome.finalStateHash);
      if (completed.has(ordinal)) throw new Error("Duplicate completed game");
      completed.add(ordinal);
    } else if (outcome.status === "failed") text(outcome.failure);
    else throw new Error("Invalid game status");
    games.push(line as unknown as GameRecord);
  }
  // Repair only after validating the entire committed prefix, while holding the run lock.
  if (retained !== bytes.length) truncateSync(path, retained);
  return games;
}
export function outcomesDigest(games: readonly GameRecord[]): ContentHash {
  return digest(JSON.stringify(games.filter((game) => game.outcome.status === "completed").sort((a, b) => a.ordinal - b.ordinal).map((game) => ({ ordinal: game.ordinal, spec: game.spec, status: game.outcome.status, result: game.outcome.status === "completed" ? game.outcome.result : null, finalStateHash: game.outcome.status === "completed" ? game.outcome.finalStateHash : null }))));
}
