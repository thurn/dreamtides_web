import type { CardSubtype } from "../../types/card-identity";
import type { Condition, Variant } from "../dsl/types";
import type {
  AbilitySource,
  AvatarId,
  BattleSeed,
  CardId,
  DreamsignId,
  DreamwellCardId,
  EffectId,
  InstanceId,
  OncePerTurnKey,
  Phase,
  Side,
  Zone,
} from "./ids";

/** Battle rules values for one battle, from the battle data module plus the battle's own inputs. */
export interface BattleConfig {
  readonly scoreToWin: number;
  /** Rounds after which an unfinished battle is a draw (P11). */
  readonly turnLimit: number;
  readonly handLimit: number;
  readonly openingHandSize: Readonly<Record<Side, number>>;
  readonly startingSide: Side;
  /** Whether the starting side skips the Draw phase of the battle's first turn. */
  readonly skipFirstDraw: boolean;
  /** Consecutive automatic steps after which the battle is a draw (rules § Mandatory Loops). */
  readonly resolutionCap: number;
}

/** One journey deck entry as the battle receives it. */
export interface DeckEntry {
  readonly cardId: CardId;
  /** Played as its amplified text (the Amplified transfiguration). */
  readonly amplified?: boolean;
}

/** Everything a battle needs to start. */
export interface BattleInit {
  /** Battle seed, derived by the host from the game seed and battle index. */
  readonly seed: BattleSeed;
  readonly scoreToWin: number;
  readonly startingSide?: Side;
  readonly decks: Readonly<Record<Side, readonly DeckEntry[]>>;
  /** The Dreamwell catalog cards the shared Dreamwell deck is built from. */
  readonly dreamwell: readonly DreamwellCardId[];
  /** Each side's avatar, in play from the start of the battle (P4). */
  readonly avatars?: Readonly<Partial<Record<Side, AvatarId>>>;
  /** Each side's dreamsigns, in order. */
  readonly dreamsigns?: Readonly<Partial<Record<Side, readonly DreamsignId[]>>>;
}

export interface CardStatus {
  exhausted: boolean;
  /**
   * Permanent gained spark; travels with the card across zones. Spark gained
   * with a duration is a floating effect instead.
   */
  gainedSpark: number;
  counters: number;
  /** Created by an effect rather than drawn from a deck; it ceases to exist instead of leaving play or the stack. */
  created: boolean;
  /** Played by Reclaim; it is banished instead of any other zone change. */
  reclaimed: boolean;
  /** The X paid to play the card, kept while it is in play (variable spark reads it); `null` elsewhere. */
  x: number | null;
}

export interface CardInstance {
  readonly id: InstanceId;
  readonly cardId: CardId;
  readonly owner: Side;
  /**
   * The side controlling the card: in play or on the stack, its controller;
   * in a hand, the side whose hand holds it, which may differ from its owner;
   * in a deck, a void, or the Banished zone, its owner.
   */
  controller: Side;
  zone: Zone;
  readonly variant: Variant;
  status: CardStatus;
  /** Monotonic timestamp of the last zone entry, for layer ordering. */
  enteredZoneAt: number;
}

interface StackItemBase {
  readonly controller: Side;
  /** Modes chosen when the item was played, one per modal node on the chosen path in walk order. */
  readonly modes: readonly number[];
  /** Targets chosen when the item was played, one list per target spec in walk order. */
  readonly targets: readonly (readonly InstanceId[])[];
  /** The value chosen for X, if the item has an X. */
  readonly x: number | null;
  /**
   * Whether each optional cost was paid when the item was played, in printed
   * order. A copy of the item keeps this list (D15).
   */
  readonly optionalPaid: readonly boolean[];
}

/** A played card on the stack. */
export interface CardStackItem extends StackItemBase {
  readonly kind: "card";
  readonly instance: InstanceId;
}

/**
 * Where an activated ability's definition comes from, captured at
 * activation so the ability resolves even if its source has left play.
 */
export type AbilityOrigin =
  | { readonly kind: "card"; readonly cardId: CardId; readonly variant: Variant }
  | { readonly kind: "avatar"; readonly id: AvatarId }
  | { readonly kind: "dreamsign"; readonly id: DreamsignId };

