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
// journey logs one range read, for capping their total size. Events and the genesis are stored as
// the same JSON strings the event codec reads and writes, so a stored log
// round-trips byte-exactly.

import type { CommittedEvent } from "../eventlog/local-log";
import { parseStateHash, type Genesis, type StateHash } from "../eventlog/types";
import { decodeEvent, decodeGenesis, encodeEvent } from "../eventlog/wire";
import {
  clientIdFromUnknown,
  intentKeyFromUnknown,
  gameIdFromUnknown,
  type ClientId,
  type IntentKey,
  type GameId,
} from "../types/identifiers";
import type { KeyValueEntry, KeyValueStore } from "./key-value-store";

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
  genesis: Genesis;
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
): { summary: LocalGameSummary; genesis: Genesis } | null {
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
          lines.reduce((total, line) => total + line.length + 1, 0),
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
      const chunks = await store.getRange(
        logChunksPrefix(gameId),
        `${logChunksPrefix(gameId)}${RANGE_END}`,
      );
      return chunks.flatMap(([key, value]) => {
        if (!isLogChunk(value)) {
          throw new UnreadableLocalGameError(gameId, `invalid log chunk ${key}`);
        }
        return value;
      });
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
  };
}
