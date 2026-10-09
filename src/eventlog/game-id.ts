// Game and client identities for the event log: the `?game=` id that keys a
// local game's persisted log, and the actor id of the game's local player.
// Pure and IO-free.

import {
  parseClientId,
  parseGameId,
  type ClientId,
  type GameId,
} from "../types/identifiers";

// Excludes visually-ambiguous characters (0/O, 1/l) so ids read cleanly
// aloud/typed by hand.
const GAME_ID_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";
const DEFAULT_GAME_ID_LENGTH = 6;
const MIN_GAME_ID_LENGTH = 4;
const MAX_GAME_ID_LENGTH = 24;
const GAME_ID_PATTERN = /^[a-z0-9]{4,24}$/;

export type RandomBytes = (length: number) => Uint8Array;

function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Generates a fresh game id: `length` (default 6) lowercase-alphanumeric characters. */
export function generateGameId(
  randomBytes: RandomBytes = defaultRandomBytes,
  length = DEFAULT_GAME_ID_LENGTH,
): GameId {
  if (
    !Number.isInteger(length) ||
    length < MIN_GAME_ID_LENGTH ||
    length > MAX_GAME_ID_LENGTH
  ) {
    throw new Error(
      "Game id length must be an integer between 4 and 24 characters.",
    );
  }

  const bytes = randomBytes(length);
  return parseGameId(
    Array.from(
      bytes,
      (byte) => GAME_ID_ALPHABET[byte % GAME_ID_ALPHABET.length],
    ).join(""),
  );
}

/** Whether `value` is 4-24 lowercase alphanumeric characters. */
export function isValidGameId(value: unknown): value is GameId {
  return typeof value === "string" && GAME_ID_PATTERN.test(value);
}

/**
 * Trims and lowercases `value`, returning the normalized id when it is
 * valid or `null` otherwise (including when `value` is `null`).
 */
export function normalizeGameId(value: string | null): GameId | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return isValidGameId(normalized) ? parseGameId(normalized) : null;
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
  return parseClientId(generateGameId(randomBytes, MAX_GAME_ID_LENGTH));
}
