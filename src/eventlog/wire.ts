// The stored encoding of a game's genesis and events: JSON strings decoded
// and validated at the storage boundary, so nested game state round-trips
// byte-exactly.

import {
  parseEventActor,
  parseEventType,
  type GameEvent,
  type Genesis,
  type StoredContentConfig,
  type StoredGenesis,
} from "./types";
import { parseIntentKey } from "../types/identifiers";
import { parseFoldHash } from "../types/content-hash";
import { parseReducerVersion } from "../types/reducer-version";
import { journeySeedFromUnknown } from "../types/journey-seed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFoldHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function decodeContentConfig(
  value: unknown,
): StoredContentConfig | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const {
    poolVariant,
    atlasFoldHash,
    sitesFoldHash,
    draftFoldHash,
    cardRolesFoldHash,
    economyFoldHash,
    gambleFoldHash,
    transfigurationFoldHash,
    rewardSelectionFoldHash,
    auguryFoldHash,
    explorationFoldHash,
    tutorialFoldHash,
    opponentsFoldHash,
    defaultStartingEssence,
    dreamsignCap,
  } = value;
  if (
    poolVariant !== "tides4" ||
    !(atlasFoldHash === undefined || isFoldHash(atlasFoldHash)) ||
    !(sitesFoldHash === undefined || isFoldHash(sitesFoldHash)) ||
    !(draftFoldHash === undefined || isFoldHash(draftFoldHash)) ||
    !(
      cardRolesFoldHash === undefined || isFoldHash(cardRolesFoldHash)
    ) ||
    !(economyFoldHash === undefined || isFoldHash(economyFoldHash)) ||
    !(gambleFoldHash === undefined || isFoldHash(gambleFoldHash)) ||
    !(
      transfigurationFoldHash === undefined ||
      isFoldHash(transfigurationFoldHash)
    ) ||
    !(
      rewardSelectionFoldHash === undefined ||
      isFoldHash(rewardSelectionFoldHash)
    ) ||
    !(auguryFoldHash === undefined || isFoldHash(auguryFoldHash)) ||
    !(
      explorationFoldHash === undefined ||
      isFoldHash(explorationFoldHash)
    ) ||
    !(tutorialFoldHash === undefined || isFoldHash(tutorialFoldHash)) ||
    !(
      opponentsFoldHash === undefined || isFoldHash(opponentsFoldHash)
    ) ||
    !(
      defaultStartingEssence === undefined ||
      isNonNegativeSafeInteger(defaultStartingEssence)
    ) ||
    !(dreamsignCap === undefined || isNonNegativeSafeInteger(dreamsignCap))
  ) {
    return null;
  }
  return {
    poolVariant,
    ...(atlasFoldHash === undefined ? {} : { atlasFoldHash: parseFoldHash(atlasFoldHash) }),
    ...(sitesFoldHash === undefined ? {} : { sitesFoldHash: parseFoldHash(sitesFoldHash) }),
    ...(draftFoldHash === undefined ? {} : { draftFoldHash: parseFoldHash(draftFoldHash) }),
    ...(cardRolesFoldHash === undefined ? {} : { cardRolesFoldHash: parseFoldHash(cardRolesFoldHash) }),
    ...(economyFoldHash === undefined ? {} : { economyFoldHash: parseFoldHash(economyFoldHash) }),
    ...(gambleFoldHash === undefined ? {} : { gambleFoldHash: parseFoldHash(gambleFoldHash) }),
    ...(transfigurationFoldHash === undefined
      ? {}
      : { transfigurationFoldHash: parseFoldHash(transfigurationFoldHash) }),
    ...(rewardSelectionFoldHash === undefined
      ? {}
      : { rewardSelectionFoldHash: parseFoldHash(rewardSelectionFoldHash) }),
    ...(auguryFoldHash === undefined ? {} : { auguryFoldHash: parseFoldHash(auguryFoldHash) }),
    ...(explorationFoldHash === undefined ? {} : { explorationFoldHash: parseFoldHash(explorationFoldHash) }),
    ...(tutorialFoldHash === undefined ? {} : { tutorialFoldHash: parseFoldHash(tutorialFoldHash) }),
    ...(opponentsFoldHash === undefined ? {} : { opponentsFoldHash: parseFoldHash(opponentsFoldHash) }),
    ...(defaultStartingEssence === undefined ? {} : { defaultStartingEssence }),
    ...(dreamsignCap === undefined ? {} : { dreamsignCap }),
  };
}

/** Parse and validate a stored JSON-encoded game genesis. */
export function decodeGenesis(raw: unknown): StoredGenesis | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { seed, reducerVersion, createdAt, frontDoorEntry } = parsed;
  const journeySeed = journeySeedFromUnknown(seed);
  if (
    journeySeed === null ||
    typeof reducerVersion !== "string" ||
    reducerVersion.trim() === "" ||
    typeof createdAt !== "number" ||
    !Number.isFinite(createdAt) ||
    !(
      frontDoorEntry === undefined ||
      frontDoorEntry === "main" ||
      frontDoorEntry === "loading" ||
      frontDoorEntry === "tutorial"
    )
  ) {
    return null;
  }
  const contentConfig = decodeContentConfig(parsed.contentConfig);
  if (contentConfig === null) return null;
  return {
    seed: journeySeed,
    reducerVersion: parseReducerVersion(reducerVersion),
    createdAt,
    ...(frontDoorEntry === undefined ? {} : { frontDoorEntry }),
    ...(contentConfig === undefined ? {} : { contentConfig }),
  };
}

/** Whether a stored genesis carries every content field the fold reads. */
export function isFoldableGenesis(genesis: StoredGenesis): genesis is Genesis {
  const config = genesis.contentConfig;
  return (
    config !== undefined &&
    config.defaultStartingEssence !== undefined &&
    config.dreamsignCap !== undefined
  );
}

/** Encodes a decoded event to the JSON string a log stores per seq. */
export function encodeEvent(event: GameEvent): string {
  return JSON.stringify(event);
}

/** Decodes a stored event JSON string back into a `GameEvent`. */
export function decodeEvent(raw: string): GameEvent {
  const parsed = JSON.parse(raw) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error("event must be an object");
  }
  const event = parsed as Record<string, unknown>;
  const payload = event.payload;
  if (
    typeof event.type !== "string" ||
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    typeof event.actor !== "string" ||
    typeof event.clientTimestamp !== "string" ||
    typeof event.basedOnSeq !== "number" ||
    (event.intentKey !== undefined && typeof event.intentKey !== "string")
  ) {
    throw new Error("event has an invalid shape");
  }
  return {
    type: parseEventType(event.type),
    payload: payload as Record<string, unknown>,
    actor: parseEventActor(event.actor),
    clientTimestamp: event.clientTimestamp,
    basedOnSeq: event.basedOnSeq,
    ...(event.intentKey === undefined
      ? {}
      : { intentKey: parseIntentKey(event.intentKey) }),
  };
}
