// The D97 run lifecycle event (cases in ../d97-run.ts).

import {
  avatarIdFromUnknown,
  d97DreamIdFromUnknown,
  parseIntentKey,
  type AvatarId,
  type D97DreamId,
} from "../../../types/identifiers";
import { startRun } from "../d97-run";
import { d97Event } from "./spec";

/** `dreamId` omitted: the run starts in the content's default dream. */
function startRunPayload(raw: Record<string, unknown>): { avatarId: AvatarId; dreamId?: D97DreamId } | null {
  const avatarId = avatarIdFromUnknown(raw.avatarId);
  if (avatarId === null) return null;
  if (raw.dreamId === undefined) return { avatarId };
  const dreamId = d97DreamIdFromUnknown(raw.dreamId);
  return dreamId === null ? null : { avatarId, dreamId };
}

export const RUN_EVENTS = {
  // A game starts one run: repeated picks share the run's intent key.
  D97_START_RUN: d97Event({
    phase: "avatarSelect",
    parse: startRunPayload,
    fold: startRun,
    intentKey: () => parseIntentKey("d97-start-run"),
  }),
};
