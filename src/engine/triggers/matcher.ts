/**
 * The event bus and trigger matcher (D14; rules § Ability Types → Trigger
 * timing and order). Every emitted engine event is matched as it happens, so
 * "leaves" triggers see their cards as they last were; matches only join the
 * trigger queue, which drains after the current step, one `resolveTrigger`
 * step per trigger, before any player receives priority. "When … is
 * dissolved" abilities are matched against the character as it last was in
 * play, as its `leftPlay` event announces it, and trigger as they were
 * then, for the side that controlled their sources, once its `dissolved`
 * event confirms the dissolve.
 */
import type { EngineCatalog } from "../catalog";
import { cardMatchesFilter, playedMatchesFilter } from "../continuous/characteristics";
import { worksInZone } from "../dsl/abilities";
import { matchesCharacter, resolvePlayer } from "../dsl/selectors";
import type { CardFilter, NamedTrigger, Trigger, TriggeredAbility, TriggerSubject } from "../dsl/types";
import type { LeftPlayEvent } from "../events/kinds/left-play";
import { conditionHolds } from "../effects/interpreter";
import type { EngineEvent, EngineEventKind } from "../events";
import { instanceOrigin, oncePerTurnKey, originAbilities } from "../rules/activation";
import { endFloating, floatingTriggers } from "../rules/floating";
import { charactersInPlay, isFigment } from "../rules/zones";
import type { EffectId, InstanceId, OncePerTurnKey, Side, Zone } from "../state/ids";
import { opponent, SIDES, sourceInstance } from "../state/ids";
import type { BattleState, FloatingEffect, QueuedTrigger, SparkGain } from "../state/types";
import type { ArmedDissolve, StepContext, TriggerListener } from "../steps/types";
import { sidesBlindTo } from "../view/knowledge";
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
  dissolve: ["dissolved"],
  gainsSpark: ["sparkGained"],
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

type Listener = TriggerListener;

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

/**
 * A card leaving play, or just dissolved out of it: the side that controlled
 * it in play, and the zone it is going to or went to (`null`: it ceases to
 * exist).
 */
interface Departure {
  readonly instance: InstanceId;
  readonly side: Side;
  readonly to: Zone | null;
}

/**
 * `side`'s listeners in the fixed order: avatar, dreamsigns, characters in
 * play (B0→B9 then F0→F8), then cards in its void, hand, and deck, each zone
 * by instance number. A card `departing` from `side`'s play is ordered by
 * the zone it is going to; a card going to no ordered zone (the stack, the
 * Banished zone, or nowhere) comes after the deck (RD-hv-7x4l.17-2). Its
 * listener sees it where it is: while it leaves, still in play; once
 * dissolved, in its owner's void, controlled by its owner, so in `side`'s
 * order its listener supplies its own ▸Dissolved ability and the abilities
 * it armed under `side` (`matchListener`).
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
  const moving = departing !== null && departing.side === side ? departing : null;
  for (const id of charactersInPlay(state, side)) {
    if (id !== moving?.instance) result.push(cardListener(state, id));
  }
  for (const zone of OTHER_ZONES) {
    const arriving = moving !== null && moving.to === zone ? [moving.instance] : [];
    const ids = [...sideState[zone].filter((id) => id !== moving?.instance), ...arriving].sort((a, b) => instanceNumber(a) - instanceNumber(b));
    for (const id of ids) result.push(cardListener(state, id));
  }
  if (moving !== null && !OTHER_ZONES.some((zone) => zone === moving.to)) result.push(cardListener(state, moving.instance));
  return result;
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

/** A match, the card its event concerns, and the gain a "when … gains ✦" trigger matched. */
interface Match {
  readonly subject: InstanceId | null;
  readonly gain?: SparkGain;
}

const NO_SUBJECT: Match = { subject: null };

/**
 * Whether `trigger` matches `event` for `listener`. Every trigger needs its
 * ability to work in the listener's zone (`inZone`), except ▸Dissolved,
 * which fires from wherever the dissolved card went, and "when … is
 * dissolved", which matches only when `armed`: its ability matched the
 * dissolved character, and worked where its card was, as that character left
 * play (`armDissolve`).
 */
