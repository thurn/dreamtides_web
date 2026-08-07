import type { ContentConfig, EncodedLogNode, Genesis } from "./types";

/** A validated RTDB log envelope whose native-tree values remain untrusted. */
export interface RtdbLogNode {
  genesis: Genesis;
  encodedGenesis: string;
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

function decodeContentConfig(value: unknown): ContentConfig | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const {
    poolVariant,
    draftMode,
    fresh20PackSize,
    atlasFoldHash,
    sitesFoldHash,
    draftFoldHash,
    economyFoldHash,
    rewardSelectionFoldHash,
    auguryFoldHash,
    explorationFoldHash,
    tutorialFoldHash,
    opponentsFoldHash,
    defaultStartingEssence,
    dreamsignCap,
  } = value;
  if (
    typeof poolVariant !== "string" ||
    typeof draftMode !== "string" ||
    !(
      fresh20PackSize === null ||
      (typeof fresh20PackSize === "number" && Number.isFinite(fresh20PackSize))
    ) ||
    !(atlasFoldHash === undefined || typeof atlasFoldHash === "string") ||
    !(sitesFoldHash === undefined || typeof sitesFoldHash === "string") ||
    !(draftFoldHash === undefined || typeof draftFoldHash === "string") ||
    !(economyFoldHash === undefined || typeof economyFoldHash === "string") ||
    !(
      rewardSelectionFoldHash === undefined ||
      typeof rewardSelectionFoldHash === "string"
    ) ||
    !(auguryFoldHash === undefined || typeof auguryFoldHash === "string") ||
    !(
      explorationFoldHash === undefined ||
      typeof explorationFoldHash === "string"
    ) ||
    !(tutorialFoldHash === undefined || typeof tutorialFoldHash === "string") ||
    !(
      opponentsFoldHash === undefined || typeof opponentsFoldHash === "string"
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
    draftMode,
    fresh20PackSize,
    ...(atlasFoldHash === undefined ? {} : { atlasFoldHash }),
    ...(sitesFoldHash === undefined ? {} : { sitesFoldHash }),
    ...(draftFoldHash === undefined ? {} : { draftFoldHash }),
    ...(economyFoldHash === undefined ? {} : { economyFoldHash }),
    ...(rewardSelectionFoldHash === undefined
      ? {}
      : { rewardSelectionFoldHash }),
    ...(auguryFoldHash === undefined ? {} : { auguryFoldHash }),
    ...(explorationFoldHash === undefined ? {} : { explorationFoldHash }),
    ...(tutorialFoldHash === undefined ? {} : { tutorialFoldHash }),
    ...(opponentsFoldHash === undefined ? {} : { opponentsFoldHash }),
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
  if (
    typeof seed !== "string" ||
    typeof reducerVersion !== "string" ||
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
    seed,
    reducerVersion,
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
  if (
    genesis === null ||
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
