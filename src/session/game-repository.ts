// Persisted layout of local games on a `KeyValueStore`.
//
//   games/<gameId>                 game record: genesis, local player, head
//   game/<gameId>/checkpoint       latest fold checkpoint
//   game/<gameId>/events/<seq>     one encoded event per seq (zero-padded)
//   game/<gameId>/log/<chunk>      a batch of journey-log JSONL lines
//   logs/<gameId>                  log record: chunk counter, size, last write
//
// Each game owns the `game/<gameId>/` keyspace. The `games/` records make the
// recent-games listing one range read, and the `logs/` records make the stored
// journey logs one range read, for capping their total size. Trimming a log
// deletes its oldest chunks and rewrites the chunk that keeps its newest lines.
// Events and the genesis are stored as the same JSON strings the event codec
// reads and writes, so a stored log round-trips byte-exactly.

import type { CommittedEvent } from "../eventlog/local-log";
import {
  parseStateHash,
  type Genesis,
  type StateHash,
  type StoredGenesis,
} from "../eventlog/types";
import { decodeEvent, decodeGenesis, encodeEvent } from "../eventlog/wire";
import {
  clientIdFromUnknown,
  intentKeyFromUnknown,
  gameIdFromUnknown,
  type ClientId,
  type IntentKey,
  type GameId,
} from "../types/identifiers";
import type { KeyRange, KeyValueEntry, KeyValueStore } from "./key-value-store";

/** Version of the record shapes below. */
export const LOCAL_GAME_SCHEMA_VERSION = 1;

const SEQ_KEY_DIGITS = 12;
const RANGE_END = "￿";
/** Sorts directly after its prefix, so `[key, key + EXACT_KEY_END)` is one key. */
const EXACT_KEY_END = "\u0000";

/** The listing view of one local game. */
export interface LocalGameSummary {
  gameId: GameId;
  /** The game's single local player, the default actor of its intents. */
  localPlayerId: ClientId;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Epoch milliseconds of the newest persisted write. */
  updatedAt: number;
  /** Seq of the newest persisted event. */
  head: number;
}

/** A persisted fold checkpoint. `state` is `EngineConfig.encode` output. */
export interface StoredCheckpoint {
  seq: number;
  state: string;
  stateHash: StateHash;
  intentKeys: Array<[IntentKey, number]>;
}

/** Everything about a game except its events. */
export interface StoredLocalGame {
  summary: LocalGameSummary;
  genesis: StoredGenesis;
  checkpoint: StoredCheckpoint | null;
}

/** The listing view of one game's stored journey log. */
export interface GameLogSummary {
  gameId: GameId;
  /** Stored JSONL size in characters, one newline per line included. */
  characters: number;
  /** Epoch milliseconds of the newest log write. */
  updatedAt: number;
}

/** What trimming a game's stored journey log removed. */
export interface GameLogTrim {
  /** The log after the trim. */
  log: GameLogSummary;
  /** Oldest lines deleted. */
  droppedLines: number;
  /** Their size in characters, one newline per line included. */
  droppedCharacters: number;
}

/** One atomic write: new events, the updated summary, maybe a checkpoint. */
export interface LocalGameWrite {
  summary: LocalGameSummary;
  events: readonly CommittedEvent[];
  checkpoint?: StoredCheckpoint;
}

/** A stored game whose records do not decode. */
export class UnreadableLocalGameError extends Error {
  constructor(gameId: GameId, detail: string) {
    super(`Local game ${gameId} is unreadable: ${detail}`);
    this.name = "UnreadableLocalGameError";
  }
}

