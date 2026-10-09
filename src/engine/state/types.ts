import type { CardSubtype } from "../../types/card-identity";
import type { CardFilter, Condition, Keyword, Variant } from "../dsl/types";
import type { LoopTracker } from "../loops/types";
import type {
  AbilitySource,
  AvatarId,
  BattleSeed,
  CardId,
  DreamsignId,
  DreamwellCardId,
  EffectId,
  FigmentId,
  InstanceId,
  OncePerTurnKey,
  Phase,
  Side,
  Slot,
  Zone,
} from "./ids";

/** How the shared Dreamwell deck is constructed (rules § Dreamwell numbers and cycling). */
export interface DreamwellConfig {
  /** Deck tiers (`order`) sampled, in order, for every cycle. */
  readonly recurringOrders: readonly number[];
  /** Most cards taken from each recurring tier per cycle. */
  readonly cardsPerRecurringOrder: number;
  /** Cycles are appended until the prebuilt deck holds at least this many cards. */
  readonly minimumConstructedLength: number;
}

/**
 * Battle rules values for one battle, from the battle and Dreamwell data
 * modules plus the battle's own inputs. The engine reads every tunable from
 * here, so a serialized state determines its own replay.
 */
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
  /** Consecutive automatic steps after which exact repeats are checked for (rules § Mandatory Loops). */
  readonly mandatoryLoopCheckFrom: number;
  /** Longest cycle of automatic steps that exact-repeat detection finds (rules § Mandatory Loops). */
  readonly mandatoryLoopWindow: number;
  /** Iterations after which an accepted loop shortcut stops (rules § Optional Loops). */
  readonly loopIterationCap: number;
  /** Top-level actions in one main window that loop detection remembers. */
  readonly loopHistoryActions: number;
  /** Whether a prompt with exactly one legal answer is answered automatically. */
  readonly autoAnswerForcedPrompts: boolean;
  /**
   * Most step runs one feasibility search makes, and most answers a narrowed
   * play-time prompt examines (steps/feasibility.ts). Running out is
   * conservative: nothing unproven is offered.
   */
  readonly feasibilitySearchRuns: number;
  readonly dreamwell: DreamwellConfig;
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
  /**
   * Created by an effect rather than drawn from a deck, as every figment is:
   * it ceases to exist instead of entering a deck, a hand, a void, or the
   * Banished zone.
   */
  created: boolean;
  /** Played by Reclaim; it is banished instead of any other zone change. */
  reclaimed: boolean;
  /** Played by Offering; it is banished during each Ending, wherever it is. */
  offering: boolean;
  /** Drawn or created with Ephemeral; it is banished during Ending while it is in a hand. */
  ephemeral: boolean;
  /** The X paid to play the card, kept while it is in play (variable spark reads it); `null` elsewhere. */
  x: number | null;
}

/** Where an instance's copiable values (layer 1) come from. */
export type Printing =
  /** A catalog card for the instance's variant: a deck card, a created card, or a copy of a card. */
  | { readonly kind: "card"; readonly cardId: CardId }
  /** A figment of the figment catalog, with the base spark its creating text gives it ("a 2✦ Ethereal figment"). */
  | { readonly kind: "figment"; readonly figment: FigmentId; readonly spark: number }
  /**
   * A figment copy of a card (C5): the card's subtype, abilities, cost, and
   * base spark for the instance's variant; `spark` 0 for a "0✦ figment
   * copy", else `null`.
   */
  | { readonly kind: "figmentCopy"; readonly cardId: CardId; readonly spark: number | null };

