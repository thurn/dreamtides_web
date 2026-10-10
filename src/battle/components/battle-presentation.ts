// The battle screen's presentation queue (engine-design § Presentation).
//
// The fold hands each applied engine intent's new events to presentation
// (`IntentOutcome.published`). The screen recomputes them from the intent
// and the slice it applied to (`usePublishedEngineEvents`), keeps the events
// the human may see (`eventSeenBy`), maps each kind to its visual
// (`EVENT_PRESENTATION`), and plays the resulting items in order:
//
// - The board shows the state that arrived with the batch of the item being
//   presented, so an opponent's plays arrive one at a time even when the AI
//   host has already moved on; when the queue is idle it shows the fold.
//   While an opponent's play is revealed, the board shows the state before
//   it, so its effects land as the card travels to its destination. Until a
//   batch's new turn is presented, its board stays in the turn it started
//   in, so the turn announcement follows what happened before it.
// - The prompt host shows a prompt only while the queue is idle, so the
//   events before a prompt (the draws of "draw 2, then discard") are
//   presented first.
// - An opponent's play shows at reading size for the tutorial's reveal
//   pacing, held off the board meanwhile, then travels to its destination.
//
// Presentation never gates game flow: the fold and the AI host do not read
// it. A reload starts with an empty queue, so a reloaded board shows the
// settled state and a reloaded prompt shows at once; events folded by the
// replay are never presented again.

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { BATTLE } from "../../content/battle";
import type { Engine, EngineEvent, InstanceId, Side } from "../../engine";
import { eventSeenBy, type EngineEventKind } from "../../engine/events";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type FoldAdapter } from "../../engine/fold/slice";
import type { Answer, PromptSource } from "../../engine/prompts/types";
import type { Action } from "../../engine/rules/actions";
import type { AbilitySource } from "../../engine/state/ids";
import type { BattleState } from "../../engine/state/types";
import type { EngineBattleNotice } from "../../runtime/battle-prompt-messages";
import { useEventOutcomes } from "../../session/hooks";
import type { DreamwellCardId, PresentationId } from "../../types/identifiers";
import { parsePresentationId, parsePromptId } from "../../types/identifiers";

/**
 * How the battle screen presents an event kind:
 *
 * - `travel`: a card changes zone or position; the board's shared-layout
 *   travel moves it, held for `eventDwellMs`;
 * - `reveal`: a card played; the opponent's shows at reading size first
 *   (`opponentPlayRevealDwellMs`), the human's travels from the hand;
 * - `score`: a lane scored; the card-score announcement on its challenger;
 * - `dreamwell`: the Dreamwell card's reveal beside its side's status;
 * - `turn`: the turn announcement;
 * - `notice`: a brief notice (an automatic answer, a full back rank, an
 *   ability with no legal target);
 * - `status`: a number, badge, or indicator the board shows at once (energy,
 *   points, spark, exhaustion, counters, durations, phase, result), with no
 *   dwell;
 * - `none`: bookkeeping with no visual by design: the paired zone-exit
 *   events of a move (`leftPlay`, `leftVoid`), a trigger joining the queue
 *   (its resolution is logged), an activated ability or a drawn card's
 *   ability finishing, and a bounded feasibility search.
 */
export type EventPresentation = "travel" | "reveal" | "score" | "dreamwell" | "turn" | "notice" | "status" | "none";

