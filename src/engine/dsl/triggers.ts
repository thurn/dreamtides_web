/** Builders for triggered abilities, trigger matchers, conditions, and durations. */
import type { Effect } from "../effects/registry";
import type { Zone } from "../state/ids";
import type {
  CardFilter,
  CharacterSelector,
  Condition,
  Duration,
  FunctionalZone,
  MaterializedSelector,
  MaterializeNth,
  NamedTrigger,
  PlayerRef,
  SubjectSpec,
  Trigger,
  TriggeredAbility,
  TriggerSubject,
} from "./types";

/** Whether `trigger`, or one of its `either` branches, is "When you discard this card" or "When you erode this card". */
function concernsOwnArrival(trigger: Trigger): boolean {
  if (trigger.on === "either") return trigger.triggers.some(concernsOwnArrival);
  return (trigger.on === "discard" || trigger.on === "erode") && trigger.self === true;
}

/**
 * "When …, …". Works in play unless `zone` names a functional zone. "When
 * you discard this card" and "When you erode this card" see their card only
 * in the void it went to, so an ability with either must work in the void,
 * and only there: a discarded created card, announced while still in hand,
 * never enters one.
 */
export function triggered(
  trigger: Trigger,
  effect: Effect,
  options: { readonly zone?: FunctionalZone; readonly condition?: Condition; readonly oncePerTurn?: boolean } = {},
): TriggeredAbility {
  const zone = options.zone ?? "play";
  if (concernsOwnArrival(trigger) && zone !== "void") {
    throw new Error(`"When you discard or erode this card" works from the void, not "${zone}"`);
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

/**
 * "When you play a card from your void" (or "When the opponent plays a card
 * from their void", with `player`): each card matching `filter`, as it was
 * played, that player plays from their void by Reclaim or a play permission,
 * matched as its play is announced, with the card on the stack. An ability
 * that works from the void does not see its own card played from there.
 */
export function whenPlayFromVoid(player: PlayerRef = "you", filter: CardFilter = {}): Trigger {
  return { on: "play", player, filter, from: "void" };
}

const MATERIALIZED_SELECTOR_FIELDS: readonly string[] = ["controller", "subtype", "notSubtype"] satisfies readonly (keyof MaterializedSelector)[];

/** Whether `subject` asks only what a turn-log materialization record answers: whose character, and its type. */
function isMaterializedSelector(subject: TriggerSubject): subject is MaterializedSelector {
  return subject !== "self" && Object.keys(subject).every((field) => MATERIALIZED_SELECTOR_FIELDS.includes(field));
}

/**
 * "When you materialize a character matching `subject`", or with `nth` "your
 * `nth` such character this turn" (a number) or "… if it is not among the
 * first" (`{ atLeast }`), counted by type as each materialized. A counted
 * subject names only whose characters and their types.
 */
export function whenMaterialize(subject?: TriggerSubject): Trigger;
export function whenMaterialize(subject: MaterializedSelector, nth: MaterializeNth): Trigger;
export function whenMaterialize(subject: TriggerSubject = { controller: "you" }, nth?: MaterializeNth): Trigger {
  if (nth === undefined) return { on: "materialize", subject };
  if (!isMaterializedSelector(subject)) {
    throw new Error(`A counted "when you materialize" names only whose characters and their types, not ${JSON.stringify(subject)}`);
  }
  const least = typeof nth === "number" ? nth : nth.atLeast;
  if (!Number.isSafeInteger(least) || least < 1) throw new Error(`A counted "when you materialize" needs a positive count, not ${least}`);
  return { on: "materialize", subject, nth };
}

/** "When you draw a card", or "your `nth` card this turn". */
export function whenDraw(player: PlayerRef = "you", nth?: number): Trigger {
  return { on: "draw", player, ...(nth === undefined ? {} : { nth }) };
}

/** "When you foresee": once after each completed positive Foresee operation. */
export function whenForesee(player: PlayerRef = "you"): Trigger {
  return { on: "foresee", player };
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

/**
 * "When you erode a card" (or "When the opponent erodes a card", with
 * `player`): each card matching `filter` that Erode puts from that player's
 * deck into their void, matched in the void.
 */
export function whenErode(player: PlayerRef = "you", filter: CardFilter = {}): Trigger {
  return { on: "erode", player, filter };
}

/**
 * "When you erode this card": its own erode from its owner's deck, by any
 * cause, matched once the card is in its owner's void. The ability works
 * from the void, so `triggered` requires `zone: "void"`. "When you discard
 * or erode this card" is `either(whenDiscardSelf(), whenErodeSelf())`.
 */
export function whenErodeSelf(): Trigger {
  return { on: "erode", player: "you", filter: {}, self: true };
}

/**
 * "When you reclaim a card" (or "When the opponent reclaims a card", with
 * `player`): each card matching `filter`, as it was played, that player
 * plays from their void by Reclaim, matched as its play is announced.
 */
export function whenReclaim(player: PlayerRef = "you", filter: CardFilter = {}): Trigger {
  return { on: "reclaim", player, filter };
}

/**
 * "When you reclaim this character": its own play by Reclaim, matched on the
 * stack it was just played onto, whatever the ability's zone. "It" and "this
 * character" name the card there, so "it gains +1✦" gives the card spark
 * that it keeps as it enters play.
 */
export function whenReclaimSelf(): Trigger {
  return { on: "reclaim", player: "you", filter: {}, self: true };
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

/**
 * "When you return a character you control to hand" (`subject`, by default
 * a character you control, the ability's own included), or with
 * `toYourHand` "When you return another character to your hand": each
 * matching character that leaves play for a hand, seen as it was just before
 * it left. "It" names the returned card.
 */
export function whenReturn(
  subject: CharacterSelector = { controller: "you" },
  options: { readonly toYourHand?: boolean } = {},
): Trigger {
  return { on: "returnToHand", subject, ...(options.toYourHand === true ? { toYourHand: true } : {}) };
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

/** "When you dissolve or banish an enemy": the removed character is the subject. */
export function whenRemovesEnemy(): Trigger {
  return { on: "removesEnemy" };
}

/** "When a character you control dissolves an enemy in a challenge": the removing character is the subject. */
export function whenDissolvesEnemyInChallenge(): Trigger {
  return { on: "removesEnemy", inChallenge: true };
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

/**
 * "At end of turn": as the Ending phase of the current turn begins, before
 * its cleanup, or with `player` only of that player's turns ("At the end of
 * your turn"). Inside `delayed`, "Banish them at end of turn".
 */
export function atEndOfTurn(player?: PlayerRef): Trigger {
  return { on: "endOfTurn", ...(player === undefined ? {} : { player }) };
}

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
