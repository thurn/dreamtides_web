import { characteristics } from "../continuous/characteristics";
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
import { instanceCard } from "../catalog";
import { fixedEnergy } from "../dsl/energy";
import type { EngineCatalog } from "../catalog";
import { cardMatchesFilter, copiableCostOf, matchesFilter, playedMatchesFilter } from "../continuous/characteristics";
import { namedTriggersOf, worksInZone } from "../dsl/abilities";
import { matchesCharacter, resolvePlayer } from "../dsl/selectors";
import type { CardFilter, Variant, MaterializedSelector, MaterializeNth, NamedTrigger, Trigger, TriggeredAbility, TriggerSubject } from "../dsl/types";
import type { CardDrawnEvent } from "../events/kinds/card-drawn";
import type { CardPlayedEvent } from "../events/kinds/card-played";
import type { LeftPlayEvent } from "../events/kinds/left-play";
import type { MaterializedEvent } from "../events/kinds/materialized";
import { primitiveDefinition } from "../effects/registry";
import type { EffectNode } from "../effects/types";
import { conditionHolds, everyNode } from "../effects/interpreter";
import type { EngineEvent, EngineEventKind } from "../events";
import { abilitiesDisabled } from "../rules/ability-disabling";
import { abilityOrigin, instanceOrigin, oncePerTurnKey, originAbilities } from "../rules/activation";
import { endFloating, floatingTriggers } from "../rules/floating";
import { materializedThisTurn, recordMaterialized } from "../rules/turn-log";
import { effectiveSpark } from "../rules/spark";
import { charactersInPlay, isFigment } from "../rules/zones";
import type { AbilitySource, EffectId, InstanceId, OncePerTurnKey, Side, Zone } from "../state/ids";
import { opponent, SIDES, sourceInstance, sourceKey } from "../state/ids";
import type { BattleState, FloatingEffect, GainedAbilities, HandCopyContext, MaterializedCard, Printing, QueuedTrigger, SparkGain } from "../state/types";
import type { ArmedAbility, ArmedTriggers, LookbackEventKind, StepContext, TriggerBlocks, TriggerListener } from "../steps/types";
import { sidesBlindTo } from "../view/knowledge";
import { hasImmutableRepeatAllowance, hasNamedTrigger, ruleReactionBody, triggerBody } from "./body";
import { observeRuleReactions, sourceObserved } from "./rule-reactions";
import { observeNamedAdmissions, type NamedAdmission } from "./named-admissions";

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
  foresee: ["foresaw"],
  handBecomesEmpty: ["handEmptied"],
  namedAbilityTriggered: ["triggerQueued"],
  copy: ["cardCopied"],
  discard: ["discarded"],
  discardBatch: ["discardBatch"],
  erode: ["eroded"],
  reclaim: ["cardPlayed"],
  abandon: ["abandoned"],
  leavesPlay: ["leftPlay"],
  returnToHand: ["leftPlay"],
  dissolve: ["dissolved"],
  gainsSpark: ["sparkGained"],
  scores: ["laneResolved"],
  opponentScores: ["laneResolved"],
  removesEnemy: ["dissolved", "banished", "ceasedToExist"],
  leavesVoid: ["leftVoid"],
  putIntoVoid: ["enteredVoid"],
  challengeWith: ["challengersDesignated"],
  startOfTurn: ["turnStarted"],
  startOfFirstTurn: ["turnStarted"],
  endOfTurn: ["phaseChanged"],
};

/** Copiable values observed by a successful copy, shared with the renewal proof. */
export function copiedCardMatchesFilter(
  catalog: EngineCatalog,
  copied: { readonly printing: Printing; readonly variant: Variant },
  x: number,
  filter: CardFilter,
): boolean {
  const card = instanceCard(catalog, copied);
  return matchesFilter({ cardType: card.cardType, subtype: card.subtype, allTypes: false,
    cost: fixedEnergy(card.costs), speed: card.speed, spark: card.spark === "x" ? x : card.spark,
    namedTriggers: namedTriggersOf(card.abilities(copied.variant)) }, filter);
}

