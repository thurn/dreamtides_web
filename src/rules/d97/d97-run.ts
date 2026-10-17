// The D97 run lifecycle cases. Each is a pure `(d97, payload, ctx)` function
// returning the next slice with its log records, or null to bounce.

import type { EventContext, ReducerLogRecord } from "../../eventlog/types";
import {
  avatarIdFromUnknown,
  parseD97RunId,
  parseD97RunSeed,
} from "../../types/identifiers";
import { d97ContentProvider } from "./d97-content";
import type { D97State } from "./d97-state";

/** A D97 case's applied result. */
export interface D97Transition {
  readonly d97: D97State;
  readonly logRecords: readonly ReducerLogRecord[];
}

/** Hex digits of one [0, 1) draw, at its full 52-bit precision. */
function drawHex(value: number): string {
  return Math.floor(value * 0x10000000000000)
    .toString(16)
    .padStart(13, "0");
}

/**
 * `D97_START_RUN { avatarId }` starts the run on the overworld with any
 * roster Avatar. The run's id comes from the event's seq and its seed from
 * the event's random stream, so both are recorded outcomes of this event.
 */
export function startRun(
  d97: D97State,
  payload: Record<string, unknown>,
  ctx: EventContext,
): D97Transition | null {
  if (d97.run !== null || d97.screen.type !== "avatarSelect") return null;
  const avatarId = avatarIdFromUnknown(payload.avatarId);
  const content = d97ContentProvider();
  if (avatarId === null || content === null || !content.avatarIds.has(avatarId)) {
    return null;
  }
  const run = {
    runId: parseD97RunId(`event:${String(ctx.seq)}`),
    runSeed: parseD97RunSeed(`${drawHex(ctx.rng(0))}${drawHex(ctx.rng(1))}`),
    avatarId,
    startedAt: ctx.timestamp,
  };
  return {
    d97: { screen: { type: "overworld" }, run },
    logRecords: [
      {
        event: "d97_run_started",
        fields: {
          runId: run.runId,
          runSeed: run.runSeed,
          avatarId: run.avatarId,
        },
      },
    ],
  };
}
