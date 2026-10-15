// The battle screen's presentation items (engine-design § Presentation):
// what the human is shown for one applied engine intent's published events,
// and the queue those items join. Pure: no React, no store, no engine fold.
//
// The screen keeps the events the human may see (`eventSeenBy`), maps each
// kind to its visual (`EVENT_PRESENTATION`), and plays the resulting items in
// order (`battle-presentation.ts`):
//
// - Each item shows the board at its own event (`eventBoards`), so a batch's
//   board only moves forward and an opponent's plays arrive one at a time
//   even when the AI host has already moved on; when the queue is idle it
//   shows the fold. An opponent's play is revealed over the board just
//   before it, so its effects land as the card travels to its destination.
//   Until a batch's new turn is presented, its board stays in the turn it
//   started in (`batchTurnAt`), so the turn announcement follows what
//   happened before it.
// - An opponent's play shows at reading size for the tutorial's reveal
//   pacing, held off the board meanwhile, then travels to its destination.

import { BATTLE } from "../../content/battle";
import type { EngineEvent, InstanceId, Side } from "../../engine";
import { eventSeenBy, type EngineEventKind } from "../../engine/events";
import type { BattleSlice } from "../../engine/fold/slice";
import type { PromptSource } from "../../engine/prompts/types";
import { SIDES, type AbilitySource } from "../../engine/state/ids";
import type { BattleState } from "../../engine/state/types";
import type { EngineBattleNotice, EngineBattleNoticeSource } from "../../runtime/battle-prompt-messages";
import type { BattleView } from "../../engine/view/view";
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
 * - `none`: bookkeeping with no visual by design: the paired zone-exit and
 *   void-entry events of a move (`leftPlay`, `leftVoid`, `enteredVoid`), a
 *   trigger joining the queue (its resolution is logged), an activated
 *   ability or a drawn card's ability finishing, and a bounded feasibility
 *   search.
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
  cardDiscovered: "travel",
  cardDrawn: "travel",
  cardPlayed: "reveal",
  cardTaken: "travel",
  cardsPlaced: "travel",
  ceasedToExist: "travel",
  challengersDesignated: "status",
  controlChanged: "travel",
  countersChanged: "status",
  discarded: "travel",
  discardBatch: "none",
  scoreGroup: "none",
  dissolved: "travel",
  dreamwellDrawn: "dreamwell",
  effectEnded: "status",
  effectStarted: "status",
  energyChanged: "status",
  enteredVoid: "none",
  eroded: "travel",
  exhaustionChanged: "status",
  extraTurnGranted: "status",
  fatigue: "status",
  feasibilityBounded: "none",
  figmentsMerged: "travel",
  foresaw: "travel",
  handEmptied: "none",
  laneResolved: "score",
  leftPlay: "none",
  leftVoid: "none",
  lookedAtTop: "status",
  loopEnded: "status",
  loopStarted: "status",
  materialized: "travel",
  noLegalTarget: "notice",
  openingHandCompleted: "none",
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
  shuffledIntoDeck: "travel",
  sparkGained: "status",
  subtypeChosen: "status",
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
  | { readonly kind: "reveal"; readonly instance: InstanceId; readonly from: "hand" | "void" | "deck"; readonly after: BattleState }
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
  /** The board while presented: its event's board (`eventBoards`), or for a reveal the board shown before it. */
  readonly batch: PresentationBatch;
}

/**
 * Whether the human's pending decision may show: once no item is presented
 * and the last notice has cleared (it dismisses itself, or the player taps
 * it), so a notice about what just happened never stands over the next
 * prompt's controls or reads as describing that prompt.
 */
export function promptPresentable(
  head: PresentationItem | null,
  notice: { readonly notice: EngineBattleNotice } | null,
): boolean {
  return head === null && notice === null;
}

/** A slice's identity for presentation: two slices with one key render the same board. */
export function sliceKey(slice: BattleSlice): PresentationId {
  return parsePresentationId(
    [slice.committed.version, slice.attempt, slice.inFlight?.answers.length ?? -1, slice.publishedEvents].join(":"),
  );
}

/**
 * The turn each event in a batch belongs to: events before its first
 * `turnStarted` belong to the ending turn, and that event and those after
 * it belong to the arriving turn. A batch without a new turn uses `after`.
 */
export function batchTurnAt(
  events: readonly EngineEvent[],
  before: Readonly<BattleState["turn"]>,
  after: Readonly<BattleState["turn"]>,
): (index: number) => Readonly<BattleState["turn"]> {
  const turnIndex = events.findIndex((event) => event.kind === "turnStarted");
  return (index) => index < turnIndex ? before : after;
}

/** The place of a card rules code created but has not yet listed in its zone (`createInstance`'s caller lists it). */
const UNLISTED = "unlisted";

