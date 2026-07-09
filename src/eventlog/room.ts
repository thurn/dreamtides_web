// Room lifecycle for the event-sourcing engine: room ids, create-with-
// eviction, presence, genesis write.
//
// This is a from-scratch rewrite matching the OBSERVABLE behavior of the
// legacy `src/multiplayer/room-id.ts` / `src/multiplayer/room-service.ts`
// (id alphabet/length, normalization, stale-room eviction, presence
// semantics), not an import of that code — the engine stays decoupled from
// src/multiplayer/. Firebase IS allowed here (the firebase ban applies only
// to src/rules/).
//
// See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
// §"The eventlog engine" → "Room lifecycle" and §"Data model" (RTDB schema).

import {
  type Database,
  get,
  onDisconnect,
  ref,
  set,
  update,
} from "firebase/database";
import type { EncodedLogNode, Genesis } from "./types";

// ---------------------------------------------------------------------------
// Room ids
// ---------------------------------------------------------------------------

// Excludes visually-ambiguous characters (0/O, 1/l) — matches the legacy
// alphabet so ids read cleanly aloud/typed by hand.
const ROOM_ID_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";
const DEFAULT_ROOM_ID_LENGTH = 6;
const MIN_ROOM_ID_LENGTH = 4;
const MAX_ROOM_ID_LENGTH = 24;
const ROOM_ID_PATTERN = /^[a-z0-9]{4,24}$/;

export type RandomBytes = (length: number) => Uint8Array;

function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Generates a fresh room id: `length` (default 6) lowercase-alphanumeric characters. */
export function generateRoomId(
  randomBytes: RandomBytes = defaultRandomBytes,
  length = DEFAULT_ROOM_ID_LENGTH,
): string {
  if (
    !Number.isInteger(length) ||
    length < MIN_ROOM_ID_LENGTH ||
    length > MAX_ROOM_ID_LENGTH
  ) {
    throw new Error("Room id length must be an integer between 4 and 24 characters.");
  }

  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => ROOM_ID_ALPHABET[byte % ROOM_ID_ALPHABET.length]).join("");
}

/** Whether `roomId` is 4-24 lowercase alphanumeric characters. */
export function isValidRoomId(roomId: string): boolean {
  return ROOM_ID_PATTERN.test(roomId);
}

/**
 * Trims and lowercases `roomId`, returning the normalized id when it is
 * valid or `null` otherwise (including when `roomId` is `null`).
 */
export function normalizeRoomId(roomId: string | null): string | null {
  if (roomId === null) {
    return null;
  }

  const normalized = roomId.trim().toLowerCase();
  return isValidRoomId(normalized) ? normalized : null;
}

// ---------------------------------------------------------------------------
// clientId
// ---------------------------------------------------------------------------

/**
 * Mints a fresh client id. Called once per tab/connection and NEVER
 * persisted (e.g. to localStorage): the self-chain CAS exemption assumes one
 * optimistic view per actor, and two tabs sharing an id would violate it.
 */
export function mintClientId(randomBytes: RandomBytes = defaultRandomBytes): string {
  return generateRoomId(randomBytes, MAX_ROOM_ID_LENGTH);
}

// ---------------------------------------------------------------------------
// Genesis write
// ---------------------------------------------------------------------------

function roomLogPath(roomId: string): string {
  return `rooms/${roomId}/log`;
}

/**
 * Builds the initial `EncodedLogNode` for a brand-new room: no events yet. The
 * genesis (including its pinned `contentConfig`) is serialized verbatim, so
 * this is what `createRoom` / `createRoomEvictingStale` write to RTDB.
 */
export function genesisLogNode(genesis: Genesis): EncodedLogNode {
  return {
    genesis: JSON.stringify(genesis),
    baseSeq: 0,
    baseSnapshot: null,
    head: 0,
    events: {},
  };
}

/**
 * Creates a room by writing its `log/` node in one update: `genesis`
 * (encoded), `baseSeq: 0`, `baseSnapshot: null`, `head: 0`, no events.
 */
