// The battle screen's presentation queue (engine-design § Presentation).
//
// The fold hands each applied engine intent's new events to presentation
// (`IntentOutcome.published`). The screen reads them again from the intent
// and the slice it applied to (`usePublishedEngineEvents`), with the states
// the reducer's fold observed at them, turns them into items
// (`presentation-items.ts`), and plays the items in order
// (`usePresentationQueue`). The prompt host shows a prompt only while the
// queue is idle and no notice is up (`promptPresentable`), so the events
// before a prompt (the draws of "draw 2, then discard") and an automatic
// answer's notice are presented first.
//
// Presentation never gates game flow: the fold and the AI host do not read
// it. A reload starts with an empty ordinary queue; durable teaching remains
// on its fold-owned host, and the prompt follows that checkpoint. Events folded
// by replay have no live ordinary presentation items.

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { BATTLE } from "../../content/battle";
import type { Engine, EngineEvent } from "../../engine";
import type { BattleSlice, FoldObservation } from "../../engine/fold/slice";
import type { BattleState } from "../../engine/state/types";
import type { EngineBattleNotice } from "../../runtime/battle-prompt-messages";
import { batchStates, foldAdapterFor, foldEngineIntent, observeEngineFolds } from "../../rules/battle/engine-battle";
import { useEventOutcomes } from "../../session/hooks";
import type { PresentationId } from "../../types/identifiers";
import {
  enqueuePresentation,
  presentedAsItem,
  sliceKey,
  type PresentationBatch,
  type PresentationItem,
} from "./presentation-items";

/** The queue's state: the items left to present and the current notice. */
export interface PresentationSnapshot {
  readonly guidanceId: PresentationId | null;
  readonly guidanceHeld: boolean;
  readonly guidanceReady: boolean;
  readonly queue: readonly PresentationItem[];
  readonly notice: { readonly key: PresentationId; readonly notice: EngineBattleNotice } | null;
}

/**
 * The presentation queue: an external store, so that a batch enqueued as
 * its intent is folded renders in the same commit as the fold's new state,
 * and the board never shows a batch before its presentation begins.
 */
interface GuidanceBoundary {
  readonly id: PresentationId;
  readonly producer?: PresentationItem["producer"];
}
function sameProducer(left: PresentationItem["producer"], right: PresentationItem["producer"]): boolean {
  return left !== undefined && right !== undefined && left.seq === right.seq && left.index === right.index;
}

export class PresentationQueue {
  private snapshotValue: PresentationSnapshot = { queue: [], notice: null, guidanceId: null, guidanceHeld: false, guidanceReady: false };
  private guidance: GuidanceBoundary | null = null;
  private readonly completedProducers: NonNullable<PresentationItem["producer"]>[] = [];
  private readonly listeners = new Set<() => void>();
  private timer: { readonly head: PresentationItem; readonly id: ReturnType<typeof setTimeout> } | null = null;

  readonly snapshot = (): PresentationSnapshot => this.snapshotValue;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  enqueue(items: readonly PresentationItem[]): void {
    if (items.length === 0) return;
    this.update({ ...this.snapshotValue, queue: enqueuePresentation(this.snapshotValue.queue, items.filter(item => !this.completedProducers.some(producer => sameProducer(producer, item.producer)))) });
  }

  /** Visual ordering only: durable fold checkpoints own input and AI permission. */
  setGuidance(boundary: GuidanceBoundary | null): void {
    if (boundary?.id === this.guidance?.id && (boundary?.producer === this.guidance?.producer || sameProducer(boundary?.producer, this.guidance?.producer))) return;
    const completed = this.guidance?.producer;
    if (completed !== undefined) this.completedProducers.push(completed);
    this.guidance = boundary;
    this.update({ ...this.snapshotValue, queue: this.snapshotValue.queue.filter(item => !sameProducer(completed, item.producer)) });
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
    const boundary = this.guidance?.producer;
    const guidanceHeld = this.guidance !== null && (head === undefined || boundary !== undefined && head.producer !== undefined &&
      (head.producer.seq > boundary.seq || head.producer.seq === boundary.seq && head.producer.index >= boundary.index));
    const notice = !guidanceHeld && head?.notice != null && (head !== this.snapshotValue.queue[0] || this.snapshotValue.guidanceHeld)
      ? { key: head.key, notice: head.notice } : next.notice;
    this.snapshotValue = { ...next, notice, guidanceId: this.guidance?.id ?? null, guidanceHeld, guidanceReady: guidanceHeld && notice === null };
    this.schedule();
    for (const listener of [...this.listeners]) listener();
  }