/** An activated ability on the stack. */
export interface AbilityStackItem extends StackItemBase {
  readonly kind: "ability";
  readonly source: AbilitySource;
  /** The ability's index in its source's ability list. */
  readonly ability: number;
  readonly origin: AbilityOrigin;
}

export type StackItem = CardStackItem | AbilityStackItem;

/** A side's avatar: not a character; its exhausted status serves only its ☾ costs (P4). */
export interface AvatarEmblem {
  readonly id: AvatarId;
  exhausted: boolean;
}

export interface DreamsignEmblem {
  readonly id: DreamsignId;
}

/**
 * An effect lasting "until the opponent pays N●": `payer` may end it with the
 * `payToEnd` action (C7). Duration-bearing effects key their changes by `id`
 * and end when the record is removed.
 */
export interface PayableEffect {
  readonly id: EffectId;
  readonly payer: Side;
  /** Energy the payer pays to end the effect. */
  readonly cost: number;
  readonly source: AbilitySource;
  /** The characters whose changes from this effect end with it. */
  readonly affects: readonly InstanceId[];
}

/**
 * When a floating effect ends (rules § Durations). Every boundary counts
 * extra turns as their player's turns (C8).
 */
export type Expiry =
  /** "Until end of turn": Ending, step 3, or as the turn ends if it began later. */
  | { readonly at: "endOfTurn" }
  /** "Until your next turn": as `side` next begins a turn. */
  | { readonly at: "turnStart"; readonly side: Side }
  /** "Until the next Day phase": as any Day phase begins. */
  | { readonly at: "nextDay" }
  /** "While this is in play": as the source instance leaves play. */
  | { readonly at: "sourceLeavesPlay"; readonly source: InstanceId }
  /** "Until the opponent pays N●": as the linked payable effect ends (C7). */
  | { readonly at: "paid"; readonly effect: EffectId }
  | { readonly at: "never" };

/**
 * Names a floating or delayed trigger's node: the node at index `node` of
 * `everyNode` over the effect of ability `ability` of `origin`. Effects are
 * read from the catalog, never stored in the state.
 */
export interface EffectRef {
  readonly origin: AbilityOrigin;
  readonly ability: number;
  readonly node: number;
}

/** What a floating effect changes while it lasts. */
export type FloatingChange =
  /** Spark gained with a duration; it ends wherever the card is. */
  | { readonly kind: "spark"; readonly instance: InstanceId; readonly amount: number }
  /**
   * "Until end of turn, when …" (floating) or "the next time …" (delayed,
   * `once`: it ends as it triggers).
   */
  | { readonly kind: "trigger"; readonly ref: EffectRef; readonly once: boolean }
  /** The instance's triggered abilities do not trigger, while `while` holds if given. */
  | { readonly kind: "disableTriggers"; readonly instance: InstanceId; readonly while?: Condition };

/** A change with a duration, created by a resolving effect. */
export interface FloatingEffect {
  readonly id: EffectId;
  readonly controller: Side;
  readonly source: AbilitySource;
  /** The zone-entry clock when the effect began, for layer ordering. */
  readonly timestamp: number;
  readonly expiry: Expiry;
  readonly change: FloatingChange;
}

/**
 * A triggered ability waiting to resolve (D14). The ability is read from
 * `origin` as it was when it triggered, so it resolves even if its source has
 * since changed zones or ceased to exist.
 */
export interface QueuedTrigger {
  readonly source: AbilitySource;
  readonly controller: Side;
  readonly origin: AbilityOrigin;
  /** The ability's index in its origin's ability list. */
  readonly ability: number;
  /** A floating or delayed trigger's node in that ability's effect tree; `null` for a triggered ability. */
  readonly node: number | null;
  /** The card the triggering event concerns ("it", "that character"), if any. */
  readonly subject: InstanceId | null;
}

/** A card one side played this turn, with the characteristics it was played with. */
export interface PlayedCard {
  readonly instance: InstanceId;
  readonly cardType: "character" | "event";
  readonly subtype: CardSubtype;
}

