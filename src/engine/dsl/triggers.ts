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

/** "When …, …". Works in play unless `zone` names a functional zone. */
export function triggered(
  trigger: Trigger,
  effect: Effect,
  options: { readonly zone?: FunctionalZone; readonly condition?: Condition; readonly oncePerTurn?: boolean } = {},
): TriggeredAbility {
  return {
    kind: "triggered",
    trigger,
    effect,
    zone: options.zone ?? "play",
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

export function whenAbandon(player: PlayerRef = "you", filter: CardFilter = {}): Trigger {
  return { on: "abandon", player, filter };
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
