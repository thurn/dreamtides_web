import type {
  BattleSeed,
  CardId,
  DreamwellCardId,
  InstanceId,
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
}

export interface CardStatus {
  exhausted: boolean;
  /** Permanent gained spark; travels with the card across zones. */
  gainedSpark: number;
  counters: number;
  /** Created by an effect rather than drawn from a deck. */
  created: boolean;
}

export interface CardInstance {
  readonly id: InstanceId;
  readonly cardId: CardId;
  readonly owner: Side;
  controller: Side;
  zone: Zone;
  status: CardStatus;
  /** Monotonic timestamp of the last zone entry, for layer ordering. */
  enteredZoneAt: number;
}

export interface StackItem {
  readonly instance: InstanceId;
  readonly controller: Side;
  /** Targets chosen when the item was played. */
  readonly targets: readonly InstanceId[];
  /** The value chosen for X, if the item has an X. */
  readonly x: number | null;
}

export interface SideState {
  score: number;
  currentEnergy: number;
  maxEnergy: number;
  /** Fatigue suffered so far; the next one awards 2^fatigueCount ⍟. */
  fatigueCount: number;
  /** Top of the deck is index 0. */
  deck: InstanceId[];
  hand: InstanceId[];
  void: InstanceId[];
  banished: InstanceId[];
  /** `B0`–`B9`. */
  backRank: (InstanceId | null)[];
  /** `F0`–`F8`. */
  frontRank: (InstanceId | null)[];
}

export interface TurnState {
  /** Round number, from 1. Extra turns belong to no round. */
  round: number;
  /** Turns begun so far in the battle, extra turns included. */
  turnNumber: number;
  active: Side;
  phase: Phase;
  /** Whether the current turn is an extra turn. */
  extra: boolean;
  /** The side whose most recent non-extra turn this is or was. */
  lastNormal: Side;
  /** Pending extra turns; the last element is taken first (C8). */
  extraTurns: Side[];
  /** The next front-rank lane to resolve during the Challenge phase. */
  challengeLane: number | null;
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
  dreamwell: DreamwellState;
  challenge: ChallengeState | null;
  /** Automatic steps run since the last top-level decision. */
  automaticSteps: number;
  result: BattleResult | null;
}
