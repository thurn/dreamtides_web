/** Builders for triggered abilities, trigger matchers, conditions, and durations. */
import type { Effect } from "../effects/registry";
import type { Zone } from "../state/ids";
import type {
  CardFilter,
  CharacterSelector,
  Condition,
  Duration,
  FunctionalZone,
  NamedTrigger,
  PlayerRef,
  SubjectSpec,
  Trigger,
  TriggeredAbility,
  TriggerSubject,
} from "./types";

/** Whether `trigger`, or one of its `either` branches, is "When you discard this card". */
function concernsOwnDiscard(trigger: Trigger): boolean {
  return trigger.on === "either" ? trigger.triggers.some(concernsOwnDiscard) : trigger.on === "discard" && trigger.self === true;
}

/**
 * "When …, …". Works in play unless `zone` names a functional zone. "When
 * you discard this card" sees its card only in the void it was discarded
 * into, so an ability with it must work in the void, and only there: a
 * discarded created card, announced while still in hand, never enters one.
 */
export function triggered(
  trigger: Trigger,
  effect: Effect,
  options: { readonly zone?: FunctionalZone; readonly condition?: Condition; readonly oncePerTurn?: boolean } = {},
): TriggeredAbility {
  const zone = options.zone ?? "play";
  if (concernsOwnDiscard(trigger) && zone !== "void") {
    throw new Error(`"When you discard this card" works from the void, not "${zone}"`);
  }
  return {
    kind: "triggered",
    trigger,
    effect,
    zone,
    ...(options.condition === undefined ? {} : { condition: options.condition }),
    ...(options.oncePerTurn === true ? { oncePerTurn: true } : {}),
  };
}

function named(on: NamedTrigger): Trigger {
  return { on };
}

/** ▸Materialized. */
export const onMaterialized = (): Trigger => named("materialized");
/** ▸Dawn. */
export const onDawn = (): Trigger => named("dawn");
/** ▸Dusk. */
export const onDusk = (): Trigger => named("dusk");
/** ▸Night. */
export const onNight = (): Trigger => named("night");
/** ▸Challenge. */
export const onChallenge = (): Trigger => named("challenge");
/** ▸Dissolved. */
export const onDissolved = (): Trigger => named("dissolved");

/** "When you play a card matching `filter`", or "your `nth` such card this turn". */
export function whenYouPlay(filter: CardFilter = {}, nth?: number): Trigger {
  return { on: "play", player: "you", filter, ...(nth === undefined ? {} : { nth }) };
}

/** "When the opponent plays a card matching `filter`". */
export function whenOpponentPlays(filter: CardFilter = {}, nth?: number): Trigger {
  return { on: "play", player: "opponent", filter, ...(nth === undefined ? {} : { nth }) };
}

/** "When you materialize a character matching `subject`". */
export function whenMaterialize(subject: TriggerSubject = { controller: "you" }): Trigger {
  return { on: "materialize", subject };
}

/** "When you draw a card", or "your `nth` card this turn". */
export function whenDraw(player: PlayerRef = "you", nth?: number): Trigger {
  return { on: "draw", player, ...(nth === undefined ? {} : { nth }) };
}

export function whenDiscard(player: PlayerRef = "you", filter: CardFilter = {}): Trigger {
  return { on: "discard", player, filter };
}

/**
 * "When you discard this card": its own discard, by any cause, matched once
 * the card is in its owner's void. The ability works from the void, so
 * `triggered` requires `zone: "void"`.
 */
export function whenDiscardSelf(): Trigger {
  return { on: "discard", player: "you", filter: {}, self: true };
}

export function whenAbandon(player: PlayerRef = "you", filter: CardFilter = {}): Trigger {
  return { on: "abandon", player, filter };
}

/**
 * "When a character matching `subject` is dissolved", or with `figment`
 * only a figment (`true`) or a non-figment (`false`) one: "When a
 * non-figment character you control is dissolved".
 */
export function whenDissolved(
  subject: CharacterSelector = { controller: "you" },
  options: { readonly figment?: boolean } = {},
): Trigger {
  return { on: "dissolve", subject, ...(options.figment === undefined ? {} : { figment: options.figment }) };
}

export function whenLeavesPlay(subject: TriggerSubject = "self"): Trigger {
  return { on: "leavesPlay", subject };
}

/** "When a character matching `subject` gains ✦" (rules § Spark → Additional spark). */
export function whenGainsSpark(subject: TriggerSubject = { controller: "you" }): Trigger {
  return { on: "gainsSpark", subject };
}

export function whenScores(subject: TriggerSubject = "self"): Trigger {
  return { on: "scores", subject };
}

export function whenOpponentScores(): Trigger {
  return { on: "opponentScores" };
}

export function whenLeavesVoid(player: PlayerRef = "you", filter: CardFilter = {}): Trigger {
  return { on: "leavesVoid", player, filter };
}

/**
 * "When a card matching `filter` is put into your void" (or the opponent's,
 * with `player`): every route into that void, matched in the void.
 */
export function whenPutIntoVoid(player: PlayerRef = "you", filter: CardFilter = {}): Trigger {
  return { on: "putIntoVoid", player, filter };
}

/** "When you challenge with `count` or more characters matching `selector`" (C10). */
export function whenYouChallengeWith(count: number, selector: CharacterSelector = { controller: "you" }): Trigger {
  return { on: "challengeWith", count, selector };
}

export const atStartOfTurn = (): Trigger => ({ on: "startOfTurn" });
export const atStartOfFirstTurn = (): Trigger => ({ on: "startOfFirstTurn" });

/** A combined trigger: "▸Materialized, ▸Dawn". */
export function either(...triggers: readonly Trigger[]): Trigger {
  return { on: "either", triggers };
}

/** "If this card is in your void" and the like. */
export function sourceIn(zone: Zone): Condition {
  return { cond: "sourceIn", zone };
}

/** "It": the card the triggering event concerns. */
export function triggeringCard(): SubjectSpec {
  return { kind: "subject" };
}

export const permanent = (): Duration => "permanent";
export const untilEndOfTurn = (): Duration => "untilEndOfTurn";
export const untilYourNextTurn = (): Duration => "untilYourNextTurn";
export const untilNextDay = (): Duration => "untilNextDay";
export const whileSourceInPlay = (): Duration => "whileSourceInPlay";
export function untilOpponentPays(cost: number): Duration {
  return { duration: "untilOpponentPays", cost };
}
