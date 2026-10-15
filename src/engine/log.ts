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
 * | a settled `scoreGroup` event | `engine.scoreGroup`, with side and positive count |
 * | a new loop on offer; `loopStarted`, `loopEnded` events | `engine.loop` |
 * | random-stream counters advanced by a step | `engine.rng`, one per stream |
 * | a bonus-attributed `cardCopied` event | `engine.copyBonus`, with its primary, physical modifier source and captured ability origin |
 * | a `winConditionMet` event | `engine.winCondition` |
 * | a `dreamwellDrawn` event | `engine.dreamwell`, with UUID, side and energy |
 * | an `effectStarted` event whose character gains another card's abilities | `engine.abilitiesGained` |
 * | an `effectStarted` event whose character loses all its abilities | `engine.abilitiesLost`, with its card, source, and expiry |
 * | a bounded chosen-hand banishment's `effectStarted` event | `engine.banishReturnStarted`, with its physical source, card, entry and expiry |
 * | a selective-disabling `effectStarted` event | `engine.abilitiesDisabled`, with its physical source, target, mode and expiry |
 * | a first-materialization keyword `effectStarted` event | `engine.firstMaterializationKeyword`, with its physical member, source, player, keyword and permanent expiry |
 * | an `effectEnded` event | `engine.effectEnded`, correlated with its start by effect id |
 * | an `openingHandCompleted` event | `engine.openingHandCompleted`, with only its side |
 * | a `handEmptied` event | `engine.handEmptied`, with only the hand holder |
 * | a `returnedToHand` event | `engine.returnedToHand`, correlated by physical instance |
 * | a `battleEnded` event | `engine.battleEnded` |
 * | a `feasibilityBounded` event; a play or activation a decision leaves out because its legality search spent its budget (`ApplyResult.bounded`) | `engine.feasibility` |
 * | a step that threw | `engine.error` |
 *
 * The action and answer records replay the battle from its init; the rest
 * explain what the replay does.
 */
import type { EngineEvent, EventOf } from "./events";
import type { LoopId } from "./loops/types";
import type { Answer, Prompt, PromptFingerprint, PromptId, PromptRole, PromptSource } from "./prompts/types";
import type { Action } from "./rules/actions";
import type { BoundedLegality } from "./rules/legality";
import type { CardId, Side } from "./state/ids";
import type { BattleInit, BattleResult, BattleState } from "./state/types";
import type { Step } from "./steps/kinds";
import type { RecordedAnswer } from "./steps/types";
import type { GameId } from "../types/identifiers";

interface RecordBase {
  /** The committed state version the step started from. */
  readonly version: number;
}

export type EngineLogRecord =
  | (RecordBase & { readonly event: "engine.openingHandCompleted"; readonly detail: EventOf<"openingHandCompleted"> })
  | (RecordBase & { readonly event: "engine.scoreGroup"; readonly detail: EventOf<"scoreGroup"> })
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
      readonly source: PromptSource | null;
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
  | (RecordBase & { readonly event: "engine.copyBonus"; readonly detail: EventOf<"cardCopied"> & { readonly bonusFrom: NonNullable<EventOf<"cardCopied">["bonusFrom"]> } })
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
  | (RecordBase & { readonly event: "engine.extraTurn"; readonly detail: EventOf<"extraTurnGranted"> })
  | (RecordBase & { readonly event: "engine.dreamwell"; readonly detail: EventOf<"dreamwellDrawn"> })
  | (RecordBase & { readonly event: "engine.winCondition"; readonly detail: EventOf<"winConditionMet"> })
  /** The character, the card whose abilities it gained (by UUID and variant), its source, and when the gain ends. */
  | (RecordBase & { readonly event: "engine.abilitiesGained"; readonly detail: EventOf<"effectStarted"> })
  | (RecordBase & { readonly event: "engine.abilitiesDisabled"; readonly detail: EventOf<"effectStarted"> })
  | (RecordBase & { readonly event: "engine.abilitiesLost"; readonly detail: EventOf<"effectStarted"> })
  | (RecordBase & { readonly event: "engine.banishReturnStarted"; readonly detail: EventOf<"effectStarted"> })
  | (RecordBase & { readonly event: "engine.firstMaterializationKeyword"; readonly detail: EventOf<"effectStarted"> })
  | (RecordBase & { readonly event: "engine.effectEnded"; readonly detail: EventOf<"effectEnded"> })
  | (RecordBase & { readonly event: "engine.revealed"; readonly detail: EventOf<"revealed"> })
  | (RecordBase & { readonly event: "engine.handEmptied"; readonly detail: EventOf<"handEmptied"> })
  | (RecordBase & { readonly event: "engine.returnedToHand"; readonly detail: EventOf<"returnedToHand"> })
  | (RecordBase & { readonly event: "engine.battleEnded"; readonly result: BattleResult })
  | (RecordBase & {
      readonly event: "engine.feasibility";
      /** A prompt that withheld answers its search could not prove, or a candidate step legality left out unproven. */
      readonly detail: EventOf<"feasibilityBounded"> | { readonly kind: "legalityBounded"; readonly side: Side; readonly step: Step };
    })
  | (RecordBase & { readonly event: "engine.error"; readonly step: Step; readonly message: string });

