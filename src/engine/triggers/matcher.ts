/**
 * The event bus and trigger matcher (D14; rules § Ability Types → Trigger
 * timing and order). Every emitted engine event is matched as it happens, so
 * "leaves" triggers see their cards as they last were; matches only join the
 * trigger queue, which drains after the current step, one `resolveTrigger`
 * step per trigger, before any player receives priority.
 */
import type { EngineCatalog } from "../catalog";
import { cardMatchesFilter } from "../continuous/characteristics";
import { matchesCharacter, resolvePlayer } from "../dsl/selectors";
import type { CardFilter, FunctionalZone, NamedTrigger, Trigger, TriggeredAbility, TriggerSubject } from "../dsl/types";
import { conditionHolds } from "../effects/interpreter";
import type { EngineEvent, EngineEventKind } from "../events";
import { instanceOrigin, oncePerTurnKey, originAbilities } from "../rules/activation";
import { endFloating, floatingTriggers } from "../rules/floating";
import { charactersInPlay } from "../rules/zones";
import type { AbilitySource, InstanceId, Side, Zone } from "../state/ids";
import { opponent, sourceInstance } from "../state/ids";
import type { AbilityOrigin, BattleState, QueuedTrigger } from "../state/types";
import type { StepContext } from "../steps/types";
import { triggerBody } from "./body";

/** Every trigger kind except the `either` combinator, which matches through its branches. */
type TriggerKind = Exclude<Trigger["on"], "either">;

/**
 * The event kinds each trigger kind can match. Every trigger kind needs an
 * entry, so a new `Trigger` member fails to type-check until its events are
 * listed here, and `matchTrigger` refuses a match on an unlisted event.
 */
const TRIGGER_EVENTS: { readonly [K in TriggerKind]: readonly EngineEventKind[] } = {
  materialized: ["materialized"],
  dissolved: ["dissolved"],
  dawn: ["phaseChanged"],
  dusk: ["phaseChanged"],
  night: ["phaseChanged"],
  challenge: ["phaseChanged"],
  play: ["cardPlayed"],
  materialize: ["materialized"],
  draw: ["cardDrawn"],
  discard: ["discarded"],
  abandon: ["abandoned"],
  leavesPlay: ["leftPlay"],
  scores: ["laneResolved"],
  opponentScores: ["laneResolved"],
  leavesVoid: ["leftVoid"],
  challengeWith: ["challengersDesignated"],
  startOfTurn: ["turnStarted"],
  startOfFirstTurn: ["turnStarted"],
};

/** Event kinds some trigger can match; other events skip the matcher. */
const TRIGGERING: readonly EngineEventKind[] = Object.values(TRIGGER_EVENTS)
  .flat()
  .filter((kind, index, all) => all.indexOf(kind) === index);

/** A source whose abilities may trigger: an emblem, or a card in play or another zone. */
interface Listener {
  readonly source: AbilitySource;
  readonly controller: Side;
  readonly origin: AbilityOrigin;
  /** The source's zone; an emblem counts as in play. */
  readonly zone: Zone;
  readonly emblem: boolean;
}

function instanceNumber(id: InstanceId): number {
  return Number(id.slice(1));
}

function cardListener(state: BattleState, id: InstanceId): Listener {
  const instance = state.instances[id];
  if (instance === undefined) throw new Error(`Unknown instance ${id}`);
  return {
    source: id,
    controller: instance.controller,
    origin: instanceOrigin(instance),
    zone: instance.zone,
    emblem: false,
  };
}

/** The zones outside play whose cards may trigger, in trigger order. */
const OTHER_ZONES = ["void", "hand", "deck"] as const;

/** A card announced as leaving play, still in play, and the zone it is going to (`null`: it ceases to exist). */
interface Departure {
  readonly instance: InstanceId;
  readonly to: Zone | null;
}

/**
 * `side`'s listeners in the fixed order: avatar, dreamsigns, characters in
 * play (B0→B9 then F0→F8), then cards in its void, hand, and deck, each zone
 * by instance number. A `departing` card is still in play, and its listener
 * sees it there, but it is ordered by the zone it is going to; a card going
 * to no ordered zone (the stack, the Banished zone, or nowhere) comes after
 * the deck (RD-hv-7x4l.17-2).
 */
