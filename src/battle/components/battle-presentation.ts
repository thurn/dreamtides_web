// The battle screen's presentation queue: the minimal ordering hook behind
// "present, then ask" (engine-design § UI contract). Phase 4.4 maps every
// event kind to its visual on top of it.
//
// The fold hands each applied engine intent's new events to presentation
// (`IntentOutcome.published`). The screen recomputes them from the intent
// and the slice it applied to (`usePublishedEngineEvents`), turns the events
// the human may see into timed items, and plays them in order. The prompt
// host shows a prompt only while the queue is idle, so the events before a
// prompt (the draws of "draw 2, then discard") are presented first.
//
// Presentation never gates game flow: the fold and the AI host do not read
// it. A reload starts with an empty queue, so a reloaded prompt shows at
// once; events folded by the replay are never presented again.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BATTLE } from "../../content/battle";
import type { Engine, EngineEvent, Side } from "../../engine";
import { eventSeenBy } from "../../engine/events";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type FoldAdapter } from "../../engine/fold/slice";
import type { Answer } from "../../engine/prompts/types";
import type { Action } from "../../engine/rules/actions";
import type { BattleState } from "../../engine/state/types";
import type { EngineBattleNotice } from "../../runtime/battle-prompt-messages";
import { useEventOutcomes } from "../../session/hooks";
import { parsePromptId } from "../../types/identifiers";

/** One presented event: how long it holds the queue, and the notice it raises. */
export interface PresentationItem {
  readonly key: string;
  readonly dwellMs: number;
  readonly notice: EngineBattleNotice | null;
}

/** Event kinds the minimal presentation dwells on: the board changes a player watches happen. */
const DWELL_KINDS: ReadonlySet<EngineEvent["kind"]> = new Set([
  "cardDrawn",
  "cardPlayed",
  "discarded",
  "dissolved",
  "banished",
  "materialized",
  "returnedToHand",
  "figmentsMerged",
]);

/**
 * The items `human` is shown for `events`, judged in `state`, the state that
 * arrives with them. `sourceName` names a prompt's source card for a notice.
 */
export function presentationItems(
  events: readonly EngineEvent[],
  human: Side,
  state: BattleState,
  keyPrefix: string,
  sourceName: (event: Extract<EngineEvent, { kind: "promptAutoAnswered" }>) => string | null,
): PresentationItem[] {
  const dwellMs = BATTLE.presentation.eventDwellMs;
  return events.flatMap((raw, index): PresentationItem[] => {
    const event = eventSeenBy(raw, human, state);
    if (event === null) return [];
    const key = `${keyPrefix}:${String(index)}`;
    if (event.kind === "promptAutoAnswered" && event.side === human) {
      return [{ key, dwellMs, notice: { kind: "autoAnswered", prompt: event.prompt, sourceName: sourceName(event) } }];
    }
    if (event.kind === "capacityReached" && event.side === human) {
      return [{ key, dwellMs, notice: { kind: "capacityReached", missing: event.missing } }];
    }
    return DWELL_KINDS.has(event.kind) ? [{ key, dwellMs, notice: null }] : [];
  });
}

/**
 * The queue after `items` join it. A backlog longer than the presentation's
 * cap drops its oldest dwell-only items, so a long run of events (a loop's
 * repetitions) never holds the next prompt back for long; notices are kept,
 * newest of each kind only.
 */
export function enqueuePresentation(
  queue: readonly PresentationItem[],
  items: readonly PresentationItem[],
): PresentationItem[] {
  const all = [...queue, ...items];
  const lastNotice = new Map<string, number>();
  all.forEach((item, index) => {
    if (item.notice !== null) lastNotice.set(item.notice.kind, index);
  });
  let next = all.filter((item, index) => item.notice === null || lastNotice.get(item.notice.kind) === index);
  const total = (list: readonly PresentationItem[]) => list.reduce((sum, item) => sum + item.dwellMs, 0);
  while (total(next) > BATTLE.presentation.maxBacklogMs) {
    const oldest = next.findIndex((item) => item.notice === null);
    if (oldest < 0) break;
    next = next.filter((_item, index) => index !== oldest);
  }
  return next;
}

/** The queue's state for the screen: idle (nothing left to present), and the current notice. */
export interface PresentationState {
  readonly idle: boolean;
  readonly notice: { readonly key: string; readonly notice: EngineBattleNotice } | null;
  readonly enqueue: (items: readonly PresentationItem[]) => void;
  readonly dismissNotice: () => void;
}

/** Plays queued items in order, each for its dwell. */
export function usePresentationQueue(): PresentationState {
  const [queue, setQueue] = useState<readonly PresentationItem[]>([]);
  const [notice, setNotice] = useState<PresentationState["notice"]>(null);
  const head = queue[0];
  useEffect(() => {
    if (head === undefined) return undefined;
    if (head.notice !== null) setNotice({ key: head.key, notice: head.notice });
    const timer = window.setTimeout(() => setQueue((current) => (current[0] === head ? current.slice(1) : current)), head.dwellMs);
    return () => window.clearTimeout(timer);
  }, [head]);
  const enqueue = useCallback((items: readonly PresentationItem[]) => {
    if (items.length > 0) setQueue((current) => enqueuePresentation(current, items));
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  return { idle: head === undefined, notice, enqueue, dismissNotice };
}

/** The engine intent an applied `BATTLE_*` event carries; the fold validated its shape. */
export function intentOfEvent(type: string, payload: Record<string, unknown>): BattleIntent | null {
  const side = payload.side;
  if (side !== "player" && side !== "enemy") return null;
  if (type === "BATTLE_ACTION") return { kind: "battleAction", side, action: payload.action as Action };
  if (typeof payload.promptId !== "string") return null;
  const promptId = parsePromptId(payload.promptId);
  if (type === "BATTLE_CANCEL") return { kind: "cancel", side, promptId };
  if (type === "BATTLE_ANSWER") return { kind: "answer", side, promptId, value: payload.value as Answer };
  return null;
}

const feedAdapters = new WeakMap<Engine, FoldAdapter>();

/**
 * Calls `onPublished` with the events each applied engine intent publishes,
 * and the state they arrive with, recomputed by the same deterministic fold
 * adapter from the slice the intent applied to. `slice` is the fold's slice
 * as rendered; it resynchronizes the feed after anything else changes it.
 */
export function usePublishedEngineEvents(
  engine: Engine,
  slice: BattleSlice,
  onPublished: (events: readonly EngineEvent[], state: BattleState, seq: number) => void,
): void {
  const sliceRef = useRef(slice);
  const publishRef = useRef(onPublished);
  useLayoutEffect(() => {
    sliceRef.current = slice;
    publishRef.current = onPublished;
  });
  useEventOutcomes((event, seq, outcome) => {
    if (outcome !== "applied") return;
    const intent = intentOfEvent(event.type, event.payload);
    if (intent === null) return;
    let adapter = feedAdapters.get(engine);
    if (adapter === undefined) {
      adapter = createFoldAdapter(engine);
      feedAdapters.set(engine, adapter);
    }
    const result = adapter.reduce(sliceRef.current, intent);
    if (result.kind !== "applied") return;
    sliceRef.current = result.slice;
    const state = adapter.pending(result.slice)?.display ?? result.slice.committed;
    publishRef.current(result.published, state, seq);
  });
}
