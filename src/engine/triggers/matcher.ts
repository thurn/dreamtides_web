import { linkedSourceContext, sourceAbilityGroups } from "../rules/linked-banish";
/**
 * The event bus and trigger matcher (D14; rules § Ability Types → Trigger
 * timing and order). Every emitted engine event is matched as it happens, so
 * "leaves" triggers see their cards as they last were; matches only join the
 * trigger queue, which drains after the current step, one `resolveTrigger`
 * step per trigger, before any player receives priority. "When … is
 * dissolved" abilities are matched against the character as it last was in
 * play, as its `leftPlay` event announces it, and trigger as they were
 * then, for the side that controlled their sources, once its `dissolved`
 * event confirms the dissolve. "When … is put into your void" abilities
 * match a card's `enteredVoid`, as it is once in the void (RD-hv-umm2.77-1),
 * "When you discard this card" abilities their own card's `discarded`, from
 * the void it went to (RD-hv-umm2.82-1), "When you erode …" abilities a
 * card's `eroded`, also once it is in its owner's void (RD-hv-umm2.87-1),
 * "When you reclaim …" abilities a `cardPlayed` whose play used Reclaim, with
 * the card on the stack, where "When you reclaim this character" sees it
 * (RD-hv-umm2.91-1), and "When you play a card from your void" abilities a
 * `cardPlayed` whose card left its owner's void for the stack, by Reclaim or a
 * play permission (RD-hv-umm2.93-1), and "When you return a character to
 * hand" abilities a `leftPlay` for a hand, as the character last was in play
 * (RD-hv-umm2.102-1), and "When you materialize your second …" abilities a
 * `materialized` by its place among its side's materializations this turn
 * (RD-hv-umm2.107-1). "When you abandon …" abilities look back like "when …
 * is dissolved": they are matched against the character as it last was in
 * play as its `leftPlay` announces it, and trigger once its `abandoned`
 * event confirms the abandon, so a character sees its own abandon
 * (RD-hv-umm2.532-1).
 */