function listeners(state: BattleState, side: Side, departing: Departure | null): Listener[] {
  const sideState = state.sides[side];
  const result: Listener[] = [];
  if (sideState.avatar !== null) {
    result.push({ source: { kind: "avatar", side }, controller: side, origin: { kind: "avatar", id: sideState.avatar.id }, zone: "play", emblem: true });
  }
  sideState.dreamsigns.forEach((dreamsign, index) => {
    result.push({ source: { kind: "dreamsign", side, index }, controller: side, origin: { kind: "dreamsign", id: dreamsign.id }, zone: "play", emblem: true });
  });
  const moving = departing !== null && charactersInPlay(state, side).includes(departing.instance) ? departing : null;
  for (const id of charactersInPlay(state, side)) {
    if (id !== moving?.instance) result.push(cardListener(state, id));
  }
  for (const zone of OTHER_ZONES) {
    const arriving = moving !== null && moving.to === zone ? [moving.instance] : [];
    const ids = [...sideState[zone], ...arriving].sort((a, b) => instanceNumber(a) - instanceNumber(b));
    for (const id of ids) result.push(cardListener(state, id));
  }
  if (moving !== null && !OTHER_ZONES.some((zone) => zone === moving.to)) result.push(cardListener(state, moving.instance));
  return result;
}

function worksIn(zone: FunctionalZone, current: Zone): boolean {
  switch (zone) {
    case "play":
      return current === "play";
    case "any":
      return current === "play" || current === "void" || current === "hand" || current === "deck";
    default:
      return current === zone;
  }
}

function filterMatches(catalog: EngineCatalog, state: BattleState, filter: CardFilter, id: InstanceId): boolean {
  return cardMatchesFilter(state, catalog, id, filter);
}

function subjectMatches(
  state: BattleState,
  catalog: EngineCatalog,
  subject: TriggerSubject,
  id: InstanceId,
  listener: Listener,
): boolean {
  if (subject === "self") return id === sourceInstance(listener.source);
  return matchesCharacter(state, catalog, subject, id, listener.controller, listener.source);
}

/** A match and the card its event concerns. */
interface Match {
  readonly subject: InstanceId | null;
}

const NO_SUBJECT: Match = { subject: null };

/**
 * Whether `trigger` matches `event` for `listener`. Every trigger needs its
 * ability to work in the listener's zone (`inZone`), except ▸Dissolved,
 * which fires from wherever the dissolved card went.
 */
function matchTrigger(
  state: BattleState,
  catalog: EngineCatalog,
  trigger: Trigger,
  event: EngineEvent,
  listener: Listener,
  inZone: boolean,
): Match | null {
  if (trigger.on === "either") {
    for (const branch of trigger.triggers) {
      const match = matchTrigger(state, catalog, branch, event, listener, inZone);
      if (match !== null) return match;
    }
    return null;
  }
  const match = matchKind(state, catalog, trigger, event, listener, inZone);
  if (match !== null && !TRIGGER_EVENTS[trigger.on].includes(event.kind)) {
    throw new Error(`Trigger ${trigger.on} matched ${event.kind}, which TRIGGER_EVENTS does not list`);
  }
  return match;
}