export interface CardInstance {
  readonly id: InstanceId;
  readonly printing: Printing;
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

/**
 * The play-time choices for one effect: its modes, one per modal node on the
 * chosen path, and its targets, one list per target spec, both in walk order.
 */
export interface EffectChoices {
  readonly modes: readonly number[];
  readonly targets: readonly (readonly InstanceId[])[];
}

interface StackItemBase {
  readonly controller: Side;
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
  /**
   * The choices made when the card was played, one entry per event ability
   * in printed order. A synthetic test card's play hook stores its choices
   * as the first entry.
   */
  readonly choices: readonly EffectChoices[];
  /** The back-rank position a character was dropped on, used when it resolves if still open. */
  readonly slot?: Slot;
}

/**
 * Where an activated ability's definition comes from, captured at
 * activation so the ability resolves even if its source has left play.
 */
export type AbilityOrigin =
  | { readonly kind: "card"; readonly cardId: CardId; readonly variant: Variant }
  | { readonly kind: "figment"; readonly id: FigmentId }
  | { readonly kind: "avatar"; readonly id: AvatarId }
  | { readonly kind: "dreamsign"; readonly id: DreamsignId };

/** An activated ability on the stack. */
export interface AbilityStackItem extends StackItemBase {
  readonly kind: "ability";
  readonly source: AbilitySource;
  /** The ability's index in its source's ability list. */
  readonly ability: number;
  readonly origin: AbilityOrigin;
  /** The choices made when the ability was activated. */
  readonly choices: EffectChoices;
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

/**
 * A change to characteristics, applied by the layer evaluation
 * (continuous/layers.ts) while its floating effect lasts or its static
 * ability applies. Values and affected cards are fixed when the change is
 * made (RD-hv-7x4l.7-1).
 */
export type ContinuousChange =
  /** Layer 2: the character has all character types. */
  | { readonly kind: "allTypes"; readonly instance: InstanceId }
  /** Layer 3: the card gains (`gains`) or loses a keyword. */
  | { readonly kind: "keyword"; readonly instance: InstanceId; readonly keyword: Keyword; readonly gains: boolean }
  /** Layer 4: the character's base spark becomes `value`. */
  | { readonly kind: "baseSpark"; readonly instance: InstanceId; readonly value: number }
  /** Layer 5: spark gained with a duration, or spark a character has; it ends wherever the card is. */
  | { readonly kind: "spark"; readonly instance: InstanceId; readonly amount: number }
  /**
   * Layer 6: cards `player` plays that match `filter` cost `amount` more
   * (less when negative). A `next` modifier applies to one card: it ends as
   * that card is played.
   */
  | { readonly kind: "cost"; readonly player: Side; readonly filter: CardFilter; readonly amount: number; readonly next: boolean };

/** What a floating effect changes while it lasts. */
export type FloatingChange =
  | ContinuousChange
  /**
   * "Until end of turn, when …" (floating) or "the next time …" (delayed,
   * `once`: it ends as it triggers).
   */
  | { readonly kind: "trigger"; readonly ref: EffectRef; readonly once: boolean }
  /** The instance's triggered abilities do not trigger, while `while` holds if given. */
  | { readonly kind: "disableTriggers"; readonly instance: InstanceId; readonly while?: Condition }
  /** "Banish … until …": as the effect ends, the banished card returns to play under `side` (F3). */
  | { readonly kind: "banishedUntil"; readonly instance: InstanceId; readonly side: Side }
  /** "… until end of turn" on a created character: as the effect ends, it ceases to exist (C5). */
  | { readonly kind: "temporary"; readonly instance: InstanceId };

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
  /** The gain a "when … gains ✦" trigger matched; absent for any other trigger. */
  readonly gain?: SparkGain;
}

/**
 * One "gains +N✦" event as a trigger sees it: the amount and the expiry the
 * gained spark has, so "it gains 1 additional ✦" ends with it (rules § Spark →
 * Additional spark).
 */
export interface SparkGain {
  readonly amount: number;
  readonly expiry: Expiry;
}

/**
 * A card one side played this turn, with the effective characteristics it
 * had as it was played (RD-hv-7x4l.34-1).
 */
export interface PlayedCard {
  readonly instance: InstanceId;
  readonly cardType: "character" | "event";
  readonly subtype: CardSubtype;
  /** "Has all character types" as it was played: it matches every subtype a filter names. */
  readonly allTypes: boolean;
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

/**
 * Why the state-based victory check (P5) found a side winning: its score
 * reached the threshold, or else a "you win the game" ability it controls
 * in play had its condition hold (C15).
 */
export type WinReason = "score" | "winCondition";

export type EndReason = WinReason | "turnLimit" | "resolutionCap" | "mandatoryLoop";

/**
 * How a battle ended: a side wins only in the victory check (P5), by score
 * or by a "you win the game" condition (C15); every other ending, and both
 * sides winning in the same check, is a draw. A simultaneous-win draw's
 * reason is `score` when both sides won by score and `winCondition`
 * otherwise.
 */
export type BattleResult =
  | { readonly kind: "victory"; readonly winner: Side; readonly reason: WinReason }
  | { readonly kind: "draw"; readonly reason: EndReason };

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
  /**
   * The cards in decks and hands each side can identify beyond what their
   * zone shows it, in the order it learned them (view/knowledge.ts).
   */
  knownTo: Record<Side, InstanceId[]>;
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
  /** Loop detection and the loop shortcut (rules § Infinite Loops). */
  loops: LoopTracker;
  result: BattleResult | null;
}