export interface GameRepository {
  createGame(summary: LocalGameSummary, genesis: Genesis): Promise<void>;
  /** The stored game, or null when no game has this id. */
  readGame(gameId: GameId): Promise<StoredLocalGame | null>;
  /** Stored events with seq > `afterSeq`, ascending. */
  readEvents(gameId: GameId, afterSeq: number): Promise<CommittedEvent[]>;
  write(gameId: GameId, write: LocalGameWrite): Promise<void>;
  /** Every stored game, most recently updated first. */
  listGames(): Promise<LocalGameSummary[]>;
  /**
   * Append journey-log lines (serialized JSON records) to the game's stored
   * log and return its updated summary. One writer per game.
   */
  appendLogLines(
    gameId: GameId,
    lines: readonly string[],
    updatedAt: number,
  ): Promise<GameLogSummary>;
  /** Every stored journey-log line of the game, oldest first. */
  readLogLines(gameId: GameId): Promise<string[]>;
  /** Every stored journey log, least recently written first. */
  listLogs(): Promise<GameLogSummary[]>;
  /** Delete these games' stored journey logs; their games stay playable. */
  deleteLogs(gameIds: readonly GameId[]): Promise<void>;
  /**
   * Delete the game's oldest journey-log lines, keeping the newest lines that
   * fit within `maxCharacters`, in one atomic write. Null when the game has no
   * stored log. One writer per game.
   */
  trimLogLines(
    gameId: GameId,
    maxCharacters: number,
  ): Promise<GameLogTrim | null>;
}

const gameRecordKey = (gameId: GameId): string => `games/${gameId}`;
const checkpointKey = (gameId: GameId): string => `game/${gameId}/checkpoint`;
const eventsPrefix = (gameId: GameId): string => `game/${gameId}/events/`;
const eventKey = (gameId: GameId, seq: number): string =>
  `${eventsPrefix(gameId)}${String(seq).padStart(SEQ_KEY_DIGITS, "0")}`;
const logRecordKey = (gameId: GameId): string => `logs/${gameId}`;
const logChunksPrefix = (gameId: GameId): string => `game/${gameId}/log/`;
const logChunkKey = (gameId: GameId, chunk: number): string =>
  `${logChunksPrefix(gameId)}${String(chunk).padStart(SEQ_KEY_DIGITS, "0")}`;

interface StoredLogRecord extends GameLogSummary {
  schemaVersion: typeof LOCAL_GAME_SCHEMA_VERSION;
  /** Index of the next chunk to write. */
  nextChunk: number;
}