export async function createRoom(
  database: Database,
  roomId: string,
  genesis: Genesis,
): Promise<void> {
  await set(ref(database, roomLogPath(roomId)), genesisLogNode(genesis));
}

// ---------------------------------------------------------------------------
// Stale-room eviction
// ---------------------------------------------------------------------------

/**
 * How long a room is preserved after creation, in milliseconds. Rooms whose
 * `genesis.createdAt` is older than this window are evicted by
 * `createRoomEvictingStale` whenever a fresh room is created.
 */
export const ROOM_PRESERVATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Decides whether a sibling room's raw `log/genesis` string is stale enough
 * to evict when a new room is created. `rawGenesis` is whatever is currently
 * stored at `rooms/{id}/log/genesis` (a JSON string per `EncodedLogNode`, or
 * `undefined`/`null` if the field is missing).
 *
 * A room is evictable only when its genesis parses and its `createdAt`
 * parses to a finite epoch-millisecond timestamp older than
 * `windowMs`. Any room whose genesis is missing, not valid JSON, or whose
 * `createdAt` is not a finite number is PRESERVED — eviction must never eat
 * a room it cannot understand.
 */
export function shouldEvict(
  rawGenesis: unknown,
  nowMs: number,
  windowMs: number = ROOM_PRESERVATION_WINDOW_MS,
): boolean {
  if (typeof rawGenesis !== "string" || rawGenesis.length === 0) {
    return false;
  }

  let genesis: Partial<Genesis>;
  try {
    genesis = JSON.parse(rawGenesis) as Partial<Genesis>;
  } catch {
    return false;
  }

  if (genesis === null || typeof genesis !== "object") {
    return false;
  }

  const createdAt = genesis.createdAt;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
    return false;
  }

  return nowMs - createdAt > windowMs;
}

/**
 * Creates a new room while preserving every sibling room created within the
 * last 24 hours (or whose genesis cannot be parsed). Reads the current
 * `rooms/` snapshot, then writes a single multi-path `update()` that creates
 * the new room's `log/` node and `null`s out only the stale siblings.
 */
export async function createRoomEvictingStale(
  database: Database,
  roomId: string,
  genesis: Genesis,
  nowMs: number = Date.now(),
): Promise<void> {
  const roomsRef = ref(database, "rooms");
  const snapshot = await get(roomsRef);
  const existingRooms = snapshot.exists()
    ? (snapshot.val() as Record<string, { log?: { genesis?: unknown } }> | null)
    : null;

  const updateMap: Record<string, unknown> = {
    [`${roomId}/log`]: genesisLogNode(genesis),
  };

  if (existingRooms !== null) {
    for (const [existingId, existingRoom] of Object.entries(existingRooms)) {
      if (existingId === roomId) {
        continue;
      }
      const rawGenesis = existingRoom?.log?.genesis;
      if (shouldEvict(rawGenesis, nowMs)) {
        updateMap[existingId] = null;
      }
    }
  }

  await update(roomsRef, updateMap);
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

export interface PresenceEntry {
  connected: boolean;
  lastSeenAt: string;
}

function presencePath(roomId: string, clientId: string): string {
  return `rooms/${roomId}/presence/${clientId}`;
}

/**
 * Writes this client's presence entry and registers an `onDisconnect`
 * cleanup that removes it when the connection drops.
 */
export async function writePresence(
  database: Database,
  roomId: string,
  clientId: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  const entryRef = ref(database, presencePath(roomId, clientId));
  const entry: PresenceEntry = { connected: true, lastSeenAt: nowIso };

  await onDisconnect(entryRef).remove();
  await set(entryRef, entry);
}

/**
 * Number of clients currently connected to a room, counted from a
 * `presence/` snapshot's entries flagged `connected`.
 */
export function connectedClientCount(
  presence: Record<string, PresenceEntry> | null | undefined,
): number {
  if (presence === null || presence === undefined) {
    return 0;
  }
  return Object.values(presence).filter((entry) => entry.connected).length;
}