function matchTrigger(
  state: BattleState,
  catalog: EngineCatalog,
  trigger: Trigger,
  event: EngineEvent,
  listener: Listener,
  inZone: boolean,
  armed: boolean,
): Match | null {
  if (trigger.on === "either") {
    for (const branch of trigger.triggers) {
      const match = matchTrigger(state, catalog, branch, event, listener, inZone, armed);
      if (match !== null) return match;
    }
    return null;
  }
  const match = matchKind(state, catalog, trigger, event, listener, inZone, armed);
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
  armed: boolean,
): Match | null {
  const self = sourceInstance(listener.source);
  const you = listener.controller;
  if (trigger.on === "dissolved") {
    return event.kind === "dissolved" && self !== null && event.instance === self ? { subject: self } : null;
  }
  if (trigger.on === "dissolve") {
    return event.kind === "dissolved" && armed ? { subject: event.instance } : null;
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
      // Each play matches by the characteristics it was recorded with (RD-hv-7x4l.34-1).
      const played = state.turnLog.played[event.side].filter((card) => playedMatchesFilter(state, catalog, card, trigger.filter));
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
    case "gainsSpark":
      return event.kind === "sparkGained" &&
        event.amount > 0 &&
        !event.additional &&
        subjectMatches(state, catalog, trigger.subject, event.instance, listener)
        ? { subject: event.instance, gain: { amount: event.amount, expiry: event.expiry } }
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
  match: Match,
): void {
  const { state, catalog } = ctx;
  const self = sourceInstance(listener.source);
  if (self !== null && triggersDisabled(state, catalog, self)) return;
  const key = oncePerTurnKey(listener.source, index);
  if (ability.oncePerTurn === true && state.oncePerTurn.includes(key)) return;
  const scope = { controller: listener.controller, source: listener.source, optionalPaid: [] };
  if (ability.condition !== undefined && !conditionHolds(state, catalog, ability.condition, scope)) return;
  if (ability.oncePerTurn === true) state.oncePerTurn.push(key);
  enqueue(ctx, { source: listener.source, controller: listener.controller, origin: listener.origin, ability: index, node: null, ...match });
}

/**
 * Queues `matched`, recording the sides that cannot identify its subject as
 * it triggers (a card drawn into or discarded from a hidden hand), which
 * never see it as this trigger's subject.
 */
function enqueue(ctx: StepContext, matched: QueuedTrigger): void {
  const hidden = matched.subject === null ? [] : sidesBlindTo(ctx.state, matched.subject);
  const trigger: QueuedTrigger = hidden.length === 0 ? matched : { ...matched, subjectHiddenFrom: hidden };
  ctx.state.triggerQueue.push(trigger);
  ctx.emit({
    kind: "triggerQueued",
    source: trigger.source,
    controller: trigger.controller,
    ability: trigger.ability,
    node: trigger.node,
    subject: trigger.subject,
    ...(trigger.subjectHiddenFrom === undefined ? {} : { subjectHiddenFrom: [...trigger.subjectHiddenFrom] }),
    ...(trigger.gain === undefined ? {} : { gain: trigger.gain }),
  });
}

/**
 * Matches `listener`'s triggered abilities, in `side`'s order. An ability
 * armed for a dissolve matches as its source was when armed, and only in the
 * order of the side that controlled it then; a listener `side` does not
 * control is a dissolved card's place in that side's order. Its own named
 * ▸Dissolved ability uses the dissolve event's last in-play controller
 * (RD-hv-umm2.342-1); its other abilities use their current controller.
 */
function matchListener(ctx: StepContext, side: Side, listener: Listener, event: EngineEvent, armed: ArmedDissolve): void {
  originAbilities(ctx.catalog, listener.origin).forEach((ability, index) => {
    if (ability.kind !== "triggered") return;
    const armedListener = armed.abilities.get(oncePerTurnKey(listener.source, index));
    const matching = armedListener ?? (
      event.kind === "dissolved" && listener.source === event.instance && hasNamed(ability.trigger, "dissolved")
        ? { ...listener, controller: event.side }
        : listener
    );
    if (matching.controller !== side) return;
    const inZone = matching.emblem || worksInZone(ability.zone, matching.zone);
    const match = matchTrigger(ctx.state, ctx.catalog, ability.trigger, event, matching, inZone, armedListener !== undefined);
    if (match !== null) enqueueAbility(ctx, matching, ability, index, match);
  });
}

/** A floating or delayed trigger's ability, and the listener it matches as: an emblem of its controller. */
function floatingListener(ctx: StepContext, effect: FloatingEffect): { trigger: Trigger; listener: Listener } | null {
  if (effect.change.kind !== "trigger") return null;
  const { ref } = effect.change;
  const { trigger } = triggerBody(ctx.catalog, ref.origin, ref.ability, ref.node);
  return { trigger, listener: { source: effect.source, controller: effect.controller, origin: ref.origin, zone: "play", emblem: true } };
}

function effectNumber(id: EffectId): number {
  return Number(id.slice(1));
}

/**
 * Matches `side`'s floating and delayed triggers in creation order; a
 * delayed trigger ends as it triggers. Those armed for a dissolve match as
 * they were armed, ended since or not.
 */
function matchFloating(ctx: StepContext, side: Side, event: EngineEvent, armed: ArmedDissolve): void {
  const armedHere = armed.floating.filter((effect) => effect.controller === side);
  const current = floatingTriggers(ctx.state, side).filter((effect) => !armedHere.some((entry) => entry.id === effect.id));
  const ordered = [...current, ...armedHere].sort((a, b) => effectNumber(a.id) - effectNumber(b.id));
  for (const effect of ordered) {
    const floating = floatingListener(ctx, effect);
    if (floating === null || effect.change.kind !== "trigger") continue;
    const { ref, once } = effect.change;
    const isArmed = armedHere.includes(effect);
    const match = matchTrigger(ctx.state, ctx.catalog, floating.trigger, event, floating.listener, true, isArmed);
    if (match === null) continue;
    if (once) endFloating(ctx, (entry) => entry.id === effect.id);
    enqueue(ctx, { source: effect.source, controller: side, origin: ref.origin, ability: ref.ability, node: ref.node, ...match });
  }
}

const NOTHING_ARMED: ArmedDissolve = { abilities: new Map(), floating: [] };

/** Whether `trigger`, or one of its `either` branches, is a "when … is dissolved" trigger matching `id` as it is now. */
function dissolveMatches(state: BattleState, catalog: EngineCatalog, trigger: Trigger, id: InstanceId, listener: Listener): boolean {
  if (trigger.on === "either") return trigger.triggers.some((branch) => dissolveMatches(state, catalog, branch, id, listener));
  if (trigger.on !== "dissolve") return false;
  const instance = state.instances[id];
  if (instance === undefined || (trigger.figment !== undefined && isFigment(instance) !== trigger.figment)) return false;
  return matchesCharacter(state, catalog, trigger.subject, id, listener.controller, listener.source);
}

/**
 * Arms, as a character leaves play for the void or for nowhere, every "when
 * … is dissolved" ability that works where its card is and matches the
 * character as it is now, still in play: its controller, types, and whether
 * it is a figment. The departing character's own abilities are among them.
 * The record keeps each armed ability as it is now, its source's controller
 * and the floating trigger itself included, and waits on the step's context
 * for the character's `dissolved` event; a departure that turns out not to
 * be a dissolve leaves it unused until the character leaves play again.
 */
function armDissolve(ctx: StepContext, event: LeftPlayEvent, departing: Departure | null): void {
  ctx.armedDissolves.delete(event.instance);
  if (event.to !== "void" && event.to !== null) return;
  const { state, catalog } = ctx;
  const abilities = new Map<OncePerTurnKey, Listener>();
  const floating: FloatingEffect[] = [];
  for (const side of SIDES) {
    for (const listener of listeners(state, side, departing)) {
      originAbilities(catalog, listener.origin).forEach((ability, index) => {
        if (ability.kind !== "triggered") return;
        const inZone = listener.emblem || worksInZone(ability.zone, listener.zone);
        if (inZone && dissolveMatches(state, catalog, ability.trigger, event.instance, listener)) abilities.set(oncePerTurnKey(listener.source, index), listener);
      });
    }
  }
  for (const effect of state.floating) {
    const entry = floatingListener(ctx, effect);
    if (entry !== null && dissolveMatches(state, catalog, entry.trigger, event.instance, entry.listener)) floating.push(effect);
  }
  if (abilities.size > 0 || floating.length > 0) ctx.armedDissolves.set(event.instance, { abilities, floating });
}

/** The abilities armed for the dissolve of `instance`, consumed by its `dissolved` event. */
function takeArmed(ctx: StepContext, instance: InstanceId): ArmedDissolve {
  const armed = ctx.armedDissolves.get(instance);
  ctx.armedDissolves.delete(instance);
  return armed ?? NOTHING_ARMED;
}

/**
 * The card an event announces as leaving play, or as dissolved out of it,
 * ordered by where it goes among the abilities of the side that controlled
 * it in play: one announced by `leftPlay`, while it is still there; a
 * dissolved figment or other created card, which fires ▸Dissolved before it
 * ceases to exist; or another dissolved card, in its owner's void.
 */
function departure(state: BattleState, event: EngineEvent): Departure | null {
  if (event.kind === "leftPlay") return { instance: event.instance, side: event.side, to: event.to };
  if (event.kind !== "dissolved") return null;
  const zone = state.instances[event.instance]?.zone;
  if (zone === undefined) return null;
  return { instance: event.instance, side: event.side, to: zone === "play" ? null : zone };
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
  const armed = event.kind === "dissolved" ? takeArmed(ctx, event.instance) : NOTHING_ARMED;
  for (const side of [state.turn.active, opponent(state.turn.active)]) {
    for (const listener of listeners(state, side, departing)) matchListener(ctx, side, listener, event, armed);
    matchFloating(ctx, side, event, armed);
  }
  if (event.kind === "leftPlay") armDissolve(ctx, event, departing);
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
    if (named !== "dissolved" && !worksInZone(ability.zone, listener.zone)) return;
    enqueueAbility(ctx, listener, ability, index, { subject: id });
  });
}
