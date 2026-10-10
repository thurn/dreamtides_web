// The engine battle of a journey battle in the fold (engine-design § Fold
// integration). `BEGIN_BATTLE` starts it from the engine init the battle-init
// provider builds; `BATTLE_ACTION`, `BATTLE_ANSWER`, and `BATTLE_CANCEL` fold
// the engine's intents (`battleAction`, `answer`, `cancel`) over its slice
// through the engine fold adapter. The slice is plain data, so a reload
// replays the log to the same committed state and the same suspended prompt.
//
// The adapter's engine log records are kept for the event being folded and
// handed to the host once (`takeEngineLogRecords`), which logs them only when
// that event applied, so a replay on reload never logs a battle twice.
//
// `replayEngineBattle` folds a battle's intents again from the event log, to
// recover what each applied intent published (the battle log's source); it
// counts only when it reproduces the fold's slice. The battle screen's
// presentation feed folds each applied intent again the same way: both read
// the intent with `engineIntentOfEvent`, fold it with `foldAdapterFor`, and
// take a batch's states with `batchStates`.

import type { Engine, EngineEvent, EngineLogRecord } from "../../engine";
import type { BattleInit as EngineBattleInit } from "../../engine";
import type { DebugOp } from "../../engine/debug/debug-actions";
import { engineDebugActions } from "../../engine/development";
import {
  createFoldAdapter,
  type BattleIntent,
  type BattleSlice,
  type FoldAdapter,
  type PendingPrompt,
} from "../../engine/fold/slice";
import type { Answer } from "../../engine/prompts/types";
import type { Action } from "../../engine/rules/actions";
import type { AbilitySource, InstanceId, Side, Slot } from "../../engine/state/ids";
import type { BattleResult as EngineBattleResult, BattleState } from "../../engine/state/types";
import { hashState } from "../../eventlog/hash";
import type { CommittedEvent } from "../../eventlog/local-log";
import type { EventContext, StateHash } from "../../eventlog/types";
import { parsePromptId, type PromptId } from "../../types/identifiers";
import type { FoldState } from "../fold-state";
import { journeyBattleOf, type BattleFoldState, type EngineBattleFold, type JourneyBattleFoldState } from "./fold";

/** The engine intents, by the event type that carries each. */
export type EngineIntentEventType = "BATTLE_ACTION" | "BATTLE_ANSWER" | "BATTLE_CANCEL";

const adapters = new WeakMap<Engine, FoldAdapter>();
let collecting: EngineLogRecord[] | null = null;
/**
 * The engine log records of recently folded events, by seq, oldest first.
 * A replay on reload folds events nobody takes, so only the newest are kept.
 */
const pendingLogs = new Map<number, readonly EngineLogRecord[]>();
const PENDING_LOG_LIMIT = 64;

function keepLog(seq: number, records: readonly EngineLogRecord[]): void {
  pendingLogs.delete(seq);
  pendingLogs.set(seq, records);
  for (const oldest of pendingLogs.keys()) {
    if (pendingLogs.size <= PENDING_LOG_LIMIT) break;
    pendingLogs.delete(oldest);
  }
}

/**
 * The one fold adapter of `engine`, shared by the reducer, the replay, and
 * the presentation feed. Sharing is safe:
 *
 * - its only state is the re-run memo, keyed by an immutable committed state
 *   and the in-flight record, so every caller gets the run it would compute
 *   itself;
 * - its log records are kept only inside `collectLog`, which the reducer's
 *   fold runs synchronously and which nothing re-enters, so the records of a
 *   replay or a presentation fold, which run outside every fold, are dropped.
 */
export function foldAdapterFor(engine: Engine): FoldAdapter {
  let adapter = adapters.get(engine);
  if (adapter === undefined) {
    adapter = createFoldAdapter(engine, {
      log: (record) => {
        collecting?.push(record);
      },
    });
    adapters.set(engine, adapter);
  }
  return adapter;
}

/**
 * The states of one applied intent's batch: `state`, the state its events
 * arrive with (`to`'s pending prompt's display, else its committed state),
 * and `before`, the state they started from (the same of `from`).
 */
export function batchStates(
  adapter: FoldAdapter,
  from: BattleSlice,
  to: BattleSlice,
): { readonly before: BattleState; readonly state: BattleState } {
  return {
    before: adapter.pending(from)?.display ?? from.committed,
    state: adapter.pending(to)?.display ?? to.committed,
  };
}

/** Runs `fold` while collecting its engine log records for the event at `seq`. */
function collectLog<T>(seq: number, fold: () => T): T {
  collecting = [];
  try {
    return fold();
  } finally {
    const records = collecting;
    collecting = null;
    if (records.length > 0) keepLog(seq, records);
  }
}

