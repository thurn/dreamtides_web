// The engine battle's battle log (Phase 4.4): one plain-English line per
// presented engine event, grouped by turn. Entries keep the event as the
// human saw it (`eventSeenBy`) and the instances it names as the human saw
// them then, by ID; names are resolved only as the log is displayed, and the
// lines come from the UI copy module (`engineBattleLogText`).
//
// Pure and React-free.

import type { EngineCardModels } from "../../battle/ui/engine-card-model";
import type {
  BattleEventLogLineView,
  BattleEventLogTurnView,
} from "../../cumulus/screens/battle-overlays/BattleEventLogOverlay";
import type { BattleView, EngineEvent, InstanceId, InstanceView, Side } from "../../engine";
import { eventSeenBy } from "../../engine/events";
import type { BattleState } from "../../engine/state/types";
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