import type { EngineCatalog } from "../catalog";
import { cardMatchesFilter, playedMatchesFilter } from "../continuous/characteristics";
import { worksInZone } from "../dsl/abilities";
import { matchesCharacter, resolvePlayer } from "../dsl/selectors";
import type { CardFilter, MaterializedSelector, MaterializeNth, NamedTrigger, Trigger, TriggeredAbility, TriggerSubject } from "../dsl/types";
import type { CardPlayedEvent } from "../events/kinds/card-played";
import type { LeftPlayEvent } from "../events/kinds/left-play";
import type { MaterializedEvent } from "../events/kinds/materialized";
import { conditionHolds, everyNode } from "../effects/interpreter";
import type { EngineEvent, EngineEventKind } from "../events";
import { instanceOrigin, oncePerTurnKey, originAbilities } from "../rules/activation";
import { endFloating, floatingTriggers } from "../rules/floating";
import { materializedThisTurn, recordMaterialized } from "../rules/turn-log";
import { charactersInPlay, isFigment } from "../rules/zones";
import type { EffectId, InstanceId, OncePerTurnKey, Side, Zone } from "../state/ids";
import { opponent, SIDES, sourceInstance } from "../state/ids";
import type { BattleState, FloatingEffect, MaterializedCard, QueuedTrigger, SparkGain } from "../state/types";
import type { ArmedTriggers, LookbackEventKind, StepContext, TriggerListener } from "../steps/types";
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
  erode: ["eroded"],
  reclaim: ["cardPlayed"],
  abandon: ["abandoned"],
  leavesPlay: ["leftPlay"],
  returnToHand: ["leftPlay"],
  dissolve: ["dissolved"],
  gainsSpark: ["sparkGained"],
  scores: ["laneResolved"],
  opponentScores: ["laneResolved"],
  leavesVoid: ["leftVoid"],
  putIntoVoid: ["enteredVoid"],
  challengeWith: ["challengersDesignated"],
  startOfTurn: ["turnStarted"],
  startOfFirstTurn: ["turnStarted"],
  endOfTurn: ["phaseChanged"],
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
 * by instance number, then the cards on the stack it controls, bottom
 * first, where only "When you reclaim this character" works
 * (RD-hv-umm2.91-1). A card `departing` from `side`'s play is ordered by the
 * zone it is going to; a card going to no ordered zone (the stack, the
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
  for (const item of state.stack) {
    if (item.kind === "card" && item.controller === side) result.push(cardListener(state, item.instance));
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
  readonly scored?: number;
}

const NO_SUBJECT: Match = { subject: null };

/**
 * Whether `trigger` matches `event` for `listener`. Every trigger needs its
 * ability to work in the listener's zone (`inZone`), except ▸Dissolved,
 * which fires from wherever the dissolved card went, and the look-back
 * triggers "when … is dissolved" and "when you abandon …", which match only
 * when `armed`: the ability matched the departing character, and worked
 * where its card was, as that character left play (`armLookbacks`).
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

/**
 * Whether the play `event` announces is a reclaim `trigger` names: by its
 * player, using Reclaim (the play step marks the card `playedViaReclaim`
 * before announcing it), and matching the filter by the characteristics it
 * was recorded with as it was played, as "when you play" does.
 */
function reclaimMatches(
  state: BattleState,
  catalog: EngineCatalog,
  trigger: Extract<Trigger, { readonly on: "reclaim" }>,
  event: CardPlayedEvent,
  you: Side,
): boolean {
  if (event.side !== resolvePlayer(you, trigger.player) || state.instances[event.instance]?.status.playedViaReclaim !== true) return false;
  const played = state.turnLog.played[event.side].filter((card) => card.instance === event.instance).pop();
  return played !== undefined && playedMatchesFilter(state, catalog, played, trigger.filter);
}

/**
 * Whether the card `id` a `cardPlayed` announces was played from its owner's
 * void, by Reclaim or a play permission: the stack item it was just played
 * onto records the move (RD-hv-umm2.93-1).
 */
function playedFromVoid(state: BattleState, id: InstanceId): boolean {
  return state.stack.some((item) => item.kind === "card" && item.instance === id && item.playedFromVoid === true);
}

/** Whether a turn-log materialization record matches a counted selector by the type it materialized with. */
function materializedMatches(card: MaterializedCard, selector: MaterializedSelector): boolean {
  return (
    card.cardType === "character" &&
    (selector.subtype === undefined || card.allTypes || card.subtype === selector.subtype) &&
    // A character with all character types is of every type, the excluded one included.
    (selector.notSubtype === undefined || !(card.allTypes || card.subtype === selector.notSubtype))
  );
}

/**
 * Whether the materialization `event` announces, of a character the trigger's
 * subject matched, is the `nth` (or, with `atLeast`, at least that) of its
 * side's this turn matching `selector` by type as each materialized.
 * `matchEvent` has just recorded it as its side's newest record, with the
 * types the subject read; earlier records count whether or not their
 * characters are still in play (RD-hv-umm2.107-1).
 */
function isNthMaterialized(state: BattleState, event: MaterializedEvent, selector: MaterializedSelector, nth: MaterializeNth): boolean {
  const count = materializedThisTurn(state, event.side).filter((card) => materializedMatches(card, selector)).length;
  return typeof nth === "number" ? count === nth : count >= nth.atLeast;
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
  if (trigger.on === "abandon") {
    // Armed by its filter against the character still in play; "you" is the side whose ability it was then (RD-hv-umm2.532-1).
    return event.kind === "abandoned" && armed && event.side === resolvePlayer(you, trigger.player) ? { subject: event.instance } : null;
  }
  if (trigger.on === "reclaim" && trigger.self === true) {
    // "When you reclaim this character" works from the stack its card was just played onto, whatever its ability's zone.
    return listener.zone === "stack" && event.kind === "cardPlayed" && event.instance === self && reclaimMatches(state, catalog, trigger, event, you)
      ? { subject: self }
      : null;
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
      if (trigger.from === "void" && !playedFromVoid(state, event.instance)) return null;
      // Each play matches by the characteristics it was recorded with (RD-hv-7x4l.34-1).
      const played = state.turnLog.played[event.side].filter((card) => playedMatchesFilter(state, catalog, card, trigger.filter));
      if (played[played.length - 1]?.instance !== event.instance) return null;
      return trigger.nth === undefined || played.length === trigger.nth ? { subject: event.instance } : null;
    }
    case "materialize":
      return event.kind === "materialized" &&
        subjectMatches(state, catalog, trigger.subject, event.instance, listener) &&
        (trigger.nth === undefined || isNthMaterialized(state, event, trigger.subject, trigger.nth))
        ? { subject: event.instance }
        : null;
    case "draw":
      return event.kind === "cardDrawn" &&
        event.side === resolvePlayer(you, trigger.player) &&
        (trigger.nth === undefined || state.turnLog.drawn[event.side] === trigger.nth)
        ? { subject: event.instance }
        : null;
    case "discard":
      // "When you discard this card" matches only its own card, which `discarded` announces once it is in the void (RD-hv-umm2.82-1).
      return event.kind === "discarded" &&
        event.side === resolvePlayer(you, trigger.player) &&
        (trigger.self !== true || event.instance === self) &&
        filterMatches(catalog, state, trigger.filter, event.instance)
        ? { subject: event.instance }
        : null;
    case "erode":
      // Erode announces its card once it is in its owner's void, so "When you erode this card" works from there.
      return event.kind === "eroded" &&
        event.side === resolvePlayer(you, trigger.player) &&
        (trigger.self !== true || event.instance === self) &&
        filterMatches(catalog, state, trigger.filter, event.instance)
        ? { subject: event.instance }
        : null;
    case "reclaim":
      return event.kind === "cardPlayed" && reclaimMatches(state, catalog, trigger, event, you) ? { subject: event.instance } : null;
    case "leavesPlay":
      return event.kind === "leftPlay" && subjectMatches(state, catalog, trigger.subject, event.instance, listener)
        ? { subject: event.instance }
        : null;
    case "returnToHand":
      // A return announces its character while it is still in play, so the ability sees it as it last was there (RD-hv-umm2.102-1).
      return event.kind === "leftPlay" &&
        event.to === "hand" &&
        (trigger.toYourHand !== true || state.instances[event.instance]?.owner === you) &&
        matchesCharacter(state, catalog, trigger.subject, event.instance, you, listener.source)
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
        ? { subject: event.challenger, scored: event.scored }
        : null;
    case "opponentScores":
      return event.kind === "laneResolved" && event.scored > 0 && state.turn.active === opponent(you)
        ? { subject: event.challenger, scored: event.scored }
        : null;
    case "leavesVoid":
      return event.kind === "leftVoid" &&
        event.side === resolvePlayer(you, trigger.player) &&
        filterMatches(catalog, state, trigger.filter, event.instance)
        ? { subject: event.instance }
        : null;
    case "putIntoVoid":
      // The card is in the void as `enteredVoid` announces it, so it matches by its characteristics there (RD-hv-umm2.77-1).
      return event.kind === "enteredVoid" &&
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
    case "endOfTurn":
      return event.kind === "phaseChanged" &&
        event.phase === "ending" &&
        (trigger.player === undefined || event.active === resolvePlayer(you, trigger.player))
        ? NO_SUBJECT
        : null;
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
  const self = sourceInstance(matched.source);
  const lastKnownSourceSpark = self === null ? matched.lastKnownSourceSpark : (ctx.departedSourceSpark.get(self) ?? matched.lastKnownSourceSpark);
  const effect = triggerBody(ctx.catalog, matched.origin, matched.ability, matched.node).effect;
  const linkedSource = everyNode(effect).some((node) => node.op === "linkedBanish")
    ? linkedSourceContext(ctx, matched.source, matched.origin, matched.ability) : null;
  const retained = { ...matched,
    ...(lastKnownSourceSpark === undefined ? {} : { lastKnownSourceSpark }),
    ...(linkedSource === null ? {} : { linkedSource }),
  };
  const hidden = matched.subject === null ? [] : sidesBlindTo(ctx.state, matched.subject);
  const trigger: QueuedTrigger = hidden.length === 0 ? retained : { ...retained, subjectHiddenFrom: hidden };
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
    ...(trigger.scored === undefined ? {} : { scored: trigger.scored }),
    ...(trigger.lastKnownSourceSpark === undefined ? {} : { lastKnownSourceSpark: trigger.lastKnownSourceSpark }),
    ...(trigger.linkedSource === undefined ? {} : { linkedSource: trigger.linkedSource }),
  });
}