  private schedule(): void {
    const head = this.snapshotValue.queue[0];
    if (this.timer?.head === head && !this.snapshotValue.guidanceHeld) return;
    if (this.timer !== null) clearTimeout(this.timer.id);
    this.timer = null;
    if (head === undefined || this.snapshotValue.guidanceHeld) return;
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
  readonly guidanceHeld: boolean;
  readonly guidanceReady: boolean;
  readonly notice: PresentationSnapshot["notice"];
  readonly enqueue: (items: readonly PresentationItem[]) => void;
  readonly dismissNotice: () => void;
}

/** Plays queued items in order, each for its dwell. */
export function usePresentationQueue(boundary: GuidanceBoundary | null = null): PresentationState {
  const queueRef = useRef<PresentationQueue | null>(null);
  queueRef.current ??= new PresentationQueue();
  const queue = queueRef.current;
  const id = boundary?.id, seq = boundary?.producer?.seq, index = boundary?.producer?.index;
  useLayoutEffect(() => queue.setGuidance(id === undefined ? null : { id, ...(seq === undefined || index === undefined ? {} : { producer: { seq, index } }) }), [queue, id, seq, index]);
  useEffect(() => () => queue.dispose(), [queue]);
  const snapshot = useSyncExternalStore(queue.subscribe, queue.snapshot);
  const enqueue = useCallback((items: readonly PresentationItem[]) => queue.enqueue(items), [queue]);
  const dismissNotice = useCallback(() => queue.dismissNotice(), [queue]);
  const currentBoundary = boundary !== null && snapshot.guidanceId === boundary.id;
  return { head: snapshot.queue[0] ?? null, guidanceHeld: currentBoundary && snapshot.guidanceHeld, guidanceReady: currentBoundary && snapshot.guidanceReady, notice: snapshot.notice, enqueue, dismissNotice };
}

/** One applied intent's published events, with the state they arrive with and the state they started from. */
export interface PublishedBatch {
  readonly events: readonly EngineEvent[];
  readonly batch: PresentationBatch;
  readonly before: BattleState;
  /** The state observed at each event in `events`, in the same order; `undefined` where none was. */
  readonly eventStates: readonly (BattleState | undefined)[];
  readonly seq: number;
}

/**
 * What the reducer's fold observes for the feed: the state at each event that
 * becomes an item, up to `maxObservedEventStates` per intent; the items
 * after those show the batch's state (`presentationItems`).
 */
export const PRESENTATION_OBSERVATION: FoldObservation = {
  presented: presentedAsItem,
  limit: BATTLE.presentation.maxObservedEventStates,
};

/**
 * Calls `onPublished` with the events each applied engine intent publishes,
 * read again from the slice the intent applied to, synchronously as the
 * intent is folded, with the states the reducer's fold observed while the
 * feed is registered (`observeEngineFolds`). The shared fold adapter has
 * memoized the reducer's runs, so the read runs no step again. `slice` is the
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
  useEffect(() => observeEngineFolds(engine, PRESENTATION_OBSERVATION), [engine]);
  useEventOutcomes((event, seq, outcome) => {
    if (outcome !== "applied") return;
    const adapter = foldAdapterFor(engine);
    const from = sliceRef.current;
    const result = foldEngineIntent(adapter, from, event.type, event.payload);
    if (result.kind === "bounced") return;
    sliceRef.current = result.slice;
    if (result.kind === "threw") return;
    const { state, before, eventStates } = batchStates(adapter, from, result.slice, result.published);
    publishRef.current({ events: result.published, batch: { key: sliceKey(result.slice), state }, before, eventStates, seq });
  });
}
