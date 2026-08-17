import type { ContentConfig, EncodedLogNode, Genesis } from "./types";
import { parseFoldHash } from "../types/content-hash";
import { parseReducerVersion } from "../types/reducer-version";
import { journeySeedFromUnknown } from "../types/journey-seed";

/** A validated RTDB log envelope whose native-tree values remain untrusted. */
export interface RtdbLogNode {
  genesis: Genesis;
  encodedGenesis: string;
  generation: number;
  baseSeq: number;
  baseSnapshot: string | null;
  head: number;
  events: Record<number, unknown>;
  appliedIndex?: string;
  intentKeyIndex?: string;
  compactionError?: EncodedLogNode["compactionError"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFoldHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function decodeContentConfig(value: unknown): ContentConfig | undefined | null {
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

/** Parse and validate the JSON-encoded room genesis stored by RTDB. */
export function decodeGenesis(raw: unknown): Genesis | null {
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

function decodeSnapshot(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    return undefined;
  }
}

function decodeEvents(raw: unknown): Record<number, unknown> | null {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object") return null;
  const events: Record<number, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const seq = Number(key);
    if (Number.isInteger(seq) && seq >= 0 && value !== null) {
      events[seq] = value;
    }
  }
  return events;
}

function decodeCompactionError(
  raw: unknown,
): EncodedLogNode["compactionError"] {
  if (!isRecord(raw)) return undefined;
  const { head, baseSeq, attemptedBaseSeq, message } = raw;
  if (
    !Number.isInteger(head) ||
    !Number.isInteger(baseSeq) ||
    !Number.isInteger(attemptedBaseSeq) ||
    typeof message !== "string"
  ) {
    return undefined;
  }
  return {
    head: head as number,
    baseSeq: baseSeq as number,
    attemptedBaseSeq: attemptedBaseSeq as number,
    message,
  };
}

/**
 * Normalize Firebase's native-tree representation into one validated envelope.
 * RTDB may omit null/empty children and may return dense integer keys as an
 * array, so neither representation is trusted as an application type.
 */
export function decodeRtdbLogNode(raw: unknown): RtdbLogNode | null {
  if (!isRecord(raw)) return null;
  const genesis = decodeGenesis(raw.genesis);
  const baseSnapshot = decodeSnapshot(raw.baseSnapshot);
  const events = decodeEvents(raw.events);
  const generation = raw.generation ?? 0;
  if (
    genesis === null ||
    !isNonNegativeSafeInteger(generation) ||
    !Number.isInteger(raw.baseSeq) ||
    (raw.baseSeq as number) < 0 ||
    !Number.isInteger(raw.head) ||
    (raw.head as number) < (raw.baseSeq as number) ||
    baseSnapshot === undefined ||
    ((raw.baseSeq as number) > 0 && baseSnapshot === null) ||
    events === null
  ) {
    return null;
  }
  const compactionError = decodeCompactionError(raw.compactionError);
  return {
    genesis,
    encodedGenesis: raw.genesis as string,
    generation,
    baseSeq: raw.baseSeq as number,
    baseSnapshot,
    head: raw.head as number,
    events,
    ...(typeof raw.appliedIndex === "string"
      ? { appliedIndex: raw.appliedIndex }
      : {}),
    ...(typeof raw.intentKeyIndex === "string"
      ? { intentKeyIndex: raw.intentKeyIndex }
      : {}),
    ...(compactionError === undefined ? {} : { compactionError }),
  };
}

/**
 * Decode the stricter shape required by an append transaction. A missing live
 * sequence is unreadable; a present non-string value becomes a deterministic
 * invalid-event string so the subscriber bounces that sequence while later
 * appends remain possible.
 */
export function decodeAppendableLogNode(raw: unknown): EncodedLogNode | null {
  const node = decodeRtdbLogNode(raw);
  if (node === null) return null;
  const events: Record<number, string> = {};
  for (let seq = node.baseSeq + 1; seq <= node.head; seq += 1) {
    if (!Object.prototype.hasOwnProperty.call(node.events, seq)) return null;
    const value = node.events[seq];
    events[seq] =
      typeof value === "string"
        ? value
        : JSON.stringify({
            __malformedRtdbEvent: true,
            raw: value,
          });
  }
  return {
    genesis: node.encodedGenesis,
    generation: node.generation,
    baseSeq: node.baseSeq,
    baseSnapshot: node.baseSnapshot,
    head: node.head,
    events,
    ...(node.appliedIndex === undefined
      ? {}
      : { appliedIndex: node.appliedIndex }),
    ...(node.intentKeyIndex === undefined
      ? {}
      : { intentKeyIndex: node.intentKeyIndex }),
    ...(node.compactionError === undefined
      ? {}
      : { compactionError: node.compactionError }),
  };
}