/** One written log line: a record plus what the host adds. */
export type EngineLogLine = EngineLogRecord & { readonly gameId: GameId; readonly timestamp: string };

export function engineLogLine(record: EngineLogRecord, gameId: GameId, timestamp: string): EngineLogLine {
  return { ...record, gameId, timestamp };
}

/** The record an engine event maps to, or `null` for an event the log leaves to replay. */
export function eventLogRecord(event: EngineEvent, version: number): EngineLogRecord | null {
  switch (event.kind) {
    case "openingHandCompleted":
      return { event: "engine.openingHandCompleted", version, detail: event };
    case "scoreGroup":
      return { event: "engine.scoreGroup", version, detail: event };
    case "cardCopied":
      return event.bonusFrom === undefined ? null : { event: "engine.copyBonus", version, detail: { ...event, bonusFrom: event.bonusFrom } };
    case "triggerQueued":
    case "triggerResolved":
      return { event: "engine.trigger", version, detail: event };
    case "loopStarted":
    case "loopEnded":
      return { event: "engine.loop", version, detail: event };
    case "extraTurnGranted":
      return { event: "engine.extraTurn", version, detail: event };
    case "dreamwellDrawn":
      return { event: "engine.dreamwell", version, detail: event };
    case "winConditionMet":
      return { event: "engine.winCondition", version, detail: event };
    case "effectStarted":
      if (event.change.kind === "firstMaterializationKeyword") return { event: "engine.firstMaterializationKeyword", version, detail: event };
      if (event.change.kind === "disableTriggers") return { event: "engine.abilitiesDisabled", version, detail: event };
      if (event.change.kind === "banishedToHandUntil") return { event: "engine.banishReturnStarted", version, detail: event };
      if (event.change.kind === "loseAbilities") return { event: "engine.abilitiesLost", version, detail: event };
      return event.change.kind === "abilities" ? { event: "engine.abilitiesGained", version, detail: event } : null;
    case "effectEnded":
      return { event: "engine.effectEnded", version, detail: event };
    case "revealed":
      return { event: "engine.revealed", version, detail: event };
    case "handEmptied":
      return { event: "engine.handEmptied", version, detail: event };
    case "returnedToHand":
      return { event: "engine.returnedToHand", version, detail: event };
    case "battleEnded":
      return { event: "engine.battleEnded", version, result: event.result };
    case "feasibilityBounded":
      return { event: "engine.feasibility", version, detail: event };
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

/**
 * The `engine.feasibility` records for plays and activations decisions left
 * out because their legality search spent its budget (`boundedLegality`,
 * `ApplyResult.bounded`).
 */
export function legalityLogRecords(bounded: readonly BoundedLegality[]): EngineLogRecord[] {
  return bounded.map(({ version, side, step }) => ({ event: "engine.feasibility", version, detail: { kind: "legalityBounded", side, step } }));
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