/** `matchTrigger` for one trigger kind; `TRIGGER_EVENTS` lists the events each case can match. */
function matchKind(
  state: BattleState,
  catalog: EngineCatalog,
  trigger: Exclude<Trigger, { readonly on: "either" }>,
  event: EngineEvent,
  listener: Listener,
  inZone: boolean,
): Match | null {
  const self = sourceInstance(listener.source);
  const you = listener.controller;
  if (trigger.on === "dissolved") {
    return event.kind === "dissolved" && self !== null && event.instance === self ? { subject: self } : null;
  }
  if (!inZone) return null;
  switch (trigger.on) {
    case "materialized":
      return event.kind === "materialized" && self !== null && event.instance === self ? { subject: self } : null;
    case "dawn":
    case "dusk":
    case "night":
      return event.kind === "phaseChanged" && event.phase === trigger.on && event.active === you ? NO_SUBJECT : null;
    case "challenge":
      return event.kind === "phaseChanged" &&
        event.phase === "night" &&
        event.active === you &&
        self !== null &&
        state.instances[self]?.zone === "play" &&
        state.challenge?.challengers.includes(self) === true
        ? { subject: self }
        : null;
    case "play": {
      if (event.kind !== "cardPlayed" || event.side !== resolvePlayer(you, trigger.player)) return null;
      const played = state.turnLog.played[event.side].filter(
        (card) =>
          (trigger.filter.cardType === undefined || card.cardType === trigger.filter.cardType) &&
          (trigger.filter.subtype === undefined || card.subtype === trigger.filter.subtype),
      );
      if (played[played.length - 1]?.instance !== event.instance) return null;
      return trigger.nth === undefined || played.length === trigger.nth ? { subject: event.instance } : null;
    }
    case "materialize":
      return event.kind === "materialized" && subjectMatches(state, catalog, trigger.subject, event.instance, listener)
        ? { subject: event.instance }
        : null;
    case "draw":
      return event.kind === "cardDrawn" &&
        event.side === resolvePlayer(you, trigger.player) &&
        (trigger.nth === undefined || state.turnLog.drawn[event.side] === trigger.nth)
        ? { subject: event.instance }
        : null;
    case "discard":
      return event.kind === "discarded" &&
        event.side === resolvePlayer(you, trigger.player) &&
        filterMatches(catalog, state, trigger.filter, event.instance)
        ? { subject: event.instance }
        : null;
    case "abandon":
      return event.kind === "abandoned" &&
        event.side === resolvePlayer(you, trigger.player) &&
        filterMatches(catalog, state, trigger.filter, event.instance)
        ? { subject: event.instance }
        : null;
    case "leavesPlay":
      return event.kind === "leftPlay" && subjectMatches(state, catalog, trigger.subject, event.instance, listener)
        ? { subject: event.instance }
        : null;
    case "scores":
      return event.kind === "laneResolved" &&
        event.scored > 0 &&
        subjectMatches(state, catalog, trigger.subject, event.challenger, listener)
        ? { subject: event.challenger }
        : null;
    case "opponentScores":
      return event.kind === "laneResolved" && event.scored > 0 && state.turn.active === opponent(you)
        ? { subject: event.challenger }
        : null;
    case "leavesVoid":
      return event.kind === "leftVoid" &&
        event.side === resolvePlayer(you, trigger.player) &&
        filterMatches(catalog, state, trigger.filter, event.instance)
        ? { subject: event.instance }
        : null;
    case "challengeWith":
      return event.kind === "challengersDesignated" &&
        event.side === you &&
        event.challengers.filter((id) => matchesCharacter(state, catalog, trigger.selector, id, you, listener.source))
          .length >= trigger.count
        ? NO_SUBJECT
        : null;
    case "startOfTurn":
      return event.kind === "turnStarted" && event.side === you ? NO_SUBJECT : null;
    case "startOfFirstTurn":
      return event.kind === "turnStarted" && event.side === you && state.turn.sideTurns[you] === 1 ? NO_SUBJECT : null;
  }
}

/** Whether a floating effect disables the triggered abilities of `id` now. */
function triggersDisabled(state: BattleState, catalog: EngineCatalog, id: InstanceId): boolean {
  return state.floating.some(
    (effect) =>
      effect.change.kind === "disableTriggers" &&
      effect.change.instance === id &&
      (effect.change.while === undefined ||
        conditionHolds(state, catalog, effect.change.while, { controller: effect.controller, source: effect.source, optionalPaid: [] })),
  );
}

/**
 * Queues `ability` (index `index`) of `listener` if nothing stops it: a
 * disabled source, a once-per-turn ability that already triggered this
 * turn, or an intervening "if" that does not hold.
 */
function enqueueAbility(
  ctx: StepContext,
  listener: Listener,
  ability: TriggeredAbility,
  index: number,
  subject: InstanceId | null,
): void {
  const { state, catalog } = ctx;
  const self = sourceInstance(listener.source);
  if (self !== null && triggersDisabled(state, catalog, self)) return;
  const key = oncePerTurnKey(listener.source, index);
  if (ability.oncePerTurn === true && state.oncePerTurn.includes(key)) return;
  const scope = { controller: listener.controller, source: listener.source, optionalPaid: [] };
  if (ability.condition !== undefined && !conditionHolds(state, catalog, ability.condition, scope)) return;
  if (ability.oncePerTurn === true) state.oncePerTurn.push(key);
  enqueue(ctx, { source: listener.source, controller: listener.controller, origin: listener.origin, ability: index, node: null, subject });
}