/**
 * Where a card is: its zone and the side holding it, its position in play,
 * `gone` once it ceased to exist, or `UNLISTED` while it is created but not
 * yet in its zone's list.
 */
function placeOf(state: BattleState, id: InstanceId): string {
  const instance = state.instances[id];
  if (instance === undefined) return "gone";
  const side = instance.controller;
  switch (instance.zone) {
    case "play": {
      const back = state.sides[side].backRank.indexOf(id);
      if (back >= 0) return `play:${side}:back:${String(back)}`;
      const front = state.sides[side].frontRank.indexOf(id);
      return front >= 0 ? `play:${side}:front:${String(front)}` : UNLISTED;
    }
    case "stack":
      return stackIndex(state, id) >= 0 ? `stack:${side}` : UNLISTED;
    default:
      return state.sides[side][instance.zone].includes(id) ? `${instance.zone}:${side}` : UNLISTED;
  }
}

/** The stack position of the card `id`, or -1. */
function stackIndex(state: BattleState, id: InstanceId): number {
  return state.stack.findIndex((item) => item.kind === "card" && item.instance === id);
}

/** Whether `event` names `id` in any of its fields. */
function namesCard(event: EngineEvent, id: InstanceId): boolean {
  return Object.values(event as unknown as Readonly<Record<string, unknown>>).some(
    (value) => value === id || (Array.isArray(value) && (value as readonly unknown[]).includes(id)),
  );
}

/** Whether an event of this kind is presented as an item rather than at once or not at all. */
export function presentedAsItem(event: EngineEvent): boolean {
  const presentation: EventPresentation = EVENT_PRESENTATION[event.kind];
  return presentation !== "status" && presentation !== "none";
}

/**
 * The cards an event announces before rules code moves them: a resolving
 * card, which leaves the stack once its effects resolve; the characters of
 * a lane that scored nothing, which dissolve after; a created card
 * discarded, dissolved, abandoned, or prevented, which ceases to exist
 * after; and a created card, which its creator lists in its zone after.
 */
function announcedMoves(event: EngineEvent): readonly InstanceId[] {
  switch (event.kind) {
    case "resolved":
    case "discarded":
    case "dissolved":
    case "abandoned":
    case "prevented":
    case "cardCreated":
      return [event.instance];
    case "laneResolved":
      return event.scored > 0 ? [] : event.blocker === null ? [event.challenger] : [event.challenger, event.blocker];
    default:
      return [];
  }
}

type ZoneList = "deck" | "hand" | "void" | "banished";

/**
 * `state` showing `id` where `settled` has it, or `state` when it cannot:
 * the board of an event that announced a move before the move landed.
 */
function settle(state: BattleState, id: InstanceId, settled: BattleState): BattleState {
  const place = settled.instances[id];
  const stackAt = stackIndex(settled, id);
  const stackItem = settled.stack[stackAt];
  if (place?.zone === "stack" && (stackItem === undefined || stackIndex(state, id) >= 0)) return state;
  const without = (list: readonly InstanceId[]) => list.filter((entry) => entry !== id);
  const vacate = (rank: readonly (InstanceId | null)[]) => rank.map((entry) => (entry === id ? null : entry));
  const sides = { ...state.sides };
  const stack = state.stack.filter((item) => item.kind !== "card" || item.instance !== id);
  for (const side of SIDES) {
    const held = state.sides[side];
    sides[side] = {
      ...held,
      deck: without(held.deck),
      hand: without(held.hand),
      void: without(held.void),
      banished: without(held.banished),
      backRank: vacate(held.backRank),
      frontRank: vacate(held.frontRank),
    };
  }
  if (place?.zone === "play") {
    const target = settled.sides[place.controller];
    const rank = target.backRank.includes(id) ? "backRank" : "frontRank";
    const index = target[rank].indexOf(id);
    const holder = sides[place.controller];
    if (index < 0 || holder[rank][index] !== null) return state;
    sides[place.controller] = { ...holder, [rank]: holder[rank].map((entry, at) => (at === index ? id : entry)) };
  } else if (place?.zone === "stack") {
    // A created stack copy joins the stack where it lands: nothing else on the stack moves while its creator lists it.
    if (stackItem !== undefined) stack.splice(Math.min(stackAt, stack.length), 0, stackItem);
  } else if (place !== undefined) {
    const zone: ZoneList = place.zone;
    const holder = sides[place.controller];
    const list = settled.sides[place.controller][zone];
    sides[place.controller] = { ...holder, [zone]: list[0] === id ? [id, ...holder[zone]] : [...holder[zone], id] };
  }
  const knownTo = { ...state.knownTo };
  for (const side of SIDES) {
    knownTo[side] = settled.knownTo[side].includes(id) ? [...without(state.knownTo[side]), id] : without(state.knownTo[side]);
  }
  return {
    ...state,
    sides,
    knownTo,
    instances: Object.fromEntries([
      ...Object.entries(state.instances).filter(([key]) => key !== id),
      ...(place === undefined ? [] : [[id, place] as const]),
    ]),
    stack,
  };
}

