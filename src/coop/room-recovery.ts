import {
  type Database,
  get,
  ref,
  runTransaction,
} from "firebase/database";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import type { FoldState } from "../rules/fold-state";
import { parseStateHash, type PinnedGenesis, type StateHash } from "../eventlog/types";
import { decodeGenesis } from "../eventlog/wire";
import type { DatabaseMode } from "../runtime/runtime-config";
import type { RoomId } from "../types/identifiers";

export const ROOM_RECOVERY_FORMAT = "dreamtides-room-recovery";
export const ROOM_RECOVERY_VERSION = 1;
const MAX_RECOVERY_ARCHIVES = 3;

declare const roomRecoveryTokenBrand: unique symbol;
type RoomRecoveryToken<Name extends string> = string & {
  readonly [roomRecoveryTokenBrand]: Name;
};

function roomRecoveryToken<Name extends string>(value: string): RoomRecoveryToken<Name> {
  if (value.length === 0) throw new Error("Recovery identity must be non-empty.");
  return value as RoomRecoveryToken<Name>;
}

export function roomRecoveryOperation(value: string): RoomRecoveryToken<"operation"> {
  return roomRecoveryToken(value);
}

export interface RoomRecoveryCheckpoint {
  readonly format: typeof ROOM_RECOVERY_FORMAT;
  readonly version: typeof ROOM_RECOVERY_VERSION;
  readonly checkpointId: RoomRecoveryToken<"checkpoint">;
  readonly generation: number;
  readonly sourceHead: number;
  readonly sourcePath: string;
  readonly createdAt: string;
  readonly stateHash: StateHash;
  readonly encodedGenesis: string;
  readonly encodedState: string;
}

export interface RoomRecoveryResult {
  readonly checkpoint: RoomRecoveryCheckpoint;
  readonly generation: number;
  readonly recovered: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGeneration(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSafeSourcePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("?") &&
    !value.includes("#")
  );
}

function checkpointIdentity(
  generation: number,
  sourceHead: number,
  stateHash: StateHash,
): RoomRecoveryToken<"checkpoint"> {
  return roomRecoveryToken(`${generation}:${sourceHead}:${stateHash}`);
}

export function buildRoomRecoveryCheckpoint(input: {
  readonly generation: number;
  readonly sourceHead: number;
  readonly sourcePath: string;
  readonly genesis: PinnedGenesis;
  readonly state: FoldState;
  readonly createdAt?: string;
}): RoomRecoveryCheckpoint {
  const encodedState = GAME_ENGINE_CONFIG.encode(input.state);
  const stateHash = GAME_ENGINE_CONFIG.hash(input.state);
  return {
    format: ROOM_RECOVERY_FORMAT,
    version: ROOM_RECOVERY_VERSION,
    checkpointId: checkpointIdentity(
      input.generation,
      input.sourceHead,
      stateHash,
    ),
    generation: input.generation,
    sourceHead: input.sourceHead,
    sourcePath: input.sourcePath,
    createdAt: input.createdAt ?? new Date().toISOString(),
    stateHash,
    encodedGenesis: JSON.stringify(input.genesis),
    encodedState,
  };
}

