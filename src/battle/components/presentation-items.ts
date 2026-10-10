// The battle screen's presentation items (engine-design § Presentation):
// what the human is shown for one applied engine intent's published events,
// and the queue those items join. Pure: no React, no store, no engine fold.
//
// The screen keeps the events the human may see (`eventSeenBy`), maps each
// kind to its visual (`EVENT_PRESENTATION`), and plays the resulting items in
// order (`battle-presentation.ts`):
//
// - The board shows the state that arrived with the batch of the item being
//   presented, so an opponent's plays arrive one at a time even when the AI
//   host has already moved on; when the queue is idle it shows the fold.
//   While an opponent's play is revealed, the board shows the state before
//   it, so its effects land as the card travels to its destination. Until a
//   batch's new turn is presented, its board stays in the turn it started
//   in, so the turn announcement follows what happened before it.
// - An opponent's play shows at reading size for the tutorial's reveal
//   pacing, held off the board meanwhile, then travels to its destination.

import { BATTLE } from "../../content/battle";
import type { EngineEvent, InstanceId, Side } from "../../engine";
import { eventSeenBy, type EngineEventKind } from "../../engine/events";
import type { BattleSlice } from "../../engine/fold/slice";
import type { PromptSource } from "../../engine/prompts/types";
import type { AbilitySource } from "../../engine/state/ids";
import type { BattleState } from "../../engine/state/types";
import type { EngineBattleNotice } from "../../runtime/battle-prompt-messages";
import type { DreamwellCardId, PresentationId } from "../../types/identifiers";
import { parsePresentationId } from "../../types/identifiers";

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