interface StoredGameRecord extends LocalGameSummary {
  schemaVersion: typeof LOCAL_GAME_SCHEMA_VERSION;
  genesis: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSeq(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function decodeGameRecord(
  value: unknown,
): { summary: LocalGameSummary; genesis: StoredGenesis } | null {
  if (!isRecord(value) || value.schemaVersion !== LOCAL_GAME_SCHEMA_VERSION) {
    return null;
  }
  const gameId = gameIdFromUnknown(value.gameId);
  const localPlayerId = clientIdFromUnknown(value.localPlayerId);
  const genesis = decodeGenesis(value.genesis);
  const { createdAt, updatedAt, head } = value;
  if (
    gameId === null ||
    localPlayerId === null ||
    genesis === null ||
    typeof createdAt !== "number" ||
    typeof updatedAt !== "number" ||
    !isSeq(head)
  ) {
    return null;
  }
  return {
    summary: { gameId, localPlayerId, createdAt, updatedAt, head },
    genesis,
  };
}

function decodeCheckpoint(value: unknown): StoredCheckpoint | null {
  if (
    !isRecord(value) ||
    !isSeq(value.seq) ||
    typeof value.state !== "string" ||
    typeof value.stateHash !== "string" ||
    value.stateHash.length === 0 ||
    !Array.isArray(value.intentKeys)
  ) {
    return null;
  }
  const intentKeys: Array<[IntentKey, number]> = [];
  for (const entry of value.intentKeys as unknown[]) {
    if (!Array.isArray(entry)) return null;
    const [rawKey, seq] = entry as unknown[];
    const key = intentKeyFromUnknown(rawKey);
    if (key === null || !isSeq(seq)) return null;
    intentKeys.push([key, seq]);
  }
  return {
    seq: value.seq,
    state: value.state,
    stateHash: parseStateHash(value.stateHash),
    intentKeys,
  };
}

function decodeLogRecord(value: unknown): StoredLogRecord | null {
  if (!isRecord(value) || value.schemaVersion !== LOCAL_GAME_SCHEMA_VERSION) {
    return null;
  }
  const gameId = gameIdFromUnknown(value.gameId);
  const { characters, updatedAt, nextChunk } = value;
  if (
    gameId === null ||
    !isSeq(characters) ||
    typeof updatedAt !== "number" ||
    !isSeq(nextChunk)
  ) {
    return null;
  }
  return {
    schemaVersion: LOCAL_GAME_SCHEMA_VERSION,
    gameId,
    characters,
    updatedAt,
    nextChunk,
  };
}

/** A stored line's share of its log's size: the line and its newline. */
function lineCharacters(line: string): number {
  return line.length + 1;
}

function isLogChunk(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((line) => typeof line === "string")
  );
}

function encodeGameRecord(
  summary: LocalGameSummary,
  genesis: string,
): StoredGameRecord {
  return { schemaVersion: LOCAL_GAME_SCHEMA_VERSION, ...summary, genesis };
}

/** A `GameRepository` over any `KeyValueStore`. */
export function createGameRepository(store: KeyValueStore): GameRepository {
  // The genesis never changes, so each game's encoded genesis is kept for
  // rewriting the game record alongside every batch.
  const encodedGenesisByGame = new Map<GameId, string>();

  async function encodedGenesis(gameId: GameId): Promise<string> {
    const cached = encodedGenesisByGame.get(gameId);
    if (cached !== undefined) return cached;
    const record = await store.get(gameRecordKey(gameId));
    if (!isRecord(record) || typeof record.genesis !== "string") {
      throw new UnreadableLocalGameError(gameId, "missing game record");
    }
    encodedGenesisByGame.set(gameId, record.genesis);
    return record.genesis;
  }

  async function readLogChunks(
    gameId: GameId,
  ): Promise<Array<[key: string, lines: string[]]>> {
    const chunks = await store.getRange(
      logChunksPrefix(gameId),
      `${logChunksPrefix(gameId)}${RANGE_END}`,
    );
    return chunks.map(([key, value]) => {
      if (!isLogChunk(value)) {
        throw new UnreadableLocalGameError(gameId, `invalid log chunk ${key}`);
      }
      return [key, value];
    });
  }

  return {
    async createGame(summary, genesis) {
      const encoded = JSON.stringify(genesis);
      await store.putAll([
        [gameRecordKey(summary.gameId), encodeGameRecord(summary, encoded)],
      ]);
      encodedGenesisByGame.set(summary.gameId, encoded);
    },

    async readGame(gameId) {
      const [record, checkpoint] = await Promise.all([
        store.get(gameRecordKey(gameId)),
        store.get(checkpointKey(gameId)),
      ]);
      if (record === undefined) return null;
      const decoded = decodeGameRecord(record);
      if (decoded === null || decoded.summary.gameId !== gameId) {
        throw new UnreadableLocalGameError(gameId, "invalid game record");
      }
      return {
        ...decoded,
        // An undecodable checkpoint is skipped: the events alone rebuild it.
        checkpoint:
          checkpoint === undefined ? null : decodeCheckpoint(checkpoint),
      };
    },

    async readEvents(gameId, afterSeq) {
      const entries = await store.getRange(
        eventKey(gameId, afterSeq + 1),
        `${eventsPrefix(gameId)}${RANGE_END}`,
      );
      return entries.map(([key, value]) => {
        const seq = Number(key.slice(eventsPrefix(gameId).length));
        if (!isSeq(seq) || typeof value !== "string") {
          throw new UnreadableLocalGameError(gameId, `invalid event ${key}`);
        }
        try {
          return { seq, event: decodeEvent(value) };
        } catch (error) {
          throw new UnreadableLocalGameError(
            gameId,
            `event ${seq}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
    },

    async write(gameId, write) {
      const entries: KeyValueEntry[] = write.events.map(({ seq, event }) => [
        eventKey(gameId, seq),
        encodeEvent(event),
      ]);
      if (write.checkpoint !== undefined) {
        entries.push([checkpointKey(gameId), write.checkpoint]);
      }
      entries.push([
        gameRecordKey(gameId),
        encodeGameRecord(write.summary, await encodedGenesis(gameId)),
      ]);
      await store.putAll(entries);
    },

    async listGames() {
      const records = await store.getRange("games/", `games/${RANGE_END}`);
      return records
        .flatMap(([, value]) => {
          const decoded = decodeGameRecord(value);
          return decoded === null ? [] : [decoded.summary];
        })
        .sort((left, right) => right.updatedAt - left.updatedAt);
    },

    async appendLogLines(gameId, lines, updatedAt) {
      const previous = decodeLogRecord(await store.get(logRecordKey(gameId)));
      const nextChunk = previous?.nextChunk ?? 0;
      const record: StoredLogRecord = {
        schemaVersion: LOCAL_GAME_SCHEMA_VERSION,
        gameId,
        characters:
          (previous?.characters ?? 0) +
          lines.reduce((total, line) => total + lineCharacters(line), 0),
        updatedAt,
        nextChunk: nextChunk + 1,
      };
      await store.putAll([
        [logChunkKey(gameId, nextChunk), [...lines]],
        [logRecordKey(gameId), record],
      ]);
      const { characters } = record;
      return { gameId, characters, updatedAt };
    },

    async readLogLines(gameId) {
      return (await readLogChunks(gameId)).flatMap(([, lines]) => lines);
    },

    async listLogs() {
      const records = await store.getRange("logs/", `logs/${RANGE_END}`);
      return records
        .flatMap(([, value]) => {
          const decoded = decodeLogRecord(value);
          if (decoded === null) return [];
          const { gameId, characters, updatedAt } = decoded;
          return [{ gameId, characters, updatedAt }];
        })
        .sort((left, right) => left.updatedAt - right.updatedAt);
    },

    async deleteLogs(gameIds) {
      await store.deleteRanges(
        gameIds.flatMap((gameId) => [
          [logRecordKey(gameId), `${logRecordKey(gameId)}${EXACT_KEY_END}`],
          [logChunksPrefix(gameId), `${logChunksPrefix(gameId)}${RANGE_END}`],
        ]),
      );
    },

    async trimLogLines(gameId, maxCharacters) {
      const previous = decodeLogRecord(await store.get(logRecordKey(gameId)));
      if (previous === null) return null;
      const chunks = await readLogChunks(gameId);
      const lines = chunks.flatMap(([, chunkLines]) => chunkLines);
      let keptCharacters = 0;
      let firstKept = lines.length;
      while (
        firstKept > 0 &&
        keptCharacters + lineCharacters(lines[firstKept - 1]) <= maxCharacters
      ) {
        firstKept -= 1;
        keptCharacters += lineCharacters(lines[firstKept]);
      }
      const trim: GameLogTrim = {
        log: {
          gameId,
          characters: keptCharacters,
          updatedAt: previous.updatedAt,
        },
        droppedLines: firstKept,
        droppedCharacters: lines
          .slice(0, firstKept)
          .reduce((sum, line) => sum + lineCharacters(line), 0),
      };
      if (firstKept === 0 && previous.characters === keptCharacters) {
        return trim;
      }

      // Whole chunks of dropped lines are deleted and the chunk holding the
      // oldest kept line is rewritten in place. The record keeps its chunk
      // counter, so later appends follow the kept lines in order.
      const ranges: KeyRange[] = [];
      const entries: KeyValueEntry[] = [
        [logRecordKey(gameId), { ...previous, characters: keptCharacters }],
      ];
      let toDrop = firstKept;
      for (const [key, chunkLines] of chunks) {
        if (toDrop === 0) break;
        if (chunkLines.length <= toDrop) {
          ranges.push([key, `${key}${EXACT_KEY_END}`]);
          toDrop -= chunkLines.length;
        } else {
          entries.push([key, chunkLines.slice(toDrop)]);
          toDrop = 0;
        }
      }
      await store.replaceRanges(ranges, entries);
      return trim;
    },
  };
}