/**
 * The board each event of a batch shows, aligned with `events`: the state
 * observed at the event (`observed`; `undefined` where none was), so that a
 * batch's board only moves forward:
 *
 * - An event before the batch's new turn shows the turn it belongs to
 *   (`turnAt`), even where the rules had already begun the next turn, as
 *   when a card banished until that turn returns before it is announced.
 * - A card whose move an event announces before it lands
 *   (`announcedMoves`) shows at its destination from that event on: a
 *   resolving card leaves the stack as it resolves, never staying there
 *   through its effects; a created card shows in its hand, rank, or stack
 *   position from its creation; a created card prevented or abandoned is
 *   gone from that event. A card the batch began resolving leaves the stack
 *   from the batch's first event unless an event presented as an item names
 *   it; bookkeeping such as its `enteredVoid` does not hold it there. A card still resolving when the batch
 *   ends, held by a prompt, stays on the stack, and a card created but not
 *   listed when it ends shows once the answer lists it.
 */
function eventBoards(
  events: readonly EngineEvent[],
  before: BattleState,
  after: BattleState,
  observed: readonly (BattleState | undefined)[],
  turnAt: (index: number) => Readonly<BattleState["turn"]>,
): (BattleState | undefined)[] {
  let carried: Readonly<BattleState["turn"]> = before.turn;
  const boards = events.map((_event, index): BattleState | undefined => {
    const state = observed[index];
    if (state === undefined) return undefined;
    const owner = turnAt(index);
    const sameTurn = (turn: Readonly<BattleState["turn"]>) => turn.turnNumber === owner.turnNumber && turn.active === owner.active;
    if (sameTurn(state.turn)) {
      carried = state.turn;
      return state;
    }
    return { ...state, turn: sameTurn(carried) ? carried : owner };
  });
  /** The first state from `start` in which `id` has left where it is in `from`; between them, only items naming it unless `anyItems`. */
  const landing = (start: number, from: BattleState, id: InstanceId, anyItems: boolean) => {
    const place = placeOf(from, id);
    for (let index = start; index < events.length; index += 1) {
      const state = observed[index];
      const event = events[index];
      if (state === undefined || event === undefined) return null;
      if (placeOf(state, id) !== place) return { index, state };
      if (!anyItems && presentedAsItem(event) && !namesCard(event, id)) return null;
    }
    return placeOf(after, id) === place ? null : { index: events.length, state: after };
  };
  const show = (from: number, id: InstanceId, landed: { readonly index: number; readonly state: BattleState } | null) => {
    if (landed === null) return;
    for (let index = Math.max(from, 0); index < landed.index; index += 1) {
      const board = boards[index];
      if (board !== undefined) boards[index] = settle(board, id, landed.state);
    }
  };
  for (const item of before.stack) {
    if (item.kind === "card" && !events.some((event) => presentedAsItem(event) && namesCard(event, item.instance))) {
      show(0, item.instance, landing(0, before, item.instance, true));
    }
  }
  events.forEach((event, index) => {
    const state = observed[index];
    const previous = index === 0 ? before : observed[index - 1];
    if (state === undefined || previous === undefined) return;
    for (const id of announcedMoves(event)) {
      const place = placeOf(state, id);
      // An event naming a card after its move already shows it there; a card created but not yet listed is still moving.
      if (place !== UNLISTED && place !== placeOf(previous, id)) continue;
      show(index, id, landing(index + 1, state, id, event.kind === "resolved" || place === UNLISTED));
    }
  });
  return boards;
}

