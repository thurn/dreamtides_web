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

import type { Engine, EngineLogRecord } from "../../engine";
import type { BattleInit as EngineBattleInit } from "../../engine";
import {
  createFoldAdapter,
  type BattleIntent,
  type FoldAdapter,
  type PendingPrompt,
} from "../../engine/fold/slice";
import type { Answer } from "../../engine/prompts/types";
import type { Action } from "../../engine/rules/actions";
import type { AbilitySource, InstanceId, Side, Slot } from "../../engine/state/ids";
import type { BattleResult as EngineBattleResult } from "../../engine/state/types";
import type { EventContext } from "../../eventlog/types";
import { parsePromptId, type PromptId } from "../../types/identifiers";
import type { FoldState } from "../fold-state";
import { battleModeOf, type BattleFoldState } from "./fold";

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

function adapterFor(engine: Engine): FoldAdapter {
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
export function startEngineBattle(
  battle: BattleFoldState,
  init: EngineBattleInit,
  engine: Engine,
  seq: number,
): BattleFoldState | null {
  const outcome = collectLog(seq, () => adapterFor(engine).start(init));
  if (outcome.kind !== "applied" || outcome.error !== null) return null;
  return { ...battle, engine: { init, slice: outcome.slice } };
}

/**
 * The prompt a journey battle's in-flight engine step is suspended on, with
 * its id and intermediate state; `null` when nothing is in flight, the
 * battle has no engine battle, or the record no longer replays to a prompt
 * (the next intent then clears it).
 */
export function pendingEnginePrompt(
  battle: BattleFoldState | null,
  engine: Engine | null,
): PendingPrompt | null {
  const fold = battle?.engine;
  if (fold === undefined || fold.slice.inFlight === null || engine === null) return null;
  return adapterFor(engine).pending(fold.slice);
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
  const battle = state.battle;
  const fold = battle?.engine;
  if (battle === null || fold === undefined || engine === null || battleModeOf(battle).kind !== "journey") {
    return null;
  }
  const intent = engineIntentFromPayload(type, payload);
  if (intent === null) return null;
  let slice = fold.slice;
  try {
    const outcome = collectLog(ctx.seq, () => adapterFor(engine).reduce(fold.slice, intent));
    if (outcome.kind === "bounced") return null;
    slice = outcome.slice;
  } catch (error) {
    if (fold.slice.inFlight === null) return null;
    keepLog(ctx.seq, [
      {
        event: "engine.error",
        version: fold.slice.committed.version,
        step: fold.slice.inFlight.step,
        message: error instanceof Error ? error.message : String(error),
      },
    ]);
    slice = { ...fold.slice, inFlight: null, publishedEvents: 0 };
  }
  return { ...state, battle: { ...battle, engine: { ...fold, slice } } };
}

/** The engine battle's result once its battle is over, else `null`. */
export function engineBattleResult(battle: BattleFoldState): EngineBattleResult | null {
  return battle.engine?.slice.committed.result ?? null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