/** Every engine event kind's presentation; the `satisfies` clause makes a missing kind a type error. */
export const EVENT_PRESENTATION = {
  abandoned: "travel",
  abilityActivated: "status",
  abilityResolved: "none",
  avatarExhaustionChanged: "status",
  banished: "travel",
  battleEnded: "status",
  blockersDesignated: "status",
  capacityReached: "notice",
  cardCopied: "travel",
  cardCreated: "travel",
  cardDrawn: "travel",
  cardPlayed: "reveal",
  ceasedToExist: "travel",
  challengersDesignated: "status",
  controlChanged: "travel",
  countersChanged: "status",
  discarded: "travel",
  dissolved: "travel",
  dreamwellDrawn: "dreamwell",
  effectEnded: "status",
  effectStarted: "status",
  energyChanged: "status",
  eroded: "travel",
  exhaustionChanged: "status",
  fatigue: "status",
  feasibilityBounded: "none",
  figmentsMerged: "travel",
  laneResolved: "score",
  leftPlay: "none",
  leftVoid: "none",
  loopEnded: "status",
  loopStarted: "status",
  materialized: "travel",
  noLegalTarget: "notice",
  payableEffectEnded: "status",
  payableEffectRegistered: "status",
  pendingAbility: "none",
  phaseChanged: "status",
  pointsScored: "status",
  prevented: "travel",
  promptAutoAnswered: "notice",
  repositioned: "travel",
  resolved: "travel",
  returnedToHand: "travel",
  revealed: "travel",
  sparkGained: "status",
  triggerQueued: "none",
  triggerResolved: "status",
  turnStarted: "turn",
  winConditionMet: "status",
} as const satisfies Readonly<Record<EngineEventKind, EventPresentation>>;

/** What the board shows for an item beyond the batch's state. */
export type PresentationVisual =
  /**
   * The opponent's card at reading size, held off the board until it
   * travels there; `after` is the state its batch arrived with, where the
   * card is public.
   */
  | { readonly kind: "reveal"; readonly instance: InstanceId; readonly from: "hand" | "void"; readonly after: BattleState }
  /** The card-score announcement on a challenger that scored. */
  | { readonly kind: "score"; readonly instance: InstanceId; readonly points: number }
  /** A side's Dreamwell card beside its status display. */
  | { readonly kind: "dreamwell"; readonly side: Side; readonly card: DreamwellCardId };

/** A board state the screen shows while an item is presented. */
export interface PresentationBatch {
  /** The slice the state belongs to (`sliceKey`), or a key no slice has for a state before one. */
  readonly key: PresentationId;
  readonly state: BattleState;
}

/** One presented event: how long it holds the queue, its visual, and the notice it raises. */
export interface PresentationItem {
  readonly key: PresentationId;
  readonly presentation: Exclude<EventPresentation, "status" | "none">;
  readonly dwellMs: number;
  readonly visual: PresentationVisual | null;
  readonly notice: EngineBattleNotice | null;
  /** The board while the item is presented: its batch's state, or the state before it for a reveal. */
  readonly batch: PresentationBatch;
}

/** A slice's identity for presentation: two slices with one key render the same board. */
export function sliceKey(slice: BattleSlice): PresentationId {
  return parsePresentationId(
    [slice.committed.version, slice.attempt, slice.inFlight?.answers.length ?? -1, slice.publishedEvents].join(":"),
  );
}

/** Names a prompt's or ability's source card for a notice, when the human can identify it. */
export type NoticeSourceName = (source: AbilitySource | PromptSource | null) => string | null;

/**
 * The items `human` is shown for `events`, judged in `batch.state`, the
 * state that arrives with them; `before` is the state they started from.
 * `sourceName` names a notice's source card.
 */