/**
 * Matches `listener`'s triggered abilities, in `side`'s order. An ability
 * armed for a look-back event matches as its source was when armed, and only
 * in the order of the side that controlled it then; a listener `side` does
 * not control is a dissolved or abandoned card's place in that side's order.
 * Its own named ▸Dissolved ability uses the dissolve event's last in-play
 * controller (RD-hv-umm2.342-1); its other abilities use their current
 * controller.
 */
function matchListener(ctx: StepContext, side: Side, listener: Listener, event: EngineEvent, armed: ArmedTriggers): void {
  const departing = isLookbackEvent(event) && listener.source === event.instance;
  const dissolving = departing && event.kind === "dissolved";
  // A departed card's abilities as it left play, those it had gained included (rules § Gaining abilities).
  const departed = departing && armed.origin !== null ? { ...listener, origin: armed.origin } : listener;
  originAbilities(ctx.catalog, departed.origin).forEach((ability, index) => {
    if (ability.kind !== "triggered") return;
    const armedListener = armed.abilities.get(oncePerTurnKey(listener.source, index));
    const matching = armedListener ?? (
      dissolving && hasNamed(ability.trigger, "dissolved")
        ? { ...departed, controller: event.side }
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
 * delayed trigger ends as it triggers. Those armed for a look-back event
 * match as they were armed, ended since or not.
 */
function matchFloating(ctx: StepContext, side: Side, event: EngineEvent, armed: ArmedTriggers): void {
  const armedHere = armed.floating.filter((effect) => effect.controller === side);
  const current = floatingTriggers(ctx.state, side).filter((effect) => !armedHere.some((entry) => entry.id === effect.id));
  const ordered = [...current, ...armedHere].sort((a, b) => effectNumber(a.id) - effectNumber(b.id));
  for (const effect of ordered) {
    const floating = floatingListener(ctx, effect);
    if (floating === null || effect.change.kind !== "trigger") continue;
    const { ref, once, captured, lastKnownSourceSpark } = effect.change;
    const isArmed = armedHere.includes(effect);
    const match = matchTrigger(ctx.state, ctx.catalog, floating.trigger, event, floating.listener, true, isArmed);
    if (match === null) continue;
    if (once) endFloating(ctx, (entry) => entry.id === effect.id);
    enqueue(ctx, {
      source: effect.source,
      controller: side,
      origin: ref.origin,
      ability: ref.ability,
      node: ref.node,
      ...match,
      ...(captured === undefined ? {} : { captured: [...captured] }),
      ...(lastKnownSourceSpark === undefined ? {} : { lastKnownSourceSpark }),
    });
  }
}

const NOTHING_ARMED: ArmedTriggers = { abilities: new Map(), floating: [], origin: null };

/** The look-back events, and the zones a character leaving play for which may go on to announce each (`null`: it ceases to exist). */
const LOOKBACK_DESTINATIONS: { readonly [K in LookbackEventKind]: readonly (Zone | null)[] } = {
  dissolved: ["void", null],
  // A reclaimed character abandoned is banished instead, still abandoned.
  abandoned: ["void", "banished", null],
};

const LOOKBACK_EVENTS = Object.keys(LOOKBACK_DESTINATIONS) as LookbackEventKind[];

type LookbackEvent = Extract<EngineEvent, { readonly kind: LookbackEventKind }>;

function isLookbackEvent(event: EngineEvent): event is LookbackEvent {
  return event.kind === "dissolved" || event.kind === "abandoned";
}

/**
 * Whether `trigger`, or one of its `either` branches, is a look-back trigger
 * for `kind` matching the departing character `id` as it is now: "when …
 * is dissolved" by its selector (and `figment` flag), "when you abandon …"
 * by its filter.
 */
function armsFor(state: BattleState, catalog: EngineCatalog, kind: LookbackEventKind, trigger: Trigger, id: InstanceId, listener: Listener): boolean {
  if (trigger.on === "either") return trigger.triggers.some((branch) => armsFor(state, catalog, kind, branch, id, listener));
  if (kind === "abandoned") return trigger.on === "abandon" && filterMatches(catalog, state, trigger.filter, id);
  if (trigger.on !== "dissolve") return false;
  const instance = state.instances[id];
  if (instance === undefined || (trigger.figment !== undefined && isFigment(instance) !== trigger.figment)) return false;
  return matchesCharacter(state, catalog, trigger.subject, id, listener.controller, listener.source);
}

/**
 * Arms, as a character leaves play, the look-back abilities its later
 * `dissolved` or `abandoned` event fires: for a departure to the void or
 * for nowhere, every "when … is dissolved" ability, and for one to the
 * void, the Banished zone, or nowhere, every "when you abandon …" ability,
 * that works where its card is and matches the character as it is now,
 * still in play: its controller, types, and whether it is a figment. The
 * departing character's own abilities are among them. Each record keeps
 * each armed ability as it is now, its source's controller and the floating
 * trigger itself included, and where the character's own abilities come
 * from as it leaves, and waits on the step's context for its event; a
 * departure that turns out not to announce that event leaves it unused
 * until the character leaves play again.
 */
function armLookbacks(ctx: StepContext, event: LeftPlayEvent, departing: Departure | null): void {
  const kinds = LOOKBACK_EVENTS.filter((kind) => {
    ctx.armedTriggers[kind].delete(event.instance);
    return LOOKBACK_DESTINATIONS[kind].includes(event.to);
  });
  if (kinds.length === 0) return;
  const { state, catalog } = ctx;
  const leaving = state.instances[event.instance];
  const origin = leaving === undefined ? null : instanceOrigin(leaving);
  const armed = kinds.map((kind) => ({ kind, abilities: new Map<OncePerTurnKey, Listener>(), floating: [] as FloatingEffect[] }));
  for (const side of SIDES) {
    for (const listener of listeners(state, side, departing)) {
      originAbilities(catalog, listener.origin).forEach((ability, index) => {
        if (ability.kind !== "triggered" || !(listener.emblem || worksInZone(ability.zone, listener.zone))) return;
        for (const entry of armed) {
          if (armsFor(state, catalog, entry.kind, ability.trigger, event.instance, listener)) entry.abilities.set(oncePerTurnKey(listener.source, index), listener);
        }
      });
    }
  }
  for (const effect of state.floating) {
    const floating = floatingListener(ctx, effect);
    if (floating === null) continue;
    for (const entry of armed) {
      if (armsFor(state, catalog, entry.kind, floating.trigger, event.instance, floating.listener)) entry.floating.push(effect);
    }
  }
  for (const { kind, abilities, floating } of armed) ctx.armedTriggers[kind].set(event.instance, { abilities, floating, origin });
}

/** The abilities armed for the look-back `event` of its character, consumed by it. */
function takeArmed(ctx: StepContext, event: LookbackEvent): ArmedTriggers {
  const record = ctx.armedTriggers[event.kind];
  const armed = record.get(event.instance);
  record.delete(event.instance);
  return armed ?? NOTHING_ARMED;
}

/**
 * The card an event announces as leaving play, or as dissolved or abandoned
 * out of it, ordered by where it goes among the abilities of the side that
 * controlled it in play: one announced by `leftPlay`, while it is still
 * there; a dissolved or abandoned figment or other created card, which fires
 * its abilities before it ceases to exist; or another dissolved or abandoned
 * card, in its owner's void or, reclaimed, the Banished zone.
 */
function departure(state: BattleState, event: EngineEvent): Departure | null {
  if (event.kind === "leftPlay") return { instance: event.instance, side: event.side, to: event.to };
  if (!isLookbackEvent(event)) return null;
  const zone = state.instances[event.instance]?.zone;
  if (zone === undefined) return null;
  return { instance: event.instance, side: event.side, to: zone === "play" ? null : zone };
}

/**
 * Matches one event against every triggered ability, in the fixed order:
 * the active side first, then the other; within a side, its listeners, then
 * its floating and delayed triggers in creation order. A `materialized`
 * event first joins its side's turn log, so every match sees it counted.
 * Nothing triggers, and nothing is recorded, before the first turn begins or
 * after the battle ends.
 */
export function matchEvent(ctx: StepContext, event: EngineEvent): void {
  const { state } = ctx;
  if (state.turn.turnNumber === 0 || state.result !== null || !TRIGGERING.includes(event.kind)) return;
  if (event.kind === "leftPlay") {
    const instance = state.instances[event.instance];
    if (instance !== undefined) ctx.departedSourceObjects.set(event.instance, {
      enteredPlayAt: instance.enteredZoneAt, gained: sourceAbilityGroups(state, event.instance),
    });
  }
  if (event.kind === "materialized") recordMaterialized(state, ctx.catalog, event.side, event.instance);
  const departing = departure(state, event);
  const armed = isLookbackEvent(event) ? takeArmed(ctx, event) : NOTHING_ARMED;
  for (const side of [state.turn.active, opponent(state.turn.active)]) {
    for (const listener of listeners(state, side, departing)) matchListener(ctx, side, listener, event, armed);
    matchFloating(ctx, side, event, armed);
  }
  if (event.kind === "leftPlay") armLookbacks(ctx, event, departing);
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