/**
 * Drops every kept record: a host calls it before it starts taking a game's
 * records, so records a replay kept for another game's seqs never surface.
 */
export function clearEngineLogRecords(): void {
  pendingLogs.clear();
}

/**
 * The engine log records of the event most recently folded at `seq`, once.
 * The host logs them when that event applied.
 */
export function takeEngineLogRecords(seq: number): readonly EngineLogRecord[] {
  const records = pendingLogs.get(seq) ?? [];
  pendingLogs.delete(seq);
  return records;
}

/**
 * Starts the engine battle of a new journey battle: builds it from `init`
 * and runs it to its first decision or prompt. `null` when the engine
 * reports an error, which bounces the `BEGIN_BATTLE`.
 */
export function startEngineBattle(init: EngineBattleInit, engine: Engine, seq: number): EngineBattleFold | null {
  const outcome = collectLog(seq, () => foldAdapterFor(engine).start(init));
  if (outcome.kind !== "applied" || outcome.error !== null) return null;
  return { init, slice: outcome.slice };
}

/**
 * The prompt a journey battle's in-flight engine step is suspended on, with
 * its id and intermediate state; `null` when nothing is in flight, the
 * battle is not a journey battle, or the record no longer replays to a
 * prompt (the next intent then clears it).
 */
export function pendingEnginePrompt(
  battle: BattleFoldState | null,
  engine: Engine | null,
): PendingPrompt | null {
  const fold = journeyBattleOf(battle)?.engine;
  if (fold === undefined || fold.slice.inFlight === null || engine === null) return null;
  return foldAdapterFor(engine).pending(fold.slice);
}

function isEngineIntentEventType(type: string): type is EngineIntentEventType {
  return type === "BATTLE_ACTION" || type === "BATTLE_ANSWER" || type === "BATTLE_CANCEL";
}

/**
 * The engine intent an event of `type` carries: `null` for any other event
 * type and for a malformed payload. It reads a payload as the fold does, so
 * an applied event's intent is the one the fold applied.
 */
export function engineIntentOfEvent(type: string, payload: Record<string, unknown>): BattleIntent | null {
  return isEngineIntentEventType(type) ? engineIntentFromPayload(type, payload) : null;
}

/** One engine intent folded over a slice: the next slice, or why it bounced or threw. */
type IntentFold =
  | { readonly kind: "applied"; readonly slice: BattleSlice; readonly published: readonly EngineEvent[] }
  | { readonly kind: "bounced" }
  | { readonly kind: "threw"; readonly slice: BattleSlice; readonly error: unknown };

/**
 * Folds the engine intent an event of `type` carries over `slice`. A throw
 * from the engine outside the adapter's own error boundary drops the
 * in-flight step and keeps the committed state; with nothing in flight the
 * intent bounces.
 */
function foldIntent(
  adapter: FoldAdapter,
  slice: BattleSlice,
  type: EngineIntentEventType,
  payload: Record<string, unknown>,
): IntentFold {
  const intent = engineIntentFromPayload(type, payload);
  if (intent === null) return { kind: "bounced" };
  try {
    const outcome = adapter.reduce(slice, intent);
    return outcome.kind === "bounced" ? outcome : { kind: "applied", slice: outcome.slice, published: outcome.published };
  } catch (error) {
    if (slice.inFlight === null) return { kind: "bounced" };
    return { kind: "threw", slice: { ...slice, inFlight: null, publishedEvents: 0 }, error };
  }
}

/**
 * Folds one engine intent over the battle's engine slice. `null` bounces:
 * no journey engine battle, a malformed payload, or an intent the adapter
 * refuses (the battle is over, a step is in flight, not that side's
 * decision or prompt, an illegal action or answer, a stale prompt id, or a
 * prompt that cannot be cancelled). An engine error applies: the slice
 * keeps its committed state and drops the in-flight step.
 *
 * A throw from the engine outside the adapter's own error boundary is
 * contained here, like a matching `RESOLVE_PROMPT` in the reducer: an
 * in-flight step stuck at a prompt that every answer re-throws would keep
 * the prompt gate closed forever. The in-flight step is dropped and the
 * committed state kept, as for any engine error; with nothing in flight the
 * intent bounces.
 */