function enqueue(ctx: StepContext, trigger: QueuedTrigger): void {
  ctx.state.triggerQueue.push(trigger);
  ctx.emit({
    kind: "triggerQueued",
    source: trigger.source,
    controller: trigger.controller,
    ability: trigger.ability,
    node: trigger.node,
    subject: trigger.subject,
  });
}

function matchListener(ctx: StepContext, listener: Listener, event: EngineEvent): void {
  originAbilities(ctx.catalog, listener.origin).forEach((ability, index) => {
    if (ability.kind !== "triggered") return;
    const inZone = listener.emblem || worksIn(ability.zone, listener.zone);
    const match = matchTrigger(ctx.state, ctx.catalog, ability.trigger, event, listener, inZone);
    if (match !== null) enqueueAbility(ctx, listener, ability, index, match.subject);
  });
}

/** Matches `side`'s floating and delayed triggers; a delayed trigger ends as it triggers. */
function matchFloating(ctx: StepContext, side: Side, event: EngineEvent): void {
  for (const effect of floatingTriggers(ctx.state, side)) {
    if (effect.change.kind !== "trigger") continue;
    const { ref, once } = effect.change;
    const { trigger } = triggerBody(ctx.catalog, ref.origin, ref.ability, ref.node);
    const listener: Listener = { source: effect.source, controller: side, origin: ref.origin, zone: "play", emblem: true };
    const match = matchTrigger(ctx.state, ctx.catalog, trigger, event, listener, true);
    if (match === null) continue;
    if (once) endFloating(ctx, (entry) => entry.id === effect.id);
    enqueue(ctx, { source: effect.source, controller: side, origin: ref.origin, ability: ref.ability, node: ref.node, subject: match.subject });
  }
}

/**
 * The card an event announces as leaving play while it is still there: one
 * announced by `leftPlay`, or a dissolved figment or other created card,
 * which fires ▸Dissolved before it ceases to exist.
 */
function departure(state: BattleState, event: EngineEvent): Departure | null {
  if (event.kind === "leftPlay") return { instance: event.instance, to: event.to };
  if (event.kind === "dissolved" && state.instances[event.instance]?.zone === "play") return { instance: event.instance, to: null };
  return null;
}

/**
 * Matches one event against every triggered ability, in the fixed order:
 * the active side first, then the other; within a side, its listeners, then
 * its floating and delayed triggers in creation order. Nothing triggers
 * before the first turn begins or after the battle ends.
 */
export function matchEvent(ctx: StepContext, event: EngineEvent): void {
  const { state } = ctx;
  if (state.turn.turnNumber === 0 || state.result !== null || !TRIGGERING.includes(event.kind)) return;
  const departing = departure(state, event);
  for (const side of [state.turn.active, opponent(state.turn.active)]) {
    for (const listener of listeners(state, side, departing)) matchListener(ctx, listener, event);
    matchFloating(ctx, side, event);
  }
}

function hasNamed(trigger: Trigger, named: NamedTrigger): boolean {
  return trigger.on === named || (trigger.on === "either" && trigger.triggers.some((branch) => hasNamed(branch, named)));
}

/**
 * Queues the `named` triggered abilities of the card `id` outside their
 * occasion ("trigger its ▸Materialized ability"), subject to the same
 * checks as an ability that triggers on its own.
 */
export function triggerNamed(ctx: StepContext, id: InstanceId, named: NamedTrigger): void {
  const listener = cardListener(ctx.state, id);
  originAbilities(ctx.catalog, listener.origin).forEach((ability, index) => {
    if (ability.kind !== "triggered" || !hasNamed(ability.trigger, named)) return;
    if (named !== "dissolved" && !worksIn(ability.zone, listener.zone)) return;
    enqueueAbility(ctx, listener, ability, index, id);
  });
}
