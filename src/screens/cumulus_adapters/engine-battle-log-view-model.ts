// The engine battle's battle log (Phase 4.4): one plain-English line per
// engine event the human saw, grouped by turn. Entries keep the event as the
// human saw it (`eventSeenBy`) and the instances it names as the human saw
// them then, by ID; names are resolved only as the log is displayed, and the
// lines come from the UI copy module (`engineBattleLogText`).
//
// The log derives from the event log: `engineBattleLog` replays the battle's
// intents (`replayEngineBattle`), so a reload, a debug undo, and a live game
// all show the entries of the path to the fold's slice. A replay is kept per
// event list and continued as the list grows, so an open log follows new
// intents without folding the battle again.
//
// React-free.

import type { EngineCardModels } from "../../battle/ui/engine-card-model";
import type {
  BattleEventLogLineView,
  BattleEventLogTurnView,
} from "../../cumulus/screens/battle-overlays/BattleEventLogOverlay";
import { BATTLE } from "../../content/battle";
import type { BattleView, Engine, EngineEvent, InstanceId, InstanceView, Side } from "../../engine";
import { eventSeenBy } from "../../engine/events";
import type { BattleSlice } from "../../engine/fold/slice";
import type { BattleState } from "../../engine/state/types";
import type { CommittedEvent } from "../../eventlog/local-log";
import { replayEngineBattle, type EngineBattleReplay } from "../../rules/battle/engine-battle";
import type { JourneyBattleFoldState } from "../../rules/battle/fold";
import { ENGINE_BATTLE_LOG_COPY, engineBattleLogText, type EngineBattleLogWords } from "../../runtime/battle-prompt-messages";

/** One event of the battle log, as the human saw it. */
export interface EngineBattleLogEntry {
  readonly key: string;
  /** The turn it happened in, and whose turn that was. */
  readonly turnNumber: number;
  readonly active: Side;
  readonly event: EngineEvent;
  /** The instances the event names, as the human could see them when it happened. */
  readonly cards: Readonly<Record<InstanceId, InstanceView>>;
}

/** Every string `value` holds: field values, array items, and record keys, which include the instance IDs it names. */
function strings(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    found.add(value);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    found.add(key);
    strings(nested, found);
  }
}

/**
 * The log entries of one batch of `events`, judged in `state` (the state
 * that arrives with them) for `human`, whose view of it is `view`; a card
 * that left the battle during the batch is named as `before` (the human's
 * view of the state the batch started from) showed it. Events the human
 * cannot see are left out.
 */
export function battleLogEntries(
  events: readonly EngineEvent[],
  human: Side,
  state: BattleState,
  view: BattleView,
  before: BattleView,
  keyPrefix: string,
): EngineBattleLogEntry[] {
  return events.flatMap((raw, index): EngineBattleLogEntry[] => {
    const event = eventSeenBy(raw, human, state);
    if (event === null) return [];
    const named = new Set<string>();
    strings(event, named);
    const cards: Record<InstanceId, InstanceView> = {};
    for (const instance of [...Object.values(before.instances), ...Object.values(view.instances)]) {
      if (named.has(instance.id)) cards[instance.id] = instance;
    }
    return [{ key: `${keyPrefix}:${String(index)}`, turnNumber: state.turn.turnNumber, active: state.turn.active, event, cards }];
  });
}

/** A journey battle's log, rebuilt from the event log. */
export interface EngineBattleLog {
  /** The newest `BATTLE.presentation.logEntryCap` entries, oldest first. */
  readonly entries: readonly EngineBattleLogEntry[];
  /** Seq of the event the replay started the battle from. */
  readonly startSeq: number;
  /** The engine intents and debug actions this call folded. */
  readonly folded: number;
}

/** The newest replay of a game's event list, for one battle and viewer. */
interface KeptReplay {
  readonly engine: Engine;
  readonly battle: JourneyBattleFoldState["init"];
  readonly human: Side;
  /** The fold slice a done replay reproduced; `null` while it is partial. */
  readonly slice: BattleSlice | null;
  /** `null` once no start reproduced the fold's slice. */
  readonly replay: EngineBattleReplay<EngineBattleLogEntry> | null;
}