/** Every event kind a trigger can inspect, including all combined branches. */
export function triggerEventKinds(trigger: Trigger): readonly EngineEventKind[] {
  return trigger.on === "either" ? trigger.triggers.flatMap(triggerEventKinds) : TRIGGER_EVENTS[trigger.on];
}

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
  readonly triggeringAbility?: QueuedTrigger["triggeringAbility"];
  readonly handCopy?: HandCopyContext;
  readonly subject: InstanceId | null;
  /** Visibility captured at a confirmed public departure, even when the subject has since ceased to exist. */
  readonly subjectHiddenFrom?: readonly Side[];
  readonly lastKnownSubjectCost?: number;
  readonly lastKnownSubjectSpark?: number;
  readonly gain?: SparkGain;
  readonly scored?: number;
  readonly discardedCount?: number;
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
  admission?: NamedAdmission,
): Match | null {
  if (trigger.on === "either") {
    for (const branch of trigger.triggers) {
      const match = matchTrigger(state, catalog, branch, event, listener, inZone, armed, admission);
      if (match !== null) return match;
    }
    return null;
  }
  const match = matchKind(state, catalog, trigger, event, listener, inZone, armed, admission);
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

/** A draw matches its player and all-draw ordinal, then its card as it arrives in hand. */
function drawMatches(state: BattleState, catalog: EngineCatalog, trigger: Extract<Trigger, { readonly on: "draw" }>, event: CardDrawnEvent, you: Side): boolean {
  return event.side === resolvePlayer(you, trigger.player) &&
    (trigger.nth === undefined || state.turnLog.drawn[event.side] === trigger.nth) &&
    (trigger.filter === undefined || (event.instance !== null && filterMatches(catalog, state, trigger.filter, event.instance)));
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
  admission?: NamedAdmission,
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
    case "namedAbilityTriggered":
      return admission !== undefined && event.kind === "triggerQueued" &&
        admission.queued.controller === resolvePlayer(you, trigger.player) && hasNamedTrigger(admission.trigger, trigger.named)
          ? { subject: null, triggeringAbility: { named: trigger.named, occurrence: admission.queued,
            observedBy: admission.queued.repeated?.observedBy ?? SIDES.filter(viewer => sourceObserved({ state }, admission.queued.source, viewer)) } } : null;
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
    case "copy": {
      if (event.kind !== "cardCopied" || event.original === null || event.side !== resolvePlayer(you, trigger.player)) return null;
      const copied = state.instances[event.copy];
      if (copied === undefined) return null;
      const card = instanceCard(catalog, copied);
      const item = state.stack.find(item => item.kind === "card" && item.instance === event.copy);
      if (!copiedCardMatchesFilter(catalog, copied, item?.kind === "card" ? item.x ?? 0 : 0, trigger.filter)) return null;
      const hidden = event.originalHiddenFrom ?? sidesBlindTo(state, event.original);
      return { subject: event.original, subjectHiddenFrom: hidden, lastKnownSubjectCost: fixedEnergy(card.costs),
        ...(event.zone === "hand" && copied.printing.kind === "card" ? { handCopy: { printing: { ...copied.printing }, variant: structuredClone(copied.variant), ephemeral: copied.status.ephemeral, copier: event.side, originalHiddenFrom: [...hidden] } } : {}),
      };
    }
    case "materialize":
      return event.kind === "materialized" &&
        subjectMatches(state, catalog, trigger.subject, event.instance, listener) &&
        (trigger.nth === undefined || isNthMaterialized(state, event, trigger.subject, trigger.nth))
        ? { subject: event.instance }
        : null;
    case "draw":
      return event.kind === "cardDrawn" && drawMatches(state, catalog, trigger, event, you)
        ? { subject: event.instance }
        : null;
    case "foresee":
      return event.kind === "foresaw" && event.side === resolvePlayer(you, trigger.player) ? NO_SUBJECT : null;
    case "handBecomesEmpty":
      return event.kind === "handEmptied" && event.side === resolvePlayer(you, trigger.player) ? NO_SUBJECT : null;
    case "discardBatch":
      return event.kind === "discardBatch" && event.count > 0 && event.side === resolvePlayer(you, trigger.player)
        ? { subject: null, discardedCount: event.count } : null;
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
    case "removesEnemy": {
      if (event.kind !== "dissolved" && event.kind !== "banished" && event.kind !== "ceasedToExist") return null;
      const removal = event.kind === "dissolved" || event.kind === "banished" ? event.removal
        : event.kind === "ceasedToExist" ? event.banishedBy : undefined;
      if (removal === undefined || removal.controller !== you) return null;
      if (trigger.inChallenge === true) {
        return event.kind === "dissolved" && removal.kind === "challenge"
          ? { subject: removal.character, lastKnownSubjectCost: removal.characterCost, subjectHiddenFrom: [] }
          : null;
      }
      return { subject: event.instance, lastKnownSubjectCost: removal.victimCost, subjectHiddenFrom: [] };
    }
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

/** What blocks ability `index` of `source` from triggering now. */
function triggerBlocks(state: BattleState, catalog: EngineCatalog, source: AbilitySource, index: number): TriggerBlocks {
  const self = sourceInstance(source);
  return {
    disabled: self !== null && abilitiesDisabled(state, catalog, self, "triggered"),
    used: state.oncePerTurn.includes(oncePerTurnKey(source, index)),
  };
}

function sameGainedGroup(a: GainedAbilities, b: GainedAbilities | undefined): boolean {
  if (b === undefined) return false;
  if ("figment" in a) return "figment" in b && a.figment === b.figment;
  return "cardId" in b && a.cardId === b.cardId && a.variant === b.variant;
}

function sameGained(a: readonly GainedAbilities[], b: readonly GainedAbilities[]): boolean {
  return a.length === b.length && a.every((gained, at) => sameGainedGroup(gained, b[at]));
}

/**
 * Whether ability `index` of a listener armed for a look-back event is past
 * its card's own abilities while the abilities the card gained have changed
 * since it was armed: as a gained ability ends, the once-per-turn records
 * past the card's own are dropped (rules/floating.ts), so a use recorded now
 * would limit an ability the card gains later at that index (rules § Gaining
 * abilities).
 */
function gainedRecordsDropped(state: BattleState, catalog: EngineCatalog, listener: Listener, index: number): boolean {
  const { origin } = listener;
  if (origin.kind !== "card" || index < catalog.card(origin.cardId).abilities(origin.variant).length) return false;
  const now = abilityOrigin(state, listener.source);
  return now?.kind !== "card" || !sameGained(now.gained ?? [], origin.gained ?? []);
}

/**
 * What blocks an ability armed for a look-back event: what blocked it as its
 * character left play, and a once-per-turn use of its key the step recorded
 * since it was armed, so one departure's `abandoned` and `dissolved`, or
 * another trigger of the ability between them, use it at most once.
 */
function armedBlocks(ctx: StepContext, armed: ArmedAbility, key: OncePerTurnKey): TriggerBlocks {
  return { disabled: armed.blocks.disabled, used: armed.blocks.used || ctx.triggerUses.oncePerTurn.includes(key, armed.usesFrom) };
}

/**
 * Queues `ability` (index `index`) of `listener` if nothing stops it: a
 * disabled source, a once-per-turn ability that already triggered this
 * turn, or an intervening "if" that does not hold. An ability armed for a
 * look-back event reads the first two as `armedBlocks` does, and records
 * its once-per-turn use in battle state unless its card's records past its
 * own abilities were dropped since; the step records every use.
 */
function enqueueAbility(
  ctx: StepContext,
  listener: Listener,
  ability: TriggeredAbility,
  index: number,
  match: Match,
  armed: ArmedAbility | null = null,
): NamedAdmission | null {
  const { state, catalog } = ctx;
  const key = oncePerTurnKey(listener.source, index);
  const { disabled, used } = armed === null ? triggerBlocks(state, catalog, listener.source, index) : armedBlocks(ctx, armed, key);
  if (disabled || (ability.oncePerTurn === true && used)) return null;
  const scope = { controller: listener.controller, source: listener.source, optionalPaid: [] };
  if (ability.condition !== undefined && !conditionHolds(state, catalog, ability.condition, scope)) return null;
  if (ability.oncePerTurn === true) {
    ctx.triggerUses.oncePerTurn.push(key);
    if (armed === null || !gainedRecordsDropped(state, catalog, listener, index)) state.oncePerTurn.push(key);
  }
  const admitted = enqueue(ctx, { source: listener.source, controller: listener.controller, origin: listener.origin, ability: index, node: null, ...match }, ability.trigger);
  recordDawnAdmission(ctx, listener.source, ability.trigger);
  return admitted;
}

/** A delayed/floating body binds its own future subject, outside this copy occasion. */
function readsSubjectCopy(node: EffectNode, seen = new Set<EffectNode>()): boolean {
  if (seen.has(node) || node.op === "floatingTrigger") return false;
  seen.add(node);
  if ((node.op === "copyCard" || node.op === "copyCardTimes") && (node as import("../effects/primitives/copy-card").CopyCardNode).card.kind === "subject") return true;
  const definition = primitiveDefinition(node.op);
  return [...definition.children?.(node) ?? [], ...definition.deferred?.(node) ?? []].some(child => readsSubjectCopy(child, seen));
}

/** Whether this body reads the retained subject value, including nested value and target fields. */
function readsSubjectValue(value: unknown, kind: "subjectCost" | "subjectSpark", seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return ("value" in value && value.value === kind) || Object.values(value).some(field => readsSubjectValue(field, kind, seen));
}

/**
 * Queues `matched`, recording the sides that cannot identify its subject as
 * it triggers (a card drawn into or discarded from a hidden hand), which
 * never see it as this trigger's subject.
 */
function readsRepeat(node: EffectNode, seen = new Set<EffectNode>()): boolean {
  if (seen.has(node) || node.op === "floatingTrigger") return false;
  seen.add(node);
  if (node.op === "repeatTriggeringAbility") return true;
  const definition = primitiveDefinition(node.op);
  return [...definition.children?.(node) ?? [], ...definition.deferred?.(node) ?? []].some(child => readsRepeat(child, seen));
}

function enqueue(ctx: StepContext, matched: QueuedTrigger, descriptor: Trigger): NamedAdmission {
  const self = sourceInstance(matched.source);
  const lastKnownSourceSpark = self === null ? matched.lastKnownSourceSpark : (ctx.departedSourceSpark.get(self) ?? matched.lastKnownSourceSpark);
  const effect = triggerBody(ctx.catalog, matched.origin, matched.ability, matched.node).effect;
  const linkedSource = matched.linkedSource ?? (everyNode(effect).some((node) => node.op === "linkedBanish")
    ? linkedSourceContext(ctx, matched.source, matched.origin, matched.ability) : null);
  const { lastKnownSubjectCost: armedCost, lastKnownSubjectSpark: armedSpark, handCopy, triggeringAbility, ...record } = matched;
  const readsCopy = readsSubjectCopy(effect);
  const subjectCost = readsSubjectValue(effect, "subjectCost") ? armedCost ?? (matched.subject !== null && ctx.state.instances[matched.subject] !== undefined
    ? copiableCostOf(ctx.state, ctx.catalog, matched.subject) : undefined) : undefined;
  const subjectSpark = readsSubjectValue(effect, "subjectSpark") ? armedSpark : undefined;
  const retained = { ...record,
    ...(triggeringAbility === undefined || !readsRepeat(effect) ? {} : { triggeringAbility: JSON.parse(JSON.stringify({ ...triggeringAbility,
      readerObservedBy: triggeringAbility.readerObservedBy ?? matched.repeated?.observedBy ?? SIDES.filter(viewer => sourceObserved(ctx, matched.source, viewer)),
    })) as NonNullable<QueuedTrigger["triggeringAbility"]> }),
    ...(handCopy === undefined || !readsCopy ? {} : { handCopy }),
    ...(subjectCost === undefined ? {} : { lastKnownSubjectCost: subjectCost }),
    ...(subjectSpark === undefined ? {} : { lastKnownSubjectSpark: subjectSpark }),
    ...(lastKnownSourceSpark === undefined ? {} : { lastKnownSourceSpark }),
    ...(linkedSource === null ? {} : { linkedSource }),
  };
  const hidden = matched.subjectHiddenFrom ?? (matched.subject === null ? [] : sidesBlindTo(ctx.state, matched.subject));
  const trigger: QueuedTrigger = hidden.length === 0 ? retained : { ...retained, subjectHiddenFrom: hidden };
  ctx.state.triggerQueue.push(trigger);
  ctx.emit({
    kind: "triggerQueued",
    ...(trigger.triggeringAbility === undefined ? {} : { triggeringAbility: trigger.triggeringAbility }),
    source: trigger.source,
    controller: trigger.controller,
    ability: trigger.ability,
    node: trigger.node,
    subject: trigger.subject,
    ...(trigger.handCopy === undefined ? {} : { handCopy: trigger.handCopy }),
    ...(trigger.lastKnownSubjectCost === undefined ? {} : { lastKnownSubjectCost: trigger.lastKnownSubjectCost }),
    ...(trigger.lastKnownSubjectSpark === undefined ? {} : { lastKnownSubjectSpark: trigger.lastKnownSubjectSpark }),
    ...(trigger.subjectHiddenFrom === undefined ? {} : { subjectHiddenFrom: [...trigger.subjectHiddenFrom] }),
    ...(trigger.gain === undefined ? {} : { gain: trigger.gain }),
    ...(trigger.scored === undefined ? {} : { scored: trigger.scored }),
    ...(trigger.discardedCount === undefined ? {} : { discardedCount: trigger.discardedCount }),
    ...(trigger.lastKnownSourceSpark === undefined ? {} : { lastKnownSourceSpark: trigger.lastKnownSourceSpark }),
    ...(trigger.linkedSource === undefined ? {} : { linkedSource: trigger.linkedSource }),
  });
  return { queued: trigger, trigger: descriptor };
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
function matchListener(ctx: StepContext, side: Side, listener: Listener, event: EngineEvent, armed: ArmedTriggers, admission?: NamedAdmission): NamedAdmission[] {
  const admitted: NamedAdmission[] = [];
  const departing = isLookbackEvent(event) && listener.source === event.instance;
  const dissolving = departing && event.kind === "dissolved";
  // A departed card's abilities as it left play, those it had gained included (rules § Gaining abilities).
  const departed = departing && armed.origin !== null ? { ...listener, origin: armed.origin } : listener;
  originAbilities(ctx.catalog, departed.origin).forEach((ability, index) => {
    if (ability.kind !== "triggered") return;
    const armedAbility = armed.abilities.get(oncePerTurnKey(listener.source, index));
    const matching = armedAbility?.listener ?? (
      dissolving && hasNamedTrigger(ability.trigger, "dissolved")
        ? { ...departed, controller: event.side }
        : listener
    );
    if (matching.controller !== side) return;
    const inZone = matching.emblem || worksInZone(ability.zone, matching.zone);
    const match = matchTrigger(ctx.state, ctx.catalog, ability.trigger, event, matching, inZone, armedAbility !== undefined, admission);
    const queued = match === null ? null : enqueueAbility(ctx, matching, ability, index, { ...match,
      ...(armed.subjectCost === undefined || !isLookbackEvent(event) || match.subject !== event.instance ? {} : { lastKnownSubjectCost: armed.subjectCost }),
      ...(armed.subjectSpark === undefined || !isLookbackEvent(event) || match.subject !== event.instance ? {} : { lastKnownSubjectSpark: armed.subjectSpark }),
    }, armedAbility ?? null);
    if (queued !== null) admitted.push(queued);
  });
  return admitted;
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
 * one-shot (delayed) trigger ends as it triggers. Those armed for a
 * look-back event match as they were armed, even when their duration ended
 * since, but a one-shot trigger that has triggered this step does not
 * trigger again from any record still holding it.
 */
function matchFloating(ctx: StepContext, side: Side, event: EngineEvent, armed: ArmedTriggers, admission?: NamedAdmission): NamedAdmission[] {
  const admitted: NamedAdmission[] = [];
  const armedHere = armed.floating.filter((effect) => effect.controller === side);
  const current = floatingTriggers(ctx.state, side).filter((effect) => !armedHere.some((entry) => entry.id === effect.id));
  const live = armedHere.filter((effect) => !ctx.triggerUses.once.has(effect.id));
  const ordered = [...current, ...live].sort((a, b) => effectNumber(a.id) - effectNumber(b.id));
  for (const effect of ordered) {
    const floating = floatingListener(ctx, effect);
    if (floating === null || effect.change.kind !== "trigger") continue;
    const { ref, once, captured, lastKnownSourceSpark } = effect.change;
    const isArmed = armedHere.includes(effect);
    const match = matchTrigger(ctx.state, ctx.catalog, floating.trigger, event, floating.listener, true, isArmed, admission);
    if (match === null) continue;
    if (once) {
      ctx.triggerUses.once.add(effect.id);
      endFloating(ctx, (entry) => entry.id === effect.id);
    }
    admitted.push(enqueue(ctx, {
      source: effect.source,
      controller: side,
      origin: ref.origin,
      ability: ref.ability,
      node: ref.node,
      ...match,
      ...(armed.subjectCost === undefined || !isLookbackEvent(event) || match.subject !== event.instance ? {} : { lastKnownSubjectCost: armed.subjectCost }),
      ...(armed.subjectSpark === undefined || !isLookbackEvent(event) || match.subject !== event.instance ? {} : { lastKnownSubjectSpark: armed.subjectSpark }),
      ...(captured === undefined ? {} : { captured: [...captured] }),
      ...(lastKnownSourceSpark === undefined ? {} : { lastKnownSourceSpark }),
    }, floating.trigger));
    recordDawnAdmission(ctx, effect.source, floating.trigger);
  }
  return admitted;
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
 * each armed ability as it is now, its source's controller, what blocks it
 * now (disabled triggers, a once-per-turn use) and where the step's
 * once-per-turn uses stand (`ArmedAbility.usesFrom`), and the floating trigger
 * itself included, and where the character's own abilities come from as it
 * leaves, and waits on the step's context for its event; a
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
  const armed = kinds.map((kind) => ({ kind, abilities: new Map<OncePerTurnKey, ArmedAbility>(), floating: [] as FloatingEffect[] }));
  for (const side of SIDES) {
    for (const listener of listeners(state, side, departing)) {
      originAbilities(catalog, listener.origin).forEach((ability, index) => {
        if (ability.kind !== "triggered" || !(listener.emblem || worksInZone(ability.zone, listener.zone))) return;
        for (const entry of armed) {
          if (!armsFor(state, catalog, entry.kind, ability.trigger, event.instance, listener)) continue;
          entry.abilities.set(oncePerTurnKey(listener.source, index), {
            listener, blocks: triggerBlocks(state, catalog, listener.source, index), usesFrom: ctx.triggerUses.oncePerTurn.length,
          });
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
  for (const { kind, abilities, floating } of armed) ctx.armedTriggers[kind].set(event.instance, { abilities, floating, origin,
    ...(leaving === undefined ? {} : {
      subjectCost: copiableCostOf(state, catalog, event.instance),
      subjectSpark: event.spark ?? effectiveSpark(state, catalog, event.instance),
    }),
  });
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
  if (state.turn.turnNumber === 0 || state.result !== null || event.kind === "triggerQueued" || !TRIGGERING.includes(event.kind)) return;
  if (event.kind === "leftPlay") {
    const instance = state.instances[event.instance];
    if (instance !== undefined) ctx.departedSourceObjects.set(event.instance, {
      enteredPlayAt: instance.enteredZoneAt, gained: sourceAbilityGroups(state, event.instance),
    });
  }
  if (event.kind === "materialized") recordMaterialized(state, ctx.catalog, event.side, event.instance);
  const beforeDawn = state.turnLog.dawnProgress?.total ?? 0;
  const admitted: NamedAdmission[] = [];
  const departing = departure(state, event);
  const armed = isLookbackEvent(event) ? takeArmed(ctx, event) : NOTHING_ARMED;
  for (const side of [state.turn.active, opponent(state.turn.active)]) {
    for (const listener of listeners(state, side, departing)) admitted.push(...matchListener(ctx, side, listener, event, armed));
    admitted.push(...matchFloating(ctx, side, event, armed));
  }
  if (event.kind === "leftPlay") armLookbacks(ctx, event, departing);
  queueDawnReactions(ctx, beforeDawn);
  observeNamedAdmissions(ctx, admitted, (entry) => matchNamedAdmission(ctx, entry), () => hasNamedAdmissionObserver(ctx));
}

/** Structural presence only: real admission retains all condition and allowance checks. */
function containsNamedAdmissionObserver(trigger: Trigger): boolean {
  return trigger.on === "namedAbilityTriggered" || (trigger.on === "either" && trigger.triggers.some(containsNamedAdmissionObserver));
}

/** Current functional observers, including gained abilities and captured floating refs. */
function hasNamedAdmissionObserver(ctx: StepContext): boolean {
  for (const side of SIDES) {
    for (const listener of listeners(ctx.state, side, null)) {
      if (originAbilities(ctx.catalog, listener.origin).some(ability => ability.kind === "triggered" &&
        (listener.emblem || worksInZone(ability.zone, listener.zone)) && containsNamedAdmissionObserver(ability.trigger))) return true;
    }
    for (const effect of floatingTriggers(ctx.state, side)) {
      const selected = floatingListener(ctx, effect);
      if (selected !== null && containsNamedAdmissionObserver(selected.trigger)) return true;
    }
  }
  return false;
}

/** Match one retained occurrence without re-emitting or trusting an ordinary announcement. */
function matchNamedAdmission(ctx: StepContext, admission: NamedAdmission): NamedAdmission[] {
  const { queued } = admission;
  const event: EngineEvent = { kind: "triggerQueued", source: queued.source, controller: queued.controller,
    ability: queued.ability, node: queued.node, subject: queued.subject };
  const beforeDawn = ctx.state.turnLog.dawnProgress?.total ?? 0;
  const admitted: NamedAdmission[] = [];
  for (const side of [ctx.state.turn.active, opponent(ctx.state.turn.active)]) {
    for (const listener of listeners(ctx.state, side, null)) admitted.push(...matchListener(ctx, side, listener, event, NOTHING_ARMED, admission));
    admitted.push(...matchFloating(ctx, side, event, NOTHING_ARMED, admission));
  }
  queueDawnReactions(ctx, beforeDawn);
  return admitted;
}

/**
 * Queues the `named` triggered abilities of the card `id` outside their
 * occasion ("trigger its ▸Materialized ability"), subject to the same
 * checks as an ability that triggers on its own.
 */
export function triggerNamed(ctx: StepContext, id: InstanceId, named: NamedTrigger): void {
  triggerNamedBatch(ctx, [id], named);
}

/** Explicitly repeats one captured definition, never the source's current ability list. */
export function repeatCapturedTrigger(ctx: StepContext, binding: NonNullable<QueuedTrigger["triggeringAbility"]>): void {
  const original = binding.occurrence;
  if (original.kind !== undefined) throw new Error("A repeated cause must be a triggered ability");
  const body = triggerBody(ctx.catalog, original.origin, original.ability, original.node);
  if (!hasNamedTrigger(body.trigger, binding.named)) throw new Error("A repeated cause has no matching named trigger");
  if (original.node === null) {
    const ability = originAbilities(ctx.catalog, original.origin)[original.ability];
    if (ability?.kind !== "triggered") throw new Error("A repeated cause has no triggered definition");
  }
  // This captured occurrence spent its allowance even if gained records ended.
  if (!hasImmutableRepeatAllowance(ctx.catalog, original.origin, original.ability, original.node, body)) return;
  if (original.node === null && triggerBlocks(ctx.state, ctx.catalog, original.source, original.ability).disabled) return;
  if (body.condition !== null && !conditionHolds(ctx.state, ctx.catalog, body.condition,
    { controller: original.controller, source: original.source, optionalPaid: [] })) return;
  const beforeDawn = ctx.state.turnLog.dawnProgress?.total ?? 0;
  const admitted = enqueue(ctx, { ...original, repeated: { named: binding.named, observedBy: binding.observedBy ?? [], visibleTo: binding.readerObservedBy ?? [] } }, body.trigger);
  const audience = SIDES.filter(viewer => (binding.observedBy?.includes(viewer) === true && sourceObserved(ctx, original.source, viewer)) ||
    (binding.readerObservedBy?.includes(viewer) === true && (binding.named === "dawn" || binding.observedBy?.includes(viewer) === true)));
  recordDawnAdmission(ctx, original.source, body.trigger, audience);
  queueDawnReactions(ctx, beforeDawn);
  observeNamedAdmissions(ctx, [admitted], (entry) => matchNamedAdmission(ctx, entry), () => hasNamedAdmissionObserver(ctx));
}

/** One named-trigger instruction admits every selected source before its reactions. */
export function triggerNamedBatch(ctx: StepContext, ids: readonly InstanceId[], named: NamedTrigger): void {
  const beforeDawn = ctx.state.turnLog.dawnProgress?.total ?? 0;
  const admitted = ids.flatMap((id) => enqueueNamed(ctx, id, named));
  queueDawnReactions(ctx, beforeDawn);
  observeNamedAdmissions(ctx, admitted, (entry) => matchNamedAdmission(ctx, entry), () => hasNamedAdmissionObserver(ctx));
}

function enqueueNamed(ctx: StepContext, id: InstanceId, named: NamedTrigger): NamedAdmission[] {
  const admitted: NamedAdmission[] = [];
  const listener = cardListener(ctx.state, id);
  originAbilities(ctx.catalog, listener.origin).forEach((ability, index) => {
    if (ability.kind !== "triggered" || !hasNamedTrigger(ability.trigger, named)) return;
    if (named !== "dissolved" && !worksInZone(ability.zone, listener.zone)) return;
    const queued = enqueueAbility(ctx, listener, ability, index, { subject: id });
    if (queued !== null) admitted.push(queued);
  });
  return admitted;
}

/** Count successful admissions, not candidates or resolutions, and keep observer-qualified lower bounds. */
function recordDawnAdmission(ctx: StepContext, source: AbilitySource, trigger: Trigger, repeatAudience?: readonly Side[]): void {
  if (ctx.state.turn.phase !== "dawn" || !hasNamedTrigger(trigger, "dawn")) return;
  const progress = ctx.state.turnLog.dawnProgress ??= { total: 0, known: { player: 0, enemy: 0 } };
  progress.total += 1;
  for (const viewer of SIDES) if (repeatAudience === undefined ? sourceObserved(ctx, source, viewer) : repeatAudience.includes(viewer)) progress.known[viewer] += 1;
}

/** Threshold reactions follow every simultaneous admission in their causing batch (D14). */
function queueDawnReactions(ctx: StepContext, before: number): void {
  const { state, catalog } = ctx;
  const progress = state.turnLog.dawnProgress;
  if (state.turn.phase !== "dawn" || progress === undefined || progress.total === before) return;
  const changes = characteristics(state, catalog).changes(6);
  for (const side of [state.turn.active, opponent(state.turn.active)]) {
    for (const listener of listeners(state, side, null)) {
      const sourceChanges = changes.filter(({ staticSource }) =>
        staticSource !== null && sourceKey(staticSource) === sourceKey(listener.source))
        .sort((a, b) => (a.staticAbility ?? 0) - (b.staticAbility ?? 0));
      for (const { change, staticSource: source, staticAbility: ability } of sourceChanges) {
        if (change.kind !== "ruleModifier" || change.rule !== "dawnThreshold" || change.player !== state.turn.active ||
            before >= change.count || progress.total < change.count || source === null || ability === null) continue;
        const origin = abilityOrigin(state, source);
        if (origin === null) throw new Error("A live rule reaction has no ability origin");
        ruleReactionBody(catalog, origin, ability);
        state.triggerQueue.push({ kind: "ruleReaction", source, controller: change.player, origin, ability, node: null, subject: null });
        // The identifiable public reaction itself establishes that its threshold was met.
        observeRuleReactions(ctx);
        ctx.emit({ kind: "triggerQueued", source, controller: change.player, ability, node: null, subject: null });
      }
    }
  }
}