export function decodeRoomRecoveryCheckpoint(
  raw: unknown,
): RoomRecoveryCheckpoint | null {
  if (typeof raw !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const {
    format,
    version,
    checkpointId,
    generation,
    sourceHead,
    sourcePath,
    createdAt,
    stateHash,
    encodedGenesis,
    encodedState,
  } = value;
  if (
    format !== ROOM_RECOVERY_FORMAT ||
    version !== ROOM_RECOVERY_VERSION ||
    typeof checkpointId !== "string" ||
    !isGeneration(generation) ||
    !isGeneration(sourceHead) ||
    !isSafeSourcePath(sourcePath) ||
    typeof createdAt !== "string" ||
    typeof stateHash !== "string" ||
    typeof encodedGenesis !== "string" ||
    typeof encodedState !== "string"
  ) {
    return null;
  }
  const genesis = decodeGenesis(encodedGenesis);
  if (genesis === null) return null;
  try {
    const state = GAME_ENGINE_CONFIG.decode(encodedState);
    if (
      state.journey.seed !== genesis.seed ||
      GAME_ENGINE_CONFIG.hash(state) !== stateHash ||
      checkpointId !== checkpointIdentity(generation, sourceHead, parseStateHash(stateHash))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return {
    format,
    version,
    checkpointId: roomRecoveryToken(checkpointId),
    generation,
    sourceHead,
    sourcePath,
    createdAt,
    stateHash: parseStateHash(stateHash),
    encodedGenesis,
    encodedState,
  };
}

function recoveryGeneration(raw: unknown): number {
  return isRecord(raw) && isGeneration(raw.generation) ? raw.generation : 0;
}

/**
 * Publishes the latest successfully rendered confirmed fold. The recovery
 * metadata transaction is deliberately separate from gameplay state: this is
 * a disaster-recovery artifact, never an input to ordinary game flow.
 */
export async function writeRoomRecoveryCheckpoint(
  database: Database,
  roomId: RoomId,
  checkpoint: RoomRecoveryCheckpoint,
): Promise<boolean> {
  const result = await runTransaction(
    ref(database, `rooms/${roomId}/recovery`),
    (current: unknown) => {
      const currentRecord = isRecord(current) ? current : {};
      const generation = recoveryGeneration(currentRecord);
      if (generation !== checkpoint.generation) return undefined;
      const currentCheckpoint = decodeRoomRecoveryCheckpoint(
        currentRecord.latest,
      );
      if (
        currentCheckpoint !== null &&
        (currentCheckpoint.generation > checkpoint.generation ||
          (currentCheckpoint.generation === checkpoint.generation &&
            currentCheckpoint.sourceHead > checkpoint.sourceHead))
      ) {
        return undefined;
      }
      return {
        ...currentRecord,
        generation,
        latest: JSON.stringify(checkpoint),
      };
    },
    { applyLocally: false },
  );
  return result.committed;
}

function nextArchives(
  recovery: Record<string, unknown>,
  archiveKey: RoomRecoveryToken<"archive">,
  currentLog: unknown,
): Record<string, string> {
  const archives = isRecord(recovery.archives)
    ? Object.fromEntries(
        Object.entries(recovery.archives).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {};
  archives[archiveKey] = JSON.stringify(currentLog ?? null);
  const retained = Object.entries(archives)
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, MAX_RECOVERY_ARCHIVES);
  return Object.fromEntries(retained);
}

function isCanonicalRecoveredLog(
  log: unknown,
  checkpoint: RoomRecoveryCheckpoint,
): boolean {
  return (
    isRecord(log) &&
    log.genesis === checkpoint.encodedGenesis &&
    log.generation === checkpoint.generation &&
    log.baseSeq === 0 &&
    log.head === 0 &&
    log.baseSnapshot === checkpoint.encodedState &&
    (log.events === undefined ||
      (isRecord(log.events) && Object.keys(log.events).length === 0))
  );
}

export function applyLatestRoomRecovery(
  rawRoom: unknown,
  operationId: RoomRecoveryToken<"operation">,
  recoveredAt: string,
): { readonly room: Record<string, unknown>; readonly result: RoomRecoveryResult } {
  if (!isRecord(rawRoom)) {
    throw new Error("The shared game does not exist.");
  }
  const recovery = isRecord(rawRoom.recovery) ? rawRoom.recovery : {};
  const checkpoint = decodeRoomRecoveryCheckpoint(recovery.latest);
  if (checkpoint === null) {
    throw new Error("This game has no verified recovery checkpoint.");
  }
  if (isCanonicalRecoveredLog(rawRoom.log, checkpoint)) {
    return {
      room: rawRoom,
      result: {
        checkpoint,
        generation: checkpoint.generation,
        recovered: false,
      },
    };
  }

  const currentGeneration = Math.max(
    recoveryGeneration(recovery),
    isRecord(rawRoom.log) && isGeneration(rawRoom.log.generation)
      ? rawRoom.log.generation
      : 0,
  );
  const generation = currentGeneration + 1;
  const recoveredCheckpoint: RoomRecoveryCheckpoint = {
    ...checkpoint,
    checkpointId: checkpointIdentity(generation, 0, checkpoint.stateHash),
    generation,
    sourceHead: 0,
    createdAt: recoveredAt,
  };
  const safeOperationId = operationId.replace(/[.#$[\]/]/gu, "_");
  const archiveKey = roomRecoveryToken<"archive">(
    `${String(currentGeneration).padStart(8, "0")}-${safeOperationId}`,
  );
  const operation = {
    operationId,
    recoveredAt,
    fromGeneration: currentGeneration,
    toGeneration: generation,
    checkpointId: checkpoint.checkpointId,
    sourceHead: checkpoint.sourceHead,
    sourcePath: checkpoint.sourcePath,
    stateHash: checkpoint.stateHash,
  };

  return {
    room: {
      ...rawRoom,
      log: {
        genesis: checkpoint.encodedGenesis,
        generation,
        baseSeq: 0,
        baseSnapshot: checkpoint.encodedState,
        head: 0,
        events: {},
      },
      recovery: {
        ...recovery,
        generation,
        latest: JSON.stringify(recoveredCheckpoint),
        lastOperation: JSON.stringify(operation),
        archives: nextArchives(recovery, archiveKey, rawRoom.log),
      },
    },
    result: { checkpoint, generation, recovered: true },
  };
}

/** Atomically rotates the entire shared room onto its latest safe checkpoint. */
export async function recoverRoomToLatestCheckpoint(
  database: Database,
  roomId: RoomId,
  operationId: RoomRecoveryToken<"operation"> = roomRecoveryOperation(
    globalThis.crypto.randomUUID(),
  ),
  recoveredAt: string = new Date().toISOString(),
): Promise<RoomRecoveryResult> {
  const roomRef = ref(database, `rooms/${roomId}`);
  // A standalone recovery page has no existing room subscription. Prime the
  // SDK cache so its first transaction callback sees the remote room instead
  // of treating an initial local `null` as an absent game and aborting.
  const initialRoom = (await get(roomRef)).val() as unknown;
  if (!isRecord(initialRoom)) {
    throw new Error("The shared game does not exist.");
  }
  let initialRoomAvailable = true;
  const execution: {
    outcome?: RoomRecoveryResult;
    failure?: Error;
  } = {};
  const result = await runTransaction(
    roomRef,
    (current: unknown) => {
      try {
        // The Web SDK may still begin a cold transaction with a cache `null`
        // even after `get()`. Seed only that first invocation from the verified
        // read. Any later `null` is an authoritative deletion and must abort.
        const room =
          current === null && initialRoomAvailable ? initialRoom : current;
        initialRoomAvailable = false;
        const applied = applyLatestRoomRecovery(
          room,
          operationId,
          recoveredAt,
        );
        execution.outcome = applied.result;
        return applied.room;
      } catch (error) {
        execution.failure =
          error instanceof Error ? error : new Error(String(error));
        return undefined;
      }
    },
    { applyLocally: false },
  );
  if (execution.failure !== undefined) throw execution.failure;
  const outcome = execution.outcome;
  if (outcome === undefined) {
    throw new Error("The shared game could not be recovered.");
  }
  if (!result.committed && outcome.recovered) {
    throw new Error("The shared game changed before recovery could commit.");
  }
  return outcome;
}

export function recoveryUrlFor(
  roomId: RoomId,
  databaseMode: DatabaseMode,
  baseUrl: string = window.location.origin,
): string {
  const url = new URL("/recover", baseUrl);
  url.searchParams.set("game", roomId);
  if (databaseMode === "realtime") url.searchParams.set("realtime", "1");
  return url.toString();
}

export function recoveredRoomUrl(
  roomId: RoomId,
  databaseMode: DatabaseMode,
  checkpoint: RoomRecoveryCheckpoint,
  baseUrl: string = window.location.origin,
): string {
  const url = new URL(checkpoint.sourcePath, baseUrl);
  url.searchParams.set("game", roomId);
  if (databaseMode === "realtime") url.searchParams.set("realtime", "1");
  return url.toString();
}