export function presentationItems(
  events: readonly EngineEvent[],
  human: Side,
  batch: PresentationBatch,
  before: BattleState,
  sourceName: NoticeSourceName,
): PresentationItem[] {
  const { eventDwellMs } = BATTLE.presentation;
  // Items before the batch's first new turn show its state in the turn it
  // started in, so the turn announcement waits for them (a challenge's
  // scores, then the new turn).
  const turnIndex = events.findIndex((event) => event.kind === "turnStarted");
  const beforeTurn: PresentationBatch = {
    key: parsePresentationId(`${batch.key}:before-turn`),
    state: { ...batch.state, turn: before.turn },
  };
  return events.flatMap((raw, index): PresentationItem[] => {
    const event = eventSeenBy(raw, human, batch.state);
    if (event === null) return [];
    const item = (
      presentation: PresentationItem["presentation"],
      dwellMs: number,
      visual: PresentationVisual | null = null,
      notice: EngineBattleNotice | null = null,
    ): PresentationItem[] => [
      {
        key: parsePresentationId(`${batch.key}:${String(index)}`),
        presentation,
        dwellMs,
        visual,
        notice,
        batch:
          presentation === "reveal"
            ? { key: parsePresentationId(`${batch.key}:before`), state: before }
            : index < turnIndex
              ? beforeTurn
              : batch,
      },
    ];
    switch (event.kind) {
      case "promptAutoAnswered":
        return event.side === human
          ? item("notice", eventDwellMs, null, { kind: "autoAnswered", prompt: event.prompt, sourceName: sourceName(event.purpose.source) })
          : [];
      case "capacityReached":
        return event.side === human ? item("notice", eventDwellMs, null, { kind: "capacityReached", missing: event.missing }) : [];
      case "noLegalTarget":
        return item("notice", eventDwellMs, null, { kind: "noLegalTarget", sourceName: sourceName(event.source) });
      case "cardPlayed":
        return event.side === human
          ? item("travel", eventDwellMs)
          : item("reveal", BATTLE.presentation.opponentPlayRevealDwellMs, {
              kind: "reveal",
              instance: event.instance,
              from: before.instances[event.instance]?.zone === "void" ? "void" : "hand",
              after: batch.state,
            });
      case "laneResolved":
        return event.scored > 0
          ? item("score", BATTLE.presentation.scoreDwellMs, { kind: "score", instance: event.challenger, points: event.scored })
          : item("travel", eventDwellMs);
      case "dreamwellDrawn":
        return item("dreamwell", BATTLE.presentation.dreamwellRevealDwellMs, { kind: "dreamwell", side: event.side, card: event.card });
      case "turnStarted":
        return item("turn", BATTLE.presentation.turnAnnouncementDwellMs);
      default: {
        const presentation: EventPresentation = EVENT_PRESENTATION[event.kind];
        return presentation === "travel" ? item("travel", eventDwellMs) : [];
      }
    }
  });
}

/** Items a backlog may drop when it runs long: cards traveling, never a reveal, score, Dreamwell card, turn, or notice. */
const DROPPABLE: ReadonlySet<PresentationItem["presentation"]> = new Set(["travel"]);

/**
 * The queue after `items` join it. The item being presented (the head of a
 * non-empty `queue`) is never dropped. Notices keep the newest of each
 * kind; opponent plays keep the newest `maxQueuedReveals`; and while the
 * travels' dwell exceeds `maxBacklogMs`, the oldest travel is dropped, so a
 * long run of events (a loop's repetitions) never holds the next prompt
 * back for long.
 */
export function enqueuePresentation(
  queue: readonly PresentationItem[],
  items: readonly PresentationItem[],
): PresentationItem[] {
  const all = [...queue, ...items];
  const head = queue[0];
  const kept = (item: PresentationItem) => item === head;
  const lastNotice = new Map<string, number>();
  all.forEach((item, index) => {
    if (item.notice !== null) lastNotice.set(item.notice.kind, index);
  });
  let next = all.filter((item, index) => kept(item) || item.notice === null || lastNotice.get(item.notice.kind) === index);
  const reveals = next.filter((item) => item.presentation === "reveal" && !kept(item));
  const extraReveals = new Set(reveals.slice(0, Math.max(0, reveals.length - BATTLE.presentation.maxQueuedReveals)));
  next = next.filter((item) => !extraReveals.has(item));
  const droppable = (item: PresentationItem) => DROPPABLE.has(item.presentation) && !kept(item);
  const backlog = () => next.reduce((sum, item) => sum + (droppable(item) ? item.dwellMs : 0), 0);
  while (backlog() > BATTLE.presentation.maxBacklogMs) {
    const oldest = next.findIndex(droppable);
    if (oldest < 0) break;
    next = next.filter((_item, index) => index !== oldest);
  }
  return next;
}

/** The queue's state: the items left to present and the current notice. */
export interface PresentationSnapshot {
  readonly queue: readonly PresentationItem[];
  readonly notice: { readonly key: PresentationId; readonly notice: EngineBattleNotice } | null;
}