const kept = new WeakMap<readonly CommittedEvent[], KeptReplay>();

/**
 * Advances the kept replay of `battle`'s log by at most `budget` engine
 * intents, or answers from it when it already reproduces the fold.
 */
function advance(
  engine: Engine,
  battle: JourneyBattleFoldState,
  events: readonly CommittedEvent[],
  human: Side,
  budget: number,
): { readonly kind: "done" | "partial" | "failed"; readonly kept: KeptReplay; readonly folded: number } {
  const last = kept.get(events);
  const previous =
    last !== undefined && last.engine === engine && last.battle === battle.init && last.human === human ? last : null;
  if (previous !== null && previous.replay !== null && previous.slice === battle.engine.slice) {
    return { kind: "done", kept: previous, folded: 0 };
  }
  const { battleId } = battle.init;
  const progress = replayEngineBattle(
    engine,
    battle,
    events,
    (batch) =>
      battleLogEntries(
        batch.events,
        human,
        batch.state,
        engine.view(batch.state, human),
        engine.view(batch.before, human),
        `${battleId}:${String(batch.seq)}`,
      ),
    previous?.replay ?? null,
    budget,
  );
  const next: KeptReplay = {
    engine,
    battle: battle.init,
    human,
    slice: progress.kind === "done" ? battle.engine.slice : null,
    replay: progress.kind === "failed" ? null : progress.replay,
  };
  kept.set(events, next);
  return { kind: progress.kind, kept: next, folded: progress.folded };
}

/**
 * The battle log of `battle` for `human`, rebuilt from `events` (the game's
 * committed events) to the fold's slice; `null` when no replay reproduces
 * that slice. Each applied intent's batch becomes its entries
 * (`battleLogEntries`), keyed by the battle and the intent's seq, so a
 * reload keys them alike.
 */
export function engineBattleLog(
  engine: Engine,
  battle: JourneyBattleFoldState,
  events: readonly CommittedEvent[],
  human: Side,
): EngineBattleLog | null {
  const { kind, kept: current, folded } = advance(engine, battle, events, human, Number.POSITIVE_INFINITY);
  if (kind !== "done" || current.replay === null) return null;
  return {
    entries: current.replay.items.slice(-BATTLE.presentation.logEntryCap),
    startSeq: current.replay.events[current.replay.start]?.seq ?? 0,
    folded,
  };
}

/**
 * Folds one more engine intent of the kept replay of `battle`'s log, so the
 * log is ready when it opens; `true` while more remain. A replay that found
 * no start is not retried here.
 */
export function warmEngineBattleLog(
  engine: Engine,
  battle: JourneyBattleFoldState,
  events: readonly CommittedEvent[],
  human: Side,
): boolean {
  const last = kept.get(events);
  if (last !== undefined && last.replay === null && last.battle === battle.init) return false;
  return advance(engine, battle, events, human, 1).kind === "partial";
}

/**
 * The battle log's turns for display: each entry's line from the copy
 * module, with card names resolved from `cards` and Dreamwell card names
 * from `dreamwellName`; events the log leaves out have no line.
 */
export function battleLogTurns(
  entries: readonly EngineBattleLogEntry[],
  human: Side,
  cards: EngineCardModels,
  dreamwellName: EngineBattleLogWords["dreamwell"],
): BattleEventLogTurnView[] {
  const turns: { turnNumber: number; heading: string; lines: BattleEventLogLineView[] }[] = [];
  for (const entry of entries) {
    const text = engineBattleLogText(entry.event, {
      human,
      card: (id) => {
        const instance = id === null ? undefined : entry.cards[id];
        return instance === undefined ? null : cards(instance).displaySnapshot.name;
      },
      dreamwell: dreamwellName,
    });
    if (text === null) continue;
    let turn = turns[turns.length - 1];
    if (turn?.turnNumber !== entry.turnNumber) {
      turn = {
        turnNumber: entry.turnNumber,
        heading: ENGINE_BATTLE_LOG_COPY.turn(entry.turnNumber, entry.active === human),
        lines: [],
      };
      turns.push(turn);
    }
    turn.lines.push({ key: entry.key, text });
  }
  return turns;
}