export function reduceEngineIntent(
  state: FoldState,
  type: EngineIntentEventType,
  payload: Record<string, unknown>,
  ctx: EventContext,
  engine: Engine | null,
): FoldState | null {
  const battle = journeyBattleOf(state.battle);
  if (battle === null || engine === null) return null;
  const fold = battle.engine;
  const folded = collectLog(ctx.seq, () => foldIntent(foldAdapterFor(engine), fold.slice, type, payload));
  if (folded.kind === "bounced") return null;
  if (folded.kind === "threw" && fold.slice.inFlight !== null) {
    keepLog(ctx.seq, [
      {
        event: "engine.error",
        version: fold.slice.committed.version,
        step: fold.slice.inFlight.step,
        message: folded.error instanceof Error ? folded.error.message : String(folded.error),
      },
    ]);
  }
  return { ...state, battle: { ...battle, engine: { ...fold, slice: folded.slice } } };
}

/**
 * The engine debug action (D4) a `BATTLE_DEBUG` payload carries, applied to
 * `slice` in a development build; `null` when it is malformed or rejected,
 * and always in a production build.
 */
export function applyEngineDebug(
  engine: Engine,
  slice: BattleSlice,
  payload: Record<string, unknown>,
): { readonly slice: BattleSlice; readonly op: DebugOp } | null {
  const debug = engineDebugActions();
  if (debug === null) return null;
  const op = debug.debugOpFromUnknown(payload.op);
  if (op === null) return null;
  const outcome = debug.applyDebugOp(engine, slice, op);
  return outcome.kind === "rejected" ? null : { slice: outcome.slice, op };
}

// ---------------------------------------------------------------------------
// Replay from the event log
// ---------------------------------------------------------------------------

/** One applied engine intent of a replay: its seq, the events it published, the state they arrive with, and the state they started from. */
export interface EngineIntentBatch {
  readonly seq: number;
  readonly events: readonly EngineEvent[];
  readonly state: BattleState;
  readonly before: BattleState;
}

/**
 * A journey battle's intents folded again from the event log, and what
 * `derive` made of each applied intent's batch. A debug undo drops the items
 * of the history entries it undoes, so `items` always describe the path to
 * `slice`.
 */
export interface EngineBattleReplay<T> {
  /** The event list replayed; a replay continues only over the same list. */
  readonly events: readonly CommittedEvent[];
  /** Index into `events` of the event the battle started from: its `BEGIN_BATTLE`, or the `LOAD_STATE` that loaded it. */
  readonly start: number;
  /** Index into `events` of the next event to fold. */
  readonly next: number;
  readonly slice: BattleSlice;
  readonly items: readonly T[];
  /** `items.length` at the slice history's base and after each of its entries; `null` without history. */
  readonly marks: readonly number[] | null;
  /** Whether this replay, or the one it continues, once reproduced the fold's slice. */
  readonly reproduced: boolean;
}

/**
 * Where a replay stands after a call: `done` when it has folded every event
 * and reproduces the fold's slice, `partial` when its budget ran out first,
 * and `failed` when no start reproduces the slice. `folded` counts the
 * engine intents and debug actions the call folded.
 */
