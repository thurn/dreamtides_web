// The battle screen's presentation queue (engine-design § Presentation).
//
// The fold hands each applied engine intent's new events to presentation
// (`IntentOutcome.published`). The screen recomputes them from the intent
// and the slice it applied to (`usePublishedEngineEvents`), turns them into
// items (`presentation-items.ts`), and plays the items in order
// (`usePresentationQueue`). The prompt host shows a prompt only while the
// queue is idle, so the events before a prompt (the draws of "draw 2, then
// discard") are presented first.
//
// Presentation never gates game flow: the fold and the AI host do not read
// it. A reload starts with an empty queue, so a reloaded board shows the
// settled state and a reloaded prompt shows at once; events folded by the
// replay are never presented again.

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { Engine, EngineEvent } from "../../engine";
import type { BattleSlice } from "../../engine/fold/slice";
import type { BattleState } from "../../engine/state/types";
import type { EngineBattleNotice } from "../../runtime/battle-prompt-messages";
import { batchStates, engineIntentOfEvent, foldAdapterFor } from "../../rules/battle/engine-battle";
import { useEventOutcomes } from "../../session/hooks";
import type { PresentationId } from "../../types/identifiers";
import { enqueuePresentation, sliceKey, type PresentationBatch, type PresentationItem } from "./presentation-items";

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
    const intent = engineIntentOfEvent(event.type, event.payload);
    if (intent === null) return;
    const adapter = foldAdapterFor(engine);
    const from = sliceRef.current;
    const result = adapter.reduce(from, intent);
    if (result.kind !== "applied") return;
    sliceRef.current = result.slice;
    const { state, before } = batchStates(adapter, from, result.slice);
    publishRef.current({ events: result.published, batch: { key: sliceKey(result.slice), state }, before, seq });
  });
}
