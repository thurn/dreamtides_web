/**
 * The engine logging schema (workflow § Logging). The engine stays pure: it
 * emits events and never calls a logger. A host (the fold adapter, the
 * worker host, the fuzzer, or the tournament runner) builds these records
 * from what the engine returns and writes each one as a log line, adding
 * the game ID and a timestamp (`EngineLogLine`). Records carry instance IDs
 * and catalog UUIDs, never names.
 *
 * What a host records:
 *
 * | Source | Record |
 * | --- | --- |
 * | the battle's init | `engine.battleStarted` |
 * | a completed top-level action | `engine.action`, with every answer it took |
 * | a prompt raised to a player | `engine.promptOpened` |
 * | an answer to it | `engine.promptAnswered` |
 * | a cancel | `engine.promptCancelled` |
 * | `triggerQueued`, `triggerResolved` events | `engine.trigger` |
 * | a new loop on offer; `loopStarted`, `loopEnded` events | `engine.loop` |
 * | random-stream counters advanced by a step | `engine.rng`, one per stream |
 * | a `battleEnded` event | `engine.battleEnded` |
 * | a step that threw | `engine.error` |
 *
 * The action and answer records replay the battle from its init; the rest
 * explain what the replay does.
 */
import type { EngineEvent, EventOf } from "./events";
import type { LoopId } from "./loops/types";
import type { Answer, Prompt, PromptFingerprint, PromptId, PromptRole } from "./prompts/types";
import type { Action } from "./rules/actions";
import type { CardId, InstanceId, Side } from "./state/ids";
import type { BattleInit, BattleResult, BattleState } from "./state/types";
import type { Step } from "./steps/kinds";
import type { RecordedAnswer } from "./steps/types";
import type { GameId } from "../types/identifiers";

interface RecordBase {
  /** The committed state version the step started from. */
  readonly version: number;
}

export type EngineLogRecord =
  | (RecordBase & {
      readonly event: "engine.battleStarted";
      readonly init: BattleInit;
      /** The policy playing each side, when the host knows it (`random`, `human`, …). */
      readonly policies?: Readonly<Record<Side, string>>;
    })
  | (RecordBase & {
      readonly event: "engine.action";
      readonly side: Side;
      readonly action: Action;
      /** Every answer the action's step took, automatic ones included, in order. */
      readonly answers: readonly RecordedAnswer[];
    })
  | (RecordBase & {
      readonly event: "engine.promptOpened";
      readonly promptId: PromptId | null;
      readonly side: Side;
      readonly kind: Prompt["kind"];
      readonly role: PromptRole;
      readonly source: InstanceId | null;
      readonly cardId: CardId | null;
      readonly privateTo: Side | null;
      readonly fingerprint: PromptFingerprint;
    })
  | (RecordBase & {
      readonly event: "engine.promptAnswered";
      readonly promptId: PromptId | null;
      readonly side: Side;
      readonly fingerprint: PromptFingerprint;
      readonly value: Answer;
    })
  | (RecordBase & { readonly event: "engine.promptCancelled"; readonly promptId: PromptId; readonly side: Side })
  | (RecordBase & { readonly event: "engine.trigger"; readonly detail: EventOf<"triggerQueued"> | EventOf<"triggerResolved"> })
  | (RecordBase & {
      readonly event: "engine.loop";
      readonly detail: EventOf<"loopStarted"> | EventOf<"loopEnded"> | { readonly kind: "loopOffered"; readonly side: Side; readonly loop: LoopId };
    })
  | (RecordBase & {
      readonly event: "engine.rng";
      /** The stream, which names its purpose: `shuffle:<side>`, `dreamwell`, `random:<purpose>`. */
      readonly stream: string;
      readonly draws: number;
    })
  | (RecordBase & { readonly event: "engine.battleEnded"; readonly result: BattleResult })
  | (RecordBase & { readonly event: "engine.error"; readonly step: Step; readonly message: string });

/** One written log line: a record plus what the host adds. */
export type EngineLogLine = EngineLogRecord & { readonly gameId: GameId; readonly timestamp: string };

export function engineLogLine(record: EngineLogRecord, gameId: GameId, timestamp: string): EngineLogLine {
  return { ...record, gameId, timestamp };
}

/** The record an engine event maps to, or `null` for an event the log leaves to replay. */
export function eventLogRecord(event: EngineEvent, version: number): EngineLogRecord | null {
  switch (event.kind) {
    case "triggerQueued":
    case "triggerResolved":
      return { event: "engine.trigger", version, detail: event };
    case "loopStarted":
    case "loopEnded":
      return { event: "engine.loop", version, detail: event };
    case "battleEnded":
      return { event: "engine.battleEnded", version, result: event.result };
    default:
      return null;
  }
}

/** The records for a step's events, in order. */
export function eventLogRecords(events: readonly EngineEvent[], version: number): EngineLogRecord[] {
  return events.flatMap((event) => {
    const record = eventLogRecord(event, version);
    return record === null ? [] : [record];
  });
}

/**
 * What a committed step changed that its events do not say: the random
 * draws it made, by stream, and a loop newly on offer.
 */
export function stepLogRecords(before: BattleState, after: BattleState): EngineLogRecord[] {
  const version = before.version;
  const records: EngineLogRecord[] = [];
  for (const stream of Object.keys(after.rng).sort()) {
    const draws = (after.rng[stream] ?? 0) - (before.rng[stream] ?? 0);
    if (draws > 0) records.push({ event: "engine.rng", version, stream, draws });
  }
  const offered = after.loops.candidate;
  if (offered !== null && offered.id !== before.loops.candidate?.id) {
    records.push({ event: "engine.loop", version, detail: { kind: "loopOffered", side: offered.side, loop: offered.id } });
  }
  return records;
}

export function promptOpenedRecord(
  prompt: Prompt,
  promptId: PromptId,
  fingerprint: PromptFingerprint,
  version: number,
): EngineLogRecord {
  return {
    event: "engine.promptOpened",
    version,
    promptId,
    side: prompt.side,
    kind: prompt.kind,
    role: prompt.purpose.role,
    source: prompt.purpose.source,
    cardId: prompt.purpose.cardId,
    privateTo: prompt.privateTo ?? null,
    fingerprint,
  };
}