/**
 * The presentation queue: an external store, so that a batch enqueued as
 * its intent is folded renders in the same commit as the fold's new state,
 * and the board never shows a batch before its presentation begins.
 */
export class PresentationQueue {
  private snapshotValue: PresentationSnapshot = { queue: [], notice: null };
  private readonly listeners = new Set<() => void>();
  private timer: { readonly head: PresentationItem; readonly id: ReturnType<typeof setTimeout> } | null = null;

  readonly snapshot = (): PresentationSnapshot => this.snapshotValue;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  enqueue(items: readonly PresentationItem[]): void {
    if (items.length === 0) return;
    this.update({ ...this.snapshotValue, queue: enqueuePresentation(this.snapshotValue.queue, items) });
  }

  dismissNotice(): void {
    if (this.snapshotValue.notice !== null) this.update({ ...this.snapshotValue, notice: null });
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer.id);
    this.timer = null;
    this.listeners.clear();
  }

  private update(next: PresentationSnapshot): void {
    const head = next.queue[0];
    const notice =
      head?.notice != null && head !== this.snapshotValue.queue[0] ? { key: head.key, notice: head.notice } : next.notice;
    this.snapshotValue = { ...next, notice };
    this.schedule();
    for (const listener of [...this.listeners]) listener();
  }

  private schedule(): void {
    const head = this.snapshotValue.queue[0];
    if (this.timer?.head === head) return;
    if (this.timer !== null) clearTimeout(this.timer.id);
    this.timer = null;
    if (head === undefined) return;
    const id = setTimeout(() => {
      this.timer = null;
      const { queue } = this.snapshotValue;
      if (queue[0] === head) this.update({ ...this.snapshotValue, queue: queue.slice(1) });
    }, head.dwellMs);
    this.timer = { head, id };
  }
}

/** The queue's state for the screen. */
export interface PresentationState {
  /** The item being presented, or `null` when the queue is idle. */
  readonly head: PresentationItem | null;
  readonly notice: PresentationSnapshot["notice"];
  readonly enqueue: (items: readonly PresentationItem[]) => void;
  readonly dismissNotice: () => void;
}

/** Plays queued items in order, each for its dwell. */
export function usePresentationQueue(): PresentationState {
  const queueRef = useRef<PresentationQueue | null>(null);
  queueRef.current ??= new PresentationQueue();
  const queue = queueRef.current;
  useEffect(() => () => queue.dispose(), [queue]);
  const snapshot = useSyncExternalStore(queue.subscribe, queue.snapshot);
  const enqueue = useCallback((items: readonly PresentationItem[]) => queue.enqueue(items), [queue]);
  const dismissNotice = useCallback(() => queue.dismissNotice(), [queue]);
  return { head: snapshot.queue[0] ?? null, notice: snapshot.notice, enqueue, dismissNotice };
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

/** One applied intent's published events, with the state they arrive with and the state they started from. */
export interface PublishedBatch {
  readonly events: readonly EngineEvent[];
  readonly batch: PresentationBatch;
  readonly before: BattleState;
  readonly seq: number;
}

/**
 * Calls `onPublished` with the events each applied engine intent publishes,
 * recomputed by the same deterministic fold adapter from the slice the
 * intent applied to, synchronously as the intent is folded. `slice` is the
 * fold's slice as rendered; it resynchronizes the feed after anything else
 * changes it.
 */
export function usePublishedEngineEvents(
  engine: Engine,
  slice: BattleSlice,
  onPublished: (published: PublishedBatch) => void,
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
    const from = sliceRef.current;
    const result = adapter.reduce(from, intent);
    if (result.kind !== "applied") return;
    sliceRef.current = result.slice;
    const state = adapter.pending(result.slice)?.display ?? result.slice.committed;
    const before = adapter.pending(from)?.display ?? from.committed;
    publishRef.current({ events: result.published, batch: { key: sliceKey(result.slice), state }, before, seq });
  });
}
