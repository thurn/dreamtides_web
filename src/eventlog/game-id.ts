// Game and client identities for the event log: the `?game=` id that keys a
// local game's persisted log, and the actor id of the game's local player.
// Pure and IO-free.

import {
  parseClientId,
  parseRoomId,
  type ClientId,
  type RoomId,
} from "../types/identifiers";

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
): RoomId {
  if (
    !Number.isInteger(length) ||
    length < MIN_ROOM_ID_LENGTH ||
    length > MAX_ROOM_ID_LENGTH
  ) {
    throw new Error(
      "Room id length must be an integer between 4 and 24 characters.",
    );
  }

  const bytes = randomBytes(length);
  return parseRoomId(
    Array.from(
      bytes,
      (byte) => ROOM_ID_ALPHABET[byte % ROOM_ID_ALPHABET.length],
    ).join(""),
  );
}

/** Whether `roomId` is 4-24 lowercase alphanumeric characters. */
export function isValidRoomId(value: unknown): value is RoomId {
  return typeof value === "string" && ROOM_ID_PATTERN.test(value);
}

/**
 * Trims and lowercases `roomId`, returning the normalized id when it is
 * valid or `null` otherwise (including when `roomId` is `null`).
 */
export function normalizeRoomId(value: string | null): RoomId | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return isValidRoomId(normalized) ? parseRoomId(normalized) : null;
}

// ---------------------------------------------------------------------------
// clientId
// ---------------------------------------------------------------------------

/**
 * Mints a fresh client id. A local game mints one when it is created and
 * persists it as the game's single local player.
 */
export function mintClientId(
  randomBytes: RandomBytes = defaultRandomBytes,
): ClientId {
  return parseClientId(generateRoomId(randomBytes, MAX_ROOM_ID_LENGTH));
}