/** Resolves only the source identity the batch's already-redacted view permits. */
export function resolveNoticeSource(source: AbilitySource | PromptSource | null, view: BattleView): EngineBattleNoticeSource | null {
  if (source === null) return null;
  if (typeof source === "string") return view.instances[source] ?? null;
  switch (source.kind) {
    case "dreamwell":
      return source;
    case "avatar": {
      const id = "id" in source ? source.id : view.sides[source.side].avatar?.id;
      return id === undefined ? null : { kind: "avatar", side: source.side, id };
    }
    case "dreamsign": {
      const id = "id" in source ? source.id : view.sides[source.side].dreamsigns[source.index]?.id;
      return id === undefined ? null : { kind: "dreamsign", side: source.side, index: source.index, id };
    }
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

/** Minimal physical provenance for diagnostics; display snapshots stay in presentation. */
function noticeSourceDiagnostic(source: EngineBattleNoticeSource | null) {
  if (source === null) return null;
  if ("printing" in source) {
    const printing = source.printing;
    switch (printing.kind) {
      case "card":
        return { kind: "card" as const, instance: source.id, cardId: printing.cardId };
      case "figment":
        return { kind: "figment" as const, instance: source.id, figment: printing.figment };
      case "figmentCopy":
        return { kind: "figmentCopy" as const, instance: source.id, cardId: printing.cardId };
      default: {
        const exhaustive: never = printing;
        return exhaustive;
      }
    }
  }
  switch (source.kind) {
    case "avatar":
      return { kind: source.kind, side: source.side, id: source.id };
    case "dreamsign":
      return { kind: source.kind, side: source.side, index: source.index, id: source.id };
    case "dreamwell":
      return { kind: source.kind, side: source.side, id: source.id };
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

/** The explicit persisted fields of a shown notice, identified without display names. */
export function projectNoticeDiagnostic(notice: EngineBattleNotice) {
  switch (notice.kind) {
    case "autoAnswered":
      return { kind: notice.kind, prompt: notice.prompt, role: notice.role, source: noticeSourceDiagnostic(notice.source) };
    case "noLegalTarget":
      return { kind: notice.kind, source: noticeSourceDiagnostic(notice.source) };
    case "capacityReached":
      return { kind: notice.kind, missing: notice.missing };
    default: {
      const exhaustive: never = notice;
      return exhaustive;
    }
  }
}

/** Captures a prompt's or ability's source from the batch's safe view. */
export type NoticeSource = (source: AbilitySource | PromptSource | null) => EngineBattleNoticeSource | null;

/**
 * The items `human` is shown for `events`, judged in `batch.state`, the
 * state that arrives with them; `before` is the state they started from.
 * `source` captures a notice's safe source. `eventStates` are the states
 * observed at each event (`batchStates`); an item shows its event's board
 * (`eventBoards`), and an item whose event went unobserved the batch's
 * state in the turn `batchTurnAt` gives it.
 */
export function presentationItems(
  events: readonly EngineEvent[],
  human: Side,
  batch: PresentationBatch,
  before: BattleState,
  source: NoticeSource,
  eventStates: readonly (BattleState | undefined)[] = [],
): PresentationItem[] {
  const { eventDwellMs } = BATTLE.presentation;
  // Items before the batch's first new turn show its state in the turn it
  // started in, so the turn announcement waits for them (a challenge's
  // scores, then the new turn).
  const turnAt = batchTurnAt(events, before.turn, batch.state.turn);
  const beforeTurn: PresentationBatch = {
    key: parsePresentationId(`${batch.key}:before-turn`),
    state: { ...batch.state, turn: before.turn },
  };
  const boards = eventBoards(events, before, batch.state, eventStates, turnAt);
  // The board the previous item showed: a reveal holds it.
  let shown: PresentationBatch = { key: parsePresentationId(`${batch.key}:before`), state: before };
  return events.flatMap((raw, index): PresentationItem[] => {
    const event = eventSeenBy(raw, human, batch.state);
    if (event === null) return [];
    const own = boards[index];
    const board: PresentationBatch =
      own !== undefined
        ? { key: parsePresentationId(`${batch.key}:event:${String(index)}`), state: own }
        : turnAt(index) === batch.state.turn
          ? batch
          : beforeTurn;
    const item = (
      presentation: PresentationItem["presentation"],
      dwellMs: number,
      visual: PresentationVisual | null = null,
      notice: EngineBattleNotice | null = null,
    ): PresentationItem[] => {
      if (presentation !== "reveal") shown = board;
      return [
        {
          key: parsePresentationId(`${batch.key}:${String(index)}`),
          presentation,
          dwellMs,
          visual,
          notice,
          batch: shown,
        },
      ];
    };
    switch (event.kind) {
      case "promptAutoAnswered":
        return event.side === human
          ? item("notice", eventDwellMs, null, {
              kind: "autoAnswered",
              prompt: event.prompt,
              role: event.purpose.role,
              source: source(event.purpose.source),
            })
          : [];
      case "capacityReached":
        return event.side === human ? item("notice", eventDwellMs, null, { kind: "capacityReached", missing: event.missing }) : [];
      case "noLegalTarget":
        return item("notice", eventDwellMs, null, { kind: "noLegalTarget", source: source(event.source) });
      case "cardPlayed":
        return event.side === human
          ? item("travel", eventDwellMs)
          : item("reveal", BATTLE.presentation.opponentPlayRevealDwellMs, {
              kind: "reveal",
              instance: event.instance,
              from: before.instances[event.instance]?.zone === "deck" ? "deck" : before.instances[event.instance]?.zone === "void" ? "void" : "hand",
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