/** Counters for the current turn, reset as each turn begins. */
export interface TurnLog {
  /** Cards each side played this turn, in order. Copies are not played (D15). */
  played: Record<Side, PlayedCard[]>;
  /** Cards each side drew this turn. */
  drawn: Record<Side, number>;
}

export interface SideState {
  score: number;
  currentEnergy: number;
  maxEnergy: number;
  /** Fatigue suffered so far; the next one awards 2^fatigueCount ⍟. */
  fatigueCount: number;
  /** Top of the deck is index 0. */
  deck: InstanceId[];
  /** Cards this side holds, including any the opponent owns. */
  hand: InstanceId[];
  void: InstanceId[];
  banished: InstanceId[];
  /** `B0`–`B9`. */
  backRank: (InstanceId | null)[];
  /** `F0`–`F8`. */
  frontRank: (InstanceId | null)[];
  avatar: AvatarEmblem | null;
  dreamsigns: DreamsignEmblem[];
}

export interface TurnState {
  /** Round number, from 1. Extra turns belong to no round. */
  round: number;
  /** Turns begun so far in the battle, extra turns included. */
  turnNumber: number;
  active: Side;
  phase: Phase;
  /** Turns each side has begun, extra turns included (C8). */
  sideTurns: Record<Side, number>;
  /** Whether the current turn is an extra turn. */
  extra: boolean;
  /** The side whose most recent non-extra turn this is or was. */
  lastNormal: Side;
  /** Pending extra turns; the last element is taken first (C8). */
  extraTurns: Side[];
  /** The next front-rank lane to resolve during the Challenge phase. */
  challengeLane: number | null;
  /**
   * The turn has begun and its Dreamwell phase has not: the abilities that
   * triggered as it began resolve first. `phase` is `"dreamwell"` meanwhile.
   */
  beginning: boolean;
}

export interface ChallengeState {
  /** Designated at the end of Day. */
  challengers: InstanceId[];
  /** Designated at the end of Dusk: challenger → blocker. */
  blockers: Record<InstanceId, InstanceId>;
}

export interface DreamwellState {
  /** The prebuilt shared deck; `next` indexes the card drawn next. */
  deck: DreamwellCardId[];
  next: number;
  /** The Dreamwell catalog the deck is rebuilt from when it runs out. */
  catalog: DreamwellCardId[];
}

export type EndReason = "score" | "turnLimit" | "resolutionCap" | "mandatoryLoop";

export interface BattleResult {
  readonly kind: "victory" | "draw";
  readonly winner?: Side;
  readonly reason: EndReason;
}

/**
 * The complete state of one battle. Plain JSON data: cloning, hashing, and
 * serialization never lose information, and it never contains a pending
 * prompt (prompts exist only while a step runs).
 */
export interface BattleState {
  /** Increments once per committed step. */
  version: number;
  readonly seed: BattleSeed;
  /** Draws consumed so far from each named random stream. */
  rng: Record<string, number>;
  /** Next instance number to mint. */
  nextInstance: number;
  /** Zone-entry clock for `enteredZoneAt`. */
  clock: number;
  readonly config: BattleConfig;
  turn: TurnState;
  sides: Record<Side, SideState>;
  instances: Record<InstanceId, CardInstance>;
  /** The last element is the top. */
  stack: StackItem[];
  priority: Side | null;
  /** Effects their payer may end with `payToEnd`, in registration order. */
  payable: PayableEffect[];
  /** Triggered abilities waiting to resolve, first in, first out (D14). */
  triggerQueue: QueuedTrigger[];
  /** Changes with a duration, in creation order. */
  floating: FloatingEffect[];
  turnLog: TurnLog;
  /** Next effect number to mint. */
  nextEffect: number;
  /** Once-per-turn abilities used (activated) or triggered this turn, by source key and ability index. */
  oncePerTurn: OncePerTurnKey[];
  dreamwell: DreamwellState;
  challenge: ChallengeState | null;
  /** Automatic steps run since the last top-level decision. */
  automaticSteps: number;
  result: BattleResult | null;
}