export type EngineBattleReplayProgress<T> =
  | { readonly kind: "done" | "partial"; readonly replay: EngineBattleReplay<T>; readonly folded: number }
  | { readonly kind: "failed"; readonly folded: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The slice `event` would start `battle`'s engine battle from: a
 * `BEGIN_BATTLE` at its site starts it from its init, and a `LOAD_STATE`
 * loads the slice it carries for a battle at its site. Whether the event
 * applied is not known here; the replay's final check decides.
 */
function startSlice(engine: Engine, battle: JourneyBattleFoldState, event: CommittedEvent["event"]): BattleSlice | null {
  const { payload } = event;
  if (event.type === "BEGIN_BATTLE") {
    if (payload.siteId !== battle.init.siteId) return null;
    const outcome = foldAdapterFor(engine).start(battle.engine.init);
    return outcome.kind === "applied" && outcome.error === null ? outcome.slice : null;
  }
  if (event.type === "LOAD_STATE") {
    const loaded = payload.battle;
    if (!isRecord(loaded) || !isRecord(loaded.init) || loaded.init.siteId !== battle.init.siteId) return null;
    const fold = loaded.engine;
    return isRecord(fold) && isRecord(fold.slice) ? (fold.slice as unknown as BattleSlice) : null;
  }
  return null;
}

/** `marks` aligned with `slice`'s history; `before` and `after` are `items.length` before and after the change. */
function alignMarks(marks: readonly number[] | null, slice: BattleSlice, before: number, after: number): number[] | null {
  const entries = slice.history?.entries.length;
  if (entries === undefined) return null;
  const aligned = marks === null ? [before] : [...marks];
  while (aligned.length < entries + 1) aligned.push(after);
  return aligned;
}

/** A replay of `battle` from the newest start before index `before` of `events`, with nothing folded after it. */
function startBefore<T>(
  engine: Engine,
  battle: JourneyBattleFoldState,
  events: readonly CommittedEvent[],
  before: number,
): EngineBattleReplay<T> | null {
  for (let index = before - 1; index >= 0; index--) {
    const event = events[index]?.event;
    if (event === undefined) continue;
    let slice: BattleSlice | null;
    try {
      slice = startSlice(engine, battle, event);
    } catch {
      slice = null;
    }
    if (slice !== null) {
      return {
        events,
        start: index,
        next: index + 1,
        slice,
        items: [],
        marks: alignMarks(null, slice, 0, 0),
        reproduced: false,
      };
    }
  }
  return null;
}

/**
 * Folds `replay`'s events from `replay.next`, until the end of its list or
 * until it has folded `budget` engine intents and debug actions. `null` when
 * the engine throws outside every boundary the reducer contains.
 */
function foldRest<T>(
  engine: Engine,
  replay: EngineBattleReplay<T>,
  derive: (batch: EngineIntentBatch) => readonly T[],
  budget: number,
): { readonly replay: EngineBattleReplay<T>; readonly folded: number } | null {
  const adapter = foldAdapterFor(engine);
  const { events } = replay;
  let { slice, marks } = replay;
  let items = [...replay.items];
  let folded = 0;
  let index = replay.next;
  try {
    for (; index < events.length && folded < budget; index++) {
      const committed = events[index];
      if (committed === undefined) continue;
      const { type, payload } = committed.event;
      if (isEngineIntentEventType(type)) {
        folded += 1;
        const result = foldIntent(adapter, slice, type, payload);
        if (result.kind === "bounced") continue;
        const count = items.length;
        if (result.kind === "applied") {
          const { before, state } = batchStates(adapter, slice, result.slice);
          items.push(...derive({ seq: committed.seq, events: result.published, state, before }));
        }
        slice = result.slice;
        marks = alignMarks(marks, slice, count, items.length);
      } else if (type === "BATTLE_DEBUG") {
        folded += 1;
        const applied = applyEngineDebug(engine, slice, payload);
        if (applied === null) continue;
        slice = applied.slice;
        if (applied.op.kind === "undo" && marks !== null) {
          const keptMarks = marks.slice(0, applied.op.keep + 1);
          items = items.slice(0, keptMarks[keptMarks.length - 1] ?? 0);
          marks = keptMarks;
        }
        marks = alignMarks(marks, slice, items.length, items.length);
      }
    }
  } catch {
    return null;
  }
  return { replay: { ...replay, next: index, slice, items, marks }, folded };
}

/**
 * Replays `battle`'s engine intents from `events`, the game's committed
 * events, calling `derive` with each applied intent's batch, until it is
 * done or has folded `budget` intents. It continues `previous` over the same
 * list when it can. Otherwise, or when a continued replay that once
 * reproduced the fold diverges from it, it starts from the newest event that
 * can start the battle, then from older ones, until one reproduces the
 * fold's slice: the fold is the truth, and a replay that disagrees with it
 * describes nothing.
 *
 * It folds each intent as the reducer does. The root CAS policy bounces
 * nothing here that the adapter does not, except an intent based before a
 * partner's event, which the final check catches.
 */
export function replayEngineBattle<T>(
  engine: Engine,
  battle: JourneyBattleFoldState,
  events: readonly CommittedEvent[],
  derive: (batch: EngineIntentBatch) => readonly T[],
  previous: EngineBattleReplay<T> | null = null,
  budget = Number.POSITIVE_INFINITY,
): EngineBattleReplayProgress<T> {
  let targetHash: StateHash | null = null;
  const reproduces = (replay: EngineBattleReplay<T>): boolean => {
    targetHash ??= hashState(battle.engine.slice);
    return hashState(replay.slice) === targetHash;
  };
  let replay =
    previous !== null && previous.events === events && previous.next <= events.length
      ? previous
      : startBefore<T>(engine, battle, events, events.length);
  // A replay that once reproduced the fold and then diverges searches every
  // start again (the battle changed); any other failed start tries older ones.
  let restart = replay?.reproduced === true;
  let folded = 0;
  while (replay !== null) {
    const result = foldRest(engine, replay, derive, budget - folded);
    if (result !== null) {
      folded += result.folded;
      if (result.replay.next < events.length) return { kind: "partial", replay: result.replay, folded };
      if (reproduces(result.replay)) return { kind: "done", replay: { ...result.replay, reproduced: true }, folded };
    }
    replay = startBefore<T>(engine, battle, events, restart ? events.length : replay.start);
    restart = false;
  }
  return { kind: "failed", folded };
}

/** The engine battle's result once its battle is over, else `null`. */
export function engineBattleResult(battle: JourneyBattleFoldState): EngineBattleResult | null {
  return battle.engine.slice.committed.result;
}

// ---------------------------------------------------------------------------
// Payload validation. The adapter validates legality against the engine's
// own legal actions and prompts; these only check the JSON shape.
// ---------------------------------------------------------------------------

function engineIntentFromPayload(type: EngineIntentEventType, payload: Record<string, unknown>): BattleIntent | null {
  const side = sideFromUnknown(payload.side);
  if (side === null) return null;
  if (type === "BATTLE_ACTION") {
    const action = actionFromUnknown(payload.action);
    return action === null ? null : { kind: "battleAction", side, action };
  }
  const promptId = promptIdFromUnknown(payload.promptId);
  if (promptId === null) return null;
  if (type === "BATTLE_CANCEL") return { kind: "cancel", side, promptId };
  const value = answerFromUnknown(payload.value);
  return value === null ? null : { kind: "answer", side, promptId, value };
}

function sideFromUnknown(value: unknown): Side | null {
  return value === "player" || value === "enemy" ? value : null;
}

function promptIdFromUnknown(value: unknown): PromptId | null {
  return typeof value === "string" && /^\d+:\d+:\d+$/u.test(value) ? parsePromptId(value) : null;
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function idFromUnknown<Prefix extends string>(value: unknown, prefix: Prefix): `${Prefix}${number}` | null {
  return typeof value === "string" && new RegExp(`^${prefix}\\d+$`, "u").test(value)
    ? (value as `${Prefix}${number}`)
    : null;
}

function instanceFromUnknown(value: unknown): InstanceId | null {
  return idFromUnknown(value, "i");
}

function slotFromUnknown(value: unknown): Slot | null {
  if (!isRecord(value) || (value.rank !== "front" && value.rank !== "back") || !isIndex(value.index)) return null;
  return { rank: value.rank, index: value.index };
}

function actionFromUnknown(value: unknown): Action | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "play": {
      const card = instanceFromUnknown(value.card);
      const slot = value.slot === undefined ? undefined : slotFromUnknown(value.slot);
      if (card === null || (value.from !== "hand" && value.from !== "void") || slot === null) return null;
      return { kind: "play", card, from: value.from, ...(slot === undefined ? {} : { slot }) };
    }
    case "activate": {
      const source = abilitySourceFromUnknown(value.source);
      return source === null || !isIndex(value.ability) ? null : { kind: "activate", source, ability: value.ability };
    }
    case "reposition": {
      const card = instanceFromUnknown(value.card);
      const to = slotFromUnknown(value.to);
      return card === null || to === null ? null : { kind: "reposition", card, to };
    }
    case "pass":
      return { kind: "pass" };
    case "payToEnd": {
      const effect = idFromUnknown(value.effect, "e");
      return effect === null ? null : { kind: "payToEnd", effect };
    }
    case "repeatLoop": {
      const loop = idFromUnknown(value.loop, "l");
      const count = value.count === "untilVictory" || isIndex(value.count) ? value.count : null;
      return loop === null || count === null ? null : { kind: "repeatLoop", loop, count };
    }
    default:
      return null;
  }
}

function abilitySourceFromUnknown(value: unknown): AbilitySource | null {
  const instance = instanceFromUnknown(value);
  if (instance !== null) return instance;
  if (!isRecord(value)) return null;
  const side = sideFromUnknown(value.side);
  if (side === null) return null;
  if (value.kind === "avatar") return { kind: "avatar", side };
  return value.kind === "dreamsign" && isIndex(value.index) ? { kind: "dreamsign", side, index: value.index } : null;
}

function answerFromUnknown(value: unknown): Answer | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (!Array.isArray(value)) return null;
  const cards: InstanceId[] = [];
  const arrangement: { card: InstanceId; to: "top" | "bottom" | "void" | "hand" }[] = [];
  for (const item of value as unknown[]) {
    const card = instanceFromUnknown(item);
    if (card !== null) {
      cards.push(card);
      continue;
    }
    if (!isRecord(item)) return null;
    const placed = instanceFromUnknown(item.card);
    const to = item.to;
    if (placed === null || (to !== "top" && to !== "bottom" && to !== "void" && to !== "hand")) return null;
    arrangement.push({ card: placed, to });
  }
  if (cards.length > 0 && arrangement.length > 0) return null;
  return arrangement.length > 0 ? arrangement : cards;
}
