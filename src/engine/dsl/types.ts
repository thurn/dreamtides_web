/**
 * The ability DSL: typed, declarative ability data (D5). Each entity's
 * abilities sit beside its printed text in its content module, and one
 * interpreter executes them. Effect nodes come from the primitive registry
 * (effects/primitives/); static abilities hold continuous primitives, which
 * the layer evaluation in continuous/ applies while their source is in play.
 */
import type { CardSubtype } from "../../types/card-identity";
import type { TransfigurationType } from "../../types/journey";
import type { Effect } from "../effects/registry";
import type { EffectNode } from "../effects/types";
import type { DiscardNode } from "../effects/primitives/discard";
import type { Zone } from "../state/ids";

/**
 * A journey deck entry's modifications (D39), applied to its copiable values
 * after its transfigurations (catalog.ts `instanceCard`): a type change, then
 * the cost reduction, Fast, and Reclaim keyword changes, then the spark bonus.
 * Abilities are kept: a type change never alters the ability list.
 */
export interface DeckMods {
  /** Additive spark of a character, after transfigurations. */
  readonly sparkBonus: number;
  /** Reduction of the card's energy cost, never below 0. */
  readonly costReduction: number;
  readonly fast: boolean;
  /** A granted or overridden Reclaim energy cost. */
  readonly reclaim: number | null;
  readonly typeChange: { readonly cardType: "character" | "event"; readonly subtype: CardSubtype } | null;
}

export const NO_DECK_MODS: DeckMods = { sparkBonus: 0, costReduction: 0, fast: false, reclaim: null, typeChange: null };

/**
 * The variant a card instance is played as: the amplified flag, the journey
 * transfigurations of its deck entry, its deck-entry modifications and ability type remap.
 * Transfigurations other than Amplified are carried for Phase 5.7a's
 * ability transforms. Unused optional fields are omitted.
 */
/** A single chronological application, with Perfected's original eligible constituent snapshot. */
export type ConstituentTransfiguration = Exclude<TransfigurationType, "Perfected">;
export type TransfigurationApplication =
  | { readonly form: ConstituentTransfiguration }
  | { readonly form: "Perfected"; readonly constituents: readonly ConstituentTransfiguration[] };

export interface Variant {
  /** Complete chronological mode; exclusive with legacy transfigurations membership. */
  readonly transfigurationApplications?: readonly TransfigurationApplication[];
  readonly amplified: boolean;
  readonly transfigurations?: readonly TransfigurationType[];
  readonly deckMods?: DeckMods;
  /** C12 literal ability references, independent of this card’s own subtype. */
  readonly typeRemap?: CardSubtype;
}

export const BASE_VARIANT: Variant = { amplified: false };

/** A side relative to an effect's controller. */
export type PlayerRef = "you" | "opponent";

/**
 * "X" in a selector's bound: the X paid for the selector's source card, the
 * value its stack item holds while it is on the stack and the value it keeps
 * while it is in play; 0 for any other source (RD-hv-umm2.66-1).
 */
export interface XValue {
  readonly value: "x";
}

/**
 * "The number of cards in your void", "for each character in your void": how
 * many cards are in one of a player's decks, hands, or voids as the value is
 * read, relative to the effect's controller like a zone reference (rules
 * § Zones → Counting cards in a zone, RD-hv-umm2.76-1). A void count may
 * count only the cards matching `filter`, by their current characteristics;
 * a hand or deck count is the number of cards there, which is public, so it
 * takes no filter and discloses nothing about the hidden cards.
 */
export type CardCountValue =
  | { readonly value: "countCards"; readonly zone: "void"; readonly player: PlayerRef; readonly filter: CardFilter }
  | { readonly value: "countCards"; readonly zone: "deck" | "hand"; readonly player: PlayerRef; readonly filter?: never };

/**
 * "This character's ✦": the source character's effective spark while it is
 * in play, else the effective spark it had immediately before it left play
 * while its ability was pending, else 0 (rules § Spark → This character's ✦,
 * RD-hv-umm2.91-2, RD-hv-umm2.460-1). Only a resolving effect, or an ability
 * choosing its targets, reads it; a static ability or the layer evaluation
 * cannot.
 */
export interface SourceSparkValue {
  readonly value: "sourceSpark";
}

/** Source-local counters, live in play or retained by this activation's own removal payment. */
export interface StoredCountersValue { readonly value: "storedCounters" }

/**
 * A number a character selector's cost or ✦ bound, or a void target's cost
 * bound, compares with: a constant, the source's X, a count of cards in a
 * zone, the source's ✦, or its stored counters, read each time the selector
 * is checked (RD-hv-umm2.501-1, rules § Counters). A counter bound reads the
 * live source count, else this activation's own removal-payment count, else 0.
 */
export type BoundValue = number | XValue | CardCountValue | SourceSparkValue | StoredCountersValue;

/** The triggering subject's captured copiable cost, before departure for look-back triggers; resolving effects only. */
export interface TriggerSubjectCostValue { readonly value: "subjectCost" }
/** The lookback trigger subject's effective spark immediately before departure; resolving effects only. */
export interface TriggerSubjectSparkValue { readonly value: "subjectSpark" }
/** A void target can also compare with its trigger's retained subject cost. */
export type VoidCostBound = BoundValue | TriggerSubjectCostValue;

/**
 * Which characters in play a selector matches. Cost bounds read the
 * copiable cost (rules § Costs, Requirements, and X → Cost changes); ✦ bounds
 * read the effective spark, clamped at 0. A bound that is a value is read
 * each time the selector is checked: as targets are offered and again as a
 * chosen target is checked on resolution.
 */
export interface CharacterSelector {
  readonly controller: "you" | "opponent" | "any";
  /** Has this named triggered ability, printed or gained and not lost. */
  readonly hasAbility?: NamedTrigger;
  /** Every outer predicate applies, plus at least one leaf; an empty list matches nobody. */
  readonly anyOf?: readonly CharacterPredicate[];
  /** Only characters of this type; a character with all character types matches every type. */
  readonly subtype?: CardSubtype;
  /**
   * Only characters that are not of this type: "a non-survivor character".
   * A character with all character types is of every type, so it never
   * matches.
   */
  readonly notSubtype?: CardSubtype;
  /** Excludes the effect's source. */
  readonly another?: boolean;
  readonly sparkAtMost?: BoundValue;
  readonly sparkAtLeast?: BoundValue;
  readonly costAtMost?: BoundValue;
  readonly costAtLeast?: BoundValue;
  /** `true` matches only figments, figment copies included (rules § Figments); `false` ("non-figment") only other characters. */
  readonly figment?: boolean;
  readonly exhausted?: boolean;
  readonly rank?: "front" | "back";
  /**
   * `true` matches only challengers, `false` only other characters, read
   * as the selector is checked (rules § Challengers, Blockers, and Scoring →
   * Holding a role).
   */
  readonly challenging?: boolean;
  /** A challenger sharing a current type with a distinct challenger its current controller controls. */
  readonly sharesTypeWithAnotherChallenger?: true;
  /** `true` matches only blockers, `false` only other characters, read as the selector is checked. */
  readonly blocking?: boolean;
}

/** A nonrecursive alternative sharing its enclosing selector’s controller. */
export type CharacterPredicate = Omit<CharacterSelector, "controller" | "anyOf"> & {
  readonly controller?: never;
  readonly anyOf?: never;
};

/**
 * Which cards on the stack a selector matches. Activated abilities on the
 * stack are not cards, so no stack selector matches them.
 */
export interface StackItemSelector {
  readonly kind: "stackItem";
  /** Whose item, relative to the effect's controller. */
  readonly controller: "you" | "opponent" | "any";
  readonly cardType?: "character" | "event";
  /** Inclusive copiable cost cap: variant and deck-entry changes, with X counting as 0. */
  readonly costAtMost?: number;
  /** Inclusive spark cap outside play; cards with no spark never match. */
  readonly sparkAtMost?: number;
  /** Only items that can be prevented: excludes cards that cannot be prevented. */
  readonly preventable?: boolean;
}

/** A card on the stack chosen when the card or ability is played. */
export interface StackTargetSpec {
  readonly kind: "stackTarget";
  readonly selector: StackItemSelector;
}

/** A target chosen when the card is played (rules § Targeting). */
export interface TargetSpec {
  readonly kind: "target";
  readonly selector: CharacterSelector;
  /** Alternative read when chosen and on resolution; payment conditions read the item’s retained optional-cost decisions. */
  readonly when?: { readonly condition: Condition; readonly otherwise: CharacterSelector };
  /** How many targets; defaults to 1. */
  readonly count?: number;
  /** "Up to N": fewer targets, including none, are allowed. */
  readonly upTo?: boolean;
}

/** Every character matching a selector, chosen by nobody. */
export interface AllSpec {
  readonly kind: "all";
  readonly selector: CharacterSelector;
}

/** The effect's own source. */
export interface SelfSpec {
  readonly kind: "self";
}

/** The card the triggering event concerns ("it", "that character"), while it is in play. */
export interface SubjectSpec {
  readonly kind: "subject";
}

/**
 * The front-rank characters the source supports (rules § The Play Area):
 * while the source is in its controller's back rank at `Bi`, the characters
 * at `F(i-1)` and `Fi` that match the selector's other fields.
 */
export interface SupportedSpec {
  readonly kind: "supported";
  readonly selector: Omit<CharacterSelector, "controller">;
}

/** One matching physical character in play, picked without targeting as the effect resolves. */
export interface RandomCharacterSpec {
  readonly kind: "randomCharacter";
  readonly selector: CharacterSelector;
}

/** The controlled character with highest current spark, oldest current play entry on ties; resolving, not targeted. */
export interface HighestSparkSpec {
  readonly kind: "highestSpark";
}

/** The latest actual character play of this subtype in the current turn. */
export interface LastPlayedSpec {
  readonly kind: "lastPlayed";
  readonly player: PlayerRef;
  readonly filter: { readonly cardType: "character"; readonly subtype: CardSubtype };
}

/** The latest actual materialization's physical character, while still controlled in play. */
export interface LastMaterializedSpec {
  readonly kind: "lastMaterialized";
  readonly player: PlayerRef;
}

/** The characters a character effect applies to. */
export type CharacterRef = TargetSpec | AllSpec | SelfSpec | SubjectSpec | SupportedSpec | RandomCharacterSpec | HighestSparkSpec | LastMaterializedSpec;

/**
 * Cards in one of a player's decks, hands, or voids that an effect names
 * (rules § Zones → References to cards in a zone). `player` is relative to
 * the effect's controller: a hand is the hand that side holds, a deck or void
 * the one it owns. A filtered reference reads each card's current
 * characteristics. No reference reveals a card: only what an effect then
 * does to the cards it names can.
 */
interface ZoneCardsBase {
  readonly kind: "inZone";
  readonly player: PlayerRef;
  readonly filter: CardFilter;
}

/**
 * "A character from your void", "up to two cards from the opponent's void":
 * void cards chosen as targets (rules § Targeting), when the card is played
 * or, for a triggered ability, as it resolves. A chosen card is still a
 * legal target as the effect resolves only while it is in that void, matches
 * the filter and the cost bound, can be targeted, and satisfies any `thisTurn`
 * qualification by successful current-turn physical membership. The same
 * qualification applies when targets are offered.
 */
export interface ZoneTargetSpec extends ZoneCardsBase {
  /** Intersects current-zone physical targets with successful occurrences this turn. */
  readonly thisTurn?: ZoneEverySpec["thisTurn"];
  readonly pick: "target";
  readonly zone: "void";
  readonly count: number;
  /** "Up to N": fewer targets, including none, are allowed. */
  readonly upTo?: boolean;
  /** Excludes the effect's source: "another warrior from your void". */
  readonly another?: boolean;
  /**
   * "≤X● cost events in your void", "cost less than or equal to this
   * character's ✦": only cards whose copiable cost is at most this bound. X
   * is the value picked as the card is played, before its targets
   * (RD-hv-umm2.142-1), and otherwise the source card's X (`XValue`); the
   * source's ✦ is read as `SourceSparkValue` says. Like a character
   * selector's bound, it is read as targets are offered and again as the
   * effect resolves (RD-hv-umm2.495-1, RD-hv-umm2.501-1).
   */
  readonly costAtMost?: VoidCostBound;
  /** Strictly less than this resolving bound. */
  readonly costLessThan?: VoidCostBound;
}

/**
 * "Cards in your void", "your hand", "characters in your deck": every
 * matching card, in zone order, chosen by nobody. `costAtMost`, a constant
 * or the source's X, read once as the effect resolves, keeps only cards whose
 * copiable cost is at most that value ("each ≤X● cost character in your
 * void").
 */
export interface ZoneEverySpec extends ZoneCardsBase {
  /** Intersects current-zone physical members with successful occurrences this turn. */
  readonly thisTurn?: "dissolved" | "abandoned" | "discarded";
  readonly pick: "every";
  readonly zone: CountedZone;
  /** Excludes the effect's source. */
  readonly another?: boolean;
  readonly costAtMost?: number | XValue;
}

/** "The top card of your deck": those of the top `count` cards that match, top first; fewer when the deck is shorter. */
export interface ZoneTopSpec extends ZoneCardsBase {
  readonly pick: "top";
  readonly zone: "deck";
  readonly count: number;
}

/**
 * "Two random ≤2● cost characters from your deck": up to `count` different
 * matching cards of the zone, picked uniformly without replacement from the
 * `random:selection` stream as the effect resolves (rules § Zones →
 * References to cards in a zone). They are chosen by nobody and are not
 * targets; with fewer matching cards it names all of them, and with none it
 * names none and draws nothing. `costGreaterThan`, read once as the effect
 * resolves, keeps only cards whose copiable cost is greater ("with higher
 * cost" than an abandoned character, RD-hv-umm2.83-2). Choosing them
 * reveals none of them and leaves the deck unshuffled (RD-hv-umm2.83-1).
 */
export interface ZoneRandomSpec extends ZoneCardsBase {
  /** Intersects current-zone physical members with successful occurrences this turn. */
  readonly thisTurn?: ZoneEverySpec["thisTurn"];
  readonly pick: "random";
  readonly zone: CountedZone;
  readonly count: number;
  readonly costGreaterThan?: ValueExpr;
  /** Read once at resolution; conjoined with the filter and any exclusive lower bound. */
  readonly costExactly?: ValueExpr;
  /** Read once at resolution; only strictly lower copiable costs match, alongside every other bound. */
  readonly costLessThan?: ValueExpr;
}

/** "This character from your void": the effect's source while it is in its controller's `zone`. */
export interface ZoneSelfSpec {
  readonly kind: "inZone";
  readonly pick: "self";
  readonly zone: CountedZone;
}

/** A reference to cards in a deck, hand, or void. */
export type ZoneCardSpec = ZoneTargetSpec | ZoneEverySpec | ZoneTopSpec | ZoneRandomSpec | ZoneSelfSpec;

/** Any target chosen at play time: characters in play, cards on the stack, or cards in a void. */
export type PlayTimeTarget = TargetSpec | StackTargetSpec | ZoneTargetSpec;

/**
 * "That card" in a resolving effect: the cards that changed zones or ceased
 * to exist while `node`, a node of the same effect, last resolved, as they
 * were just before it resolved (rules § Zone Changes → Cards an effect moved).
 * Before `node` resolves it names no card.
 */
export interface MovedCardRef {
  readonly kind: "movedCards";
  readonly node: EffectNode;
}

/** Actual discards of one earlier instruction, matched by effective type before departure. */
export interface DiscardCountValue {
  readonly value: "discardCount";
  readonly of: MovedCardRef & { readonly node: DiscardNode };
  readonly cardType: "character" | "event";
}

/** A number an effect reads when it resolves. */
/** Exact public occurrence counts for the current turn, relative to the reader's controller. */
export type CurrentTurnCountValue =
  | { readonly value: "playedThisTurn" | "charactersPlayedThisTurn" | "eventsPlayedThisTurn" | "discardedThisTurn" | "leftPlayThisTurn" | "dissolvedThisTurn" | "abandonedThisTurn"; readonly player: PlayerRef }
  | { readonly value: "materializedThisTurn"; readonly player: PlayerRef; readonly figment?: boolean };

export type ValueExpr =
  | CurrentTurnCountValue
  | number
  | XValue
  /** Counters currently stored on the source; payment departure may retain its scalar. */
  | StoredCountersValue
  /** The positive points awarded by the challenge that triggered this ability; 0 outside a scoring trigger. */
  | { readonly value: "scored" }
  /** The positive discard occasion captured by this trigger; 0 outside a batch trigger. */
  | { readonly value: "discardedCount" }
  | TriggerSubjectCostValue
  | TriggerSubjectSparkValue
  | DiscardCountValue
  /**
   * "That card's cost": the copiable cost of the cards `of` names, captured
   * just before they moved, so a card that then ceased to exist still has
   * one; their total when there are several, and 0 when there are none.
   */
  | { readonly value: "costOf"; readonly of: MovedCardRef }
  /** A fixed amount added to a value, such as a discarded card’s cost plus one. */
  | { readonly value: "plus"; readonly of: ValueExpr; readonly amount: number }
  | { readonly value: "count"; readonly of: CharacterSelector; readonly groupSize?: number }
  | { readonly value: "handSize"; readonly player: PlayerRef }
  | CardCountValue
  /** The characters supporting the source (C9): 0–2 while it is in the front rank, 0 elsewhere. */
  | { readonly value: "supporting" }
  /** "This character's ✦" in a resolving effect (`SourceSparkValue`). */
  | SourceSparkValue
  /** `of` multiplied by `factor`: "+2✦ for each …". */
  | { readonly value: "times"; readonly of: ValueExpr; readonly factor: number }
  /**
   * "+X✦ where X is …" in a resolving effect: `of`, evaluated once as the
   * effect resolves (RD-hv-7x4l.7-1). A static ability's values are live.
   */
  | { readonly value: "locked"; readonly of: ValueExpr };

/**
 * How long a change lasts (rules § Durations). "Until the opponent pays N●"
 * lets the opponent end it with the `payToEnd` action (C7).
 */
export type Duration =
  | "permanent"
  | "untilEndOfTurn"
  | "untilYourNextTurn"
  | "untilNextDay"
  | "whileSourceInPlay"
  | { readonly duration: "untilOpponentPays"; readonly cost: number };

/** A condition an effect checks when it resolves. */
export type Condition =
  /** A presently controlled in-play character made a positive Challenge award in the preceding global turn. */
  | { readonly cond: "scoredWithCharacterLastTurn"; readonly player: PlayerRef }
  | { readonly cond: "thisTurn"; readonly count: CurrentTurnCountValue; readonly atLeast: number; readonly atMost?: number }
  /** A committed event this turn from a physical card other than the resolving source. */
  | { readonly cond: "playedAnotherEventThisTurn" }
  /**
   * Characters in play matching the selector number at least `atLeast` and,
   * with `atMost`, at most that: "If you control no shadow figments" is
   * `atLeast: 0, atMost: 0`.
   */
  | { readonly cond: "controls"; readonly selector: CharacterSelector; readonly atLeast: number; readonly atMost?: number }
  | { readonly cond: "energyAtLeast"; readonly amount: number }
  /** The named controller-relative player's turn is active, including extra turns. */
  | { readonly cond: "turnOf"; readonly player: PlayerRef }
  /**
   * "If the additional cost was paid": whether the item's optional cost at
   * index `optional` (in printed order) was paid when it was played. A copy
   * counts the original's optional costs as paid (rules § Playing Cards and
   * the Stack → Copies on the stack).
   */
  | { readonly cond: "costPaid"; readonly optional: number }
  /** Whether the source's latest actual committed play used Reclaim; a created stack copy was not played. */
  | { readonly cond: "sourceWasReclaimed" }
  /** The source’s latest recorded play used its card-defined alternative; legacy absence is unknown. */
  | { readonly cond: "sourceWasAlternativePlayed" }
  /** "If this card is in your void": the source instance is in `zone`. An emblem is always in play. */
  | { readonly cond: "sourceIn"; readonly zone: Zone }
  /** The non-empty deck's top card matches the filter when the condition is checked, without revealing it. */
  | { readonly cond: "topOfDeck"; readonly player: PlayerRef; readonly filter: CardFilter }
  /** Count the player's cards in `zone` matching `filter`, within the inclusive bounds. */
  | { readonly cond: "cardsIn"; readonly player: PlayerRef; readonly zone: CountedZone; readonly filter?: CardFilter; readonly atLeast: number; readonly atMost?: number }
  | { readonly cond: "cardsIn"; readonly player: PlayerRef; readonly zone: CountedZone; readonly filter?: CardFilter; readonly atLeast?: number; readonly atMost: number };

/** A player's zone whose cards a condition counts. */
export type CountedZone = "deck" | "hand" | "void";

/** A continuous condition's bounds read public counts and earlier-layer characteristics, never a resolving source. */
export type StaticBoundValue = Exclude<BoundValue, SourceSparkValue>;

/** A public character selector whose bounds can be read without a resolving effect. */
export type StaticCharacterSelector = Omit<CharacterSelector, "sparkAtMost" | "sparkAtLeast" | "costAtMost" | "costAtLeast" | "anyOf"> & {
  readonly anyOf?: readonly (Omit<StaticCharacterSelector, "controller" | "anyOf"> & { readonly controller?: never; readonly anyOf?: never })[];
  readonly sparkAtMost?: StaticBoundValue;
  readonly sparkAtLeast?: StaticBoundValue;
  readonly costAtMost?: StaticBoundValue;
  readonly costAtLeast?: StaticBoundValue;
};

/** Inclusive limits on a public zone count. */
type StaticCountBounds =
  | { readonly atLeast: number; readonly atMost?: number }
  | { readonly atLeast?: number; readonly atMost: number };

/** A live static condition uses public inputs; optional payments and hidden-card filters require a resolving effect. */
export type StaticCondition =
  | Exclude<Condition, { readonly cond: "controls" | "costPaid" | "cardsIn" | "topOfDeck" | "playedAnotherEventThisTurn" | "sourceWasAlternativePlayed" }>
  | { readonly cond: "controls"; readonly selector: StaticCharacterSelector; readonly atLeast: number; readonly atMost?: number }
  | ({ readonly cond: "cardsIn"; readonly player: PlayerRef; readonly zone: "void"; readonly filter?: CardFilter } & StaticCountBounds)
  | ({ readonly cond: "cardsIn"; readonly player: PlayerRef; readonly zone: "hand" | "deck"; readonly filter?: never } & StaticCountBounds);

/**
 * Keywords a card has (layer 3). `reclaim` is plain Reclaim, played from the
 * void for its normal cost; "Reclaim N●" is a `reclaim` ability instead.
 * `cannotBeTargeted` is "cannot be targeted by effects" (C17): no effect,
 * its controller's included, chooses or keeps the card as a target, while
 * effects that do not target still apply to it.
 */
export type Keyword = "vengeful" | "awakened" | "cannotBePrevented" | "cannotBeTargeted" | "veil" | "reclaim" | "offering";

/** A timing category: when a card or activated ability may be played (rules § Playing Cards and the Stack). */
export type Speed = "standard" | "fast" | "interrupt";

/** N●. */
export interface EnergyCost {
  readonly cost: "energy";
  readonly amount: number;
}

/**
 * X●, chosen as the card is played or the ability activated (rules § Costs,
 * Requirements, and X). X is at least `min`: 1, unless the definition widens
 * it to 0 because X=0 does something meaningful.
 */
export interface EnergyXCost {
  readonly cost: "energyX";
  readonly min: number;
}

/** A cost paid to play a card: its printed energy, fixed and X parts in printed order ("2 X" pays 2● first, then X●). */
export type CardCost = EnergyCost | EnergyXCost;

/**
 * Which cards a filter matches, wherever they are: by effective type and
 * subtype, by copiable speed and cost (rules § Costs, Requirements, and X → Cost
 * changes), which a card keeps in every zone, and by effective spark in the
 * card's current zone (rules § Spark → Spark outside play). A filter is
 * plain data, kept as it is written wherever it is stored, so its bounds are
 * constants.
 */
export interface CardFilter {
  /** Has this named triggered ability, printed or gained and not lost. */
  readonly hasAbility?: NamedTrigger;
  /** A Fast card, including an Interrupt (rules § Timing categories). */
  readonly fast?: true;
  readonly cardType?: "character" | "event";
  readonly subtype?: CardSubtype;
  /** "A ≤2● cost character": copiable cost at most this. */
  readonly costAtMost?: number;
  /** "Cost ≥4●": copiable cost at least this; with an equal `costAtMost`, "a 2● cost character". */
  readonly costAtLeast?: number;
  /** "A ≤2✦ character": effective spark at most this; a card with no spark (an event) never matches. */
  readonly sparkAtMost?: number;
  /** "A ≥3✦ character": effective spark at least this; a card with no spark (an event) never matches. */
  readonly sparkAtLeast?: number;
}


/** A mandatory top-level abandon count, prepared before targets; alternative and optional payments use PaymentCost. */
export interface AbandonXCost {
  readonly cost: "abandon";
  readonly selector: CharacterSelector;
  readonly count: "x";
  readonly min: number;
  readonly captureCost?: never;
  readonly captureSpark?: never;
}

/** One payment, including a discard or banish count determined by X, with no choice between costs. */
export type PaymentCost =
  | EnergyCost
  /** ☾: exhausts the source, a ready back-rank character or the avatar. */
  | { readonly cost: "exhaustSelf" }
  /** Abandon characters you control that match the selector; captureCost captures one character’s copiable cost as X. */
  | { readonly cost: "abandon"; readonly selector: CharacterSelector | SelfSpec; readonly count: number; readonly captureCost?: never; readonly captureSpark?: never }
  | { readonly cost: "abandon"; readonly selector: CharacterSelector; readonly count: 1; readonly captureCost: true; readonly captureSpark?: never }
  /** Abandon one matching character and capture its effective spark before payment as X. */
  | { readonly cost: "abandon"; readonly selector: CharacterSelector; readonly count: 1; readonly captureCost?: never; readonly captureSpark: true }
  /** Return matching characters you control to hand, applying ordinary zone replacements. */
  | { readonly cost: "return"; readonly selector: CharacterSelector; readonly count: number }
  /** Discard a fixed number of matching hand cards. */
  | { readonly cost: "discard"; readonly count: number; readonly filter: CardFilter; readonly captureCost?: never; readonly min?: never }
  /**
   * Discard X matching hand cards: their count is captured as X, which is at
   * least `min` when given and may otherwise be 0 (rules § Costs,
   * Requirements, and X → Discard X cards).
   */
  | { readonly cost: "discard"; readonly count: "x"; readonly filter: CardFilter; readonly captureCost?: never; readonly min?: number }
  /** Discard one matching hand card and capture its copiable cost as X. */
  | { readonly cost: "discard"; readonly count: 1; readonly filter: CardFilter; readonly captureCost: true; readonly min?: never }
  /**
   * "Discard your hand": every card in the payer's hand as the costs are
   * chosen, except the card being played and cards used for its targets or
   * earlier costs. Nobody chooses the cards, and an empty hand pays it
   * (rules § Costs, Requirements, and X → Discard your hand).
   */
  | { readonly cost: "discard"; readonly count: "hand"; readonly filter?: never; readonly captureCost?: never; readonly min?: never }
  /** N⧗: spend counters stored on the source (rules § Counters). */
  | { readonly cost: "counters"; readonly amount: number }
  /** X⧗: choose and spend X counters on the source, sharing every other paid X. */
  | { readonly cost: "countersX"; readonly min: number }
  /**
   * "Pay N⍟": the payer's victory points drop by N. Payable only with at
   * least N⍟ (rules § Costs, Requirements, and X → Paying ⍟).
   */
  | { readonly cost: "points"; readonly amount: number }
  /** Give the payer’s opponent points as a payment; the payer spends no points. */
  | { readonly cost: "giveOpponentPoints"; readonly amount: number }
  /** Banish matching cards from the payer, opponent, or either public void. */
  | { readonly cost: "banishFromAnyVoid"; readonly player: PlayerRef | "any"; readonly count: number; readonly filter: CardFilter }
  /** Banish a fixed number of cards from your void that match the filter. */
  | { readonly cost: "banishFromVoid"; readonly count: number; readonly filter: CardFilter; readonly min?: never }
  /**
   * Banish X cards from your void that match the filter: their count is
   * captured as X, which is at least `min` (`banishXCost` supplies 1).
   */
  | { readonly cost: "banishFromVoid"; readonly count: "x"; readonly filter: CardFilter; readonly min: number }
  /** Banish other cards from your hand, as Offering pays. */
  | { readonly cost: "banishFromHand"; readonly count: number }
  /** Reveal cards from your hand that match the filter; they stay in hand. */
  | { readonly cost: "reveal"; readonly count: number; readonly filter: CardFilter }
  /** Reveal this exact physical source from the acting holder's hand. */
  | { readonly cost: "revealSource"; readonly count: 1 };

/** "A or B": the player chooses one alternative and pays every cost in it. */
export interface ChoiceCost {
  readonly cost: "choice";
  readonly options: readonly (readonly PaymentCost[])[];
}

/**
 * "You may A": the player chooses whether to pay. Whether it was paid is
 * recorded on the stack item, and effects read it with the `costPaid`
 * condition.
 */
export interface OptionalCost {
  readonly cost: "optional";
  readonly costs: readonly PaymentCost[];
}

/** A card's additional cost ("To play this card, …"): any payment except an X energy cost. */
export type AdditionalCost = PaymentCost | AbandonXCost | ChoiceCost | OptionalCost;

/**
 * One cost of an activated ability or a card (engine-design § Costs). An X
 * energy cost is only ever top-level. Choices among costs are play-time prompts;
 * payment happens after the commit point, in printed order.
 */
export type Cost = AdditionalCost | EnergyXCost;

/**
 * Where an activated ability works: in play, from its holder's hand, or its owner's void
 * ("…: Materialize this character from your void"). An emblem's abilities
 * always work.
 */
export type ActivationZone = Extract<FunctionalZone, "play" | "void" | "hand">;

/** "Cost: Effect" — an ability its controller activates; it goes on the stack. */
export interface ActivatedAbility {
  readonly kind: "activated";
  readonly costs: readonly Cost[];
  readonly effect: Effect;
  readonly speed: Speed;
  readonly oncePerTurn?: boolean;
  /**
   * Where its card must be to activate it; absent means play. From the hand,
   * its holder activates it with one mandatory top-level revealSource cost.
   * From the void, its owner activates it, and ☾ and other costs only a character in
   * play can pay are unpayable (rules § Ability Types → Where activated
   * abilities work).
   */
  readonly zone?: ActivationZone;
}

/**
 * "To play this card, …" or "You may … to play this card": costs a card adds
 * to its printed energy cost. They are chosen and paid with it, after it.
 */
export interface AdditionalCostAbility {
  readonly kind: "additionalCost";
  readonly costs: readonly AdditionalCost[];
}

/** A card-defined replacement for its printed energy costs; additional costs still apply. */
export interface AlternativeCostAbility {
  readonly kind: "alternativeCost";
  readonly costs: readonly Cost[];
  /** Qualifies this replacement route before payment, leaving normal routes intact. */
  readonly condition?: StaticCondition;
  /** This selected play enters ready without granting an Awakened keyword. */
  readonly materializesAwakened?: true;
}

/** The named (▸) triggers: each concerns the ability's own card or its controller's phase. */
export type NamedTrigger = "materialized" | "dawn" | "dusk" | "night" | "challenge" | "dissolved";

/** The cards a "when" trigger concerns: the ability's own card, or characters matching a selector. */
export type TriggerSubject = "self" | CharacterSelector;

/**
 * The part of a character selector a turn-log materialization record
 * answers: whose character it is, and its type as it materialized.
 */
export type MaterializedSelector = Pick<CharacterSelector, "controller" | "subtype" | "notSubtype">;

/**
 * Which of a player's matching materializations this turn a "when you
 * materialize" trigger matches: exactly the `nth` ("your second spirit animal
 * in a turn" is `2`), or each from the `atLeast`th on ("if it is not the
 * first spirit animal you have materialized this turn" is `{ atLeast: 2 }`).
 */
export type MaterializeNth = number | { readonly atLeast: number };

/** What makes a triggered ability trigger (rules § Ability Types → Triggered abilities). */
export type Trigger =
  | { readonly on: NamedTrigger }
  /** A successful named-bearing ability admission; the occasion has no card subject. */
  | { readonly on: "namedAbilityTriggered"; readonly named: NamedTrigger; readonly player: PlayerRef; readonly firstTimeEachTurn?: true }
  /** "When you play your `nth` … this turn" counts only the plays that match. */
  | { readonly on: "play"; readonly player: PlayerRef; readonly filter: CardFilter; readonly nth?: number; readonly from?: never }
  /**
   * "When you play a card from your void": each card matching `filter`, by
   * its characteristics as it was played, that `player` plays from their
   * void, by Reclaim or a play permission alike, matched as its play is
   * announced with the card on the stack (rules § Ability Types → When you
   * play a card from your void; RD-hv-umm2.93-1). It counts no `nth`.
   */
  | { readonly on: "play"; readonly player: PlayerRef; readonly filter: CardFilter; readonly from: "void"; readonly nth?: never }
  | { readonly on: "materialize"; readonly subject: TriggerSubject; readonly nth?: never }
  /**
   * "When you materialize your second spirit animal in a turn": a
   * materialization matching `subject` that is the `nth` matching one its
   * player announced this turn, counted by the turn log's records of every
   * character that player materialized, by type as it materialized, the one
   * just announced included (rules § Ability Types → Counting
   * materializations; RD-hv-umm2.107-1, RD-hv-umm2.107-2).
   */
  | { readonly on: "materialize"; readonly subject: MaterializedSelector; readonly nth: MaterializeNth }
  | { readonly on: "draw"; readonly player: PlayerRef; readonly nth?: number; readonly filter?: CardFilter }
  /** Each successful copy, matched by the copied card's copiable values. */
  | { readonly on: "copy"; readonly player: PlayerRef; readonly filter: CardFilter }
  | { readonly on: "foresee"; readonly player: PlayerRef }
  /** Each settled positive-to-zero transition of the hand its player holds, without a card subject. */
  | { readonly on: "handBecomesEmpty"; readonly player: PlayerRef; readonly firstTimeEachTurn?: true }
  /** Once per completed positive discard instruction, payment descriptor, or hand-limit choice. */
  | { readonly on: "discardBatch"; readonly player: PlayerRef }
  /**
   * "When you discard a card": each card matching `filter` discarded from
   * `player`'s hand, whatever caused the discard (rules § Zones → Hand). With
   * `self`, "When you discard this card": only the ability's own card, once
   * it is in the void it was discarded into, so the ability works from the
   * void (rules § Ability Types → When you discard this card).
   */
  | { readonly on: "discard"; readonly player: PlayerRef; readonly filter: CardFilter; readonly self?: true }
  /**
   * "When you erode a card": each card matching `filter` that Erode puts from
   * `player`'s deck into its void, whoever's effect made them erode, matched
   * as it is in the void (rules § Keywords and Effects → Erode). With
   * `self`, "When you erode this card": only the ability's own card, so the
   * ability works from the void (rules § Ability Types → When you discard or
   * erode this card).
   */
  | { readonly on: "erode"; readonly player: PlayerRef; readonly filter: CardFilter; readonly self?: true }
  /**
   * "When you reclaim a card": each card matching `filter`, by its
   * characteristics as it was played, that `player` plays from their void by
   * Reclaim, printed or gained, matched as its play is announced, with the
   * card on the stack (rules § Ability Types → When you reclaim a card). A
   * play from the void by a play permission is not a reclaim. With `self`,
   * "When you reclaim this character": only the ability's own card, which
   * works from the stack it was just played onto, whatever the ability's
   * zone (rules § Ability Types → When you reclaim this character).
   */
  | { readonly on: "reclaim"; readonly player: PlayerRef; readonly filter: CardFilter; readonly self?: true }
  | { readonly on: "abandon"; readonly player: PlayerRef; readonly filter: CardFilter }
  | { readonly on: "leavesPlay"; readonly subject: TriggerSubject }
  /**
   * "When you return a character you control to hand": each character
   * matching `subject`, as it was just before it left play, that leaves play
   * for a hand, by any effect or cost, matched as it leaves (rules § Ability
   * Types → When you return a character to hand; RD-hv-umm2.102-1). A
   * character a replacement sends elsewhere instead, banished as reclaimed or
   * ceasing to exist as a created card, is not returned. With `toYourHand`,
   * "… to your hand": only a card the ability's controller owns, which goes
   * to that player's hand.
   */
  | { readonly on: "returnToHand"; readonly subject: CharacterSelector; readonly toYourHand?: true }
  /**
   * "When a … is dissolved": each dissolve, abandons included, of a character
   * matching `subject` as it last was in play, the ability's own card
   * included unless the selector says `another`. `figment` limits it to
   * figments (`true`) or to non-figments (`false`). The ability must have
   * worked where its card was as the character left play (rules § Ability
   * Types → When a character is dissolved).
   */
  | { readonly on: "dissolve"; readonly subject: CharacterSelector; readonly figment?: boolean }
  /**
   * "When … gains ✦": each "gains +N✦" event with N ≥ 1, permanent or with a
   * duration, except an additional gain (rules § Spark → Additional spark).
   * Spark a character has never triggers it.
   */
  | { readonly on: "gainsSpark"; readonly subject: TriggerSubject }
  /** "When … scores ⍟": a challenge converts the character's spark into points. */
  | { readonly on: "scores"; readonly subject: TriggerSubject }
  /** One settled Challenge cohort of distinct positive scorers. */
  | { readonly on: "scoreGroup"; readonly count: number; readonly player: PlayerRef }
  /** "When the opponent scores ⍟": a character the opponent controls scores. */
  | { readonly on: "opponentScores" }
  /** "When you dissolve or banish an enemy", or a character you control dissolves one in a challenge. */
  | { readonly on: "removesEnemy"; readonly inChallenge?: true }
  | { readonly on: "leavesVoid"; readonly player: PlayerRef; readonly filter: CardFilter }
  /**
   * "When a … is put into your void": each card matching `filter` that
   * enters `player`'s void, by any route and from any zone, matched as it is
   * in that void once it is there. The ability must work where its card is
   * as the card arrives, so an ability that works in play never sees its own
   * card put into a void (rules § Ability Types → When a card is put into a
   * void).
   */
  | { readonly on: "putIntoVoid"; readonly player: PlayerRef; readonly filter: CardFilter }
  /** "When you challenge with N or more …": once, as challengers are designated (C10). */
  | { readonly on: "challengeWith"; readonly count: number; readonly selector: CharacterSelector }
  /** The controller's completed ordinary and extra opening-hand setup, before turn 1. */
  | { readonly on: "openingHandCompleted" }
  | { readonly on: "startOfTurn" }
  | { readonly on: "startOfFirstTurn" }
  /**
   * "At end of turn": as the Ending phase of each turn begins, or with
   * `player` only of that player's turns ("At the end of your turn"). It
   * triggers before the Ending phase's cleanup (rules § Turn Structure).
   */
  | { readonly on: "endOfTurn"; readonly player?: PlayerRef }
  /** Combined triggers such as "▸Materialized, ▸Dawn" fire on each occasion. */
  | { readonly on: "either"; readonly triggers: readonly Trigger[] };

/**
 * Where a triggered or static ability works: in play, or the functional
 * zones "void", "hand", and "any" (play, void, hand, and deck). An emblem's
 * abilities always work.
 */
export type FunctionalZone = "play" | "void" | "hand" | "any";

/** "When …, …": an ability that triggers on an event and resolves without the stack (D14). */
export interface TriggeredAbility {
  readonly kind: "triggered";
  readonly trigger: Trigger;
  readonly effect: Effect;
  readonly zone: FunctionalZone;
  /** An intervening "if": checked when the ability triggers and again as it resolves. */
  readonly condition?: Condition;
  /** Triggers at most once each turn. */
  readonly oncePerTurn?: boolean;
}

/**
 * An always-on ability (rules § Ability Types → Static abilities): its
 * effect is a continuous primitive that applies while its source is in
 * `zone` (an emblem's always applies), with values read live. A card's static
 * working from a hand or deck applies without revealing the card
 * (RD-hv-umm2.53-2).
 */
export interface StaticAbility {
  readonly kind: "static";
  readonly effect: Effect;
  /** Where its card must be for it to apply: "If this card is in your void, …" works from "void" (RD-hv-umm2.53-1). */
  readonly zone: FunctionalZone;
  /** Applies only while this public condition holds, read against the layers before its effect. */
  readonly while?: StaticCondition;
}

/**
 * "Reclaim N●" or "Reclaim – costs": the card may be played from its owner's
 * void for `costs` in place of its printed energy cost, and is then reclaimed.
 */
export interface ReclaimAbility {
  readonly kind: "reclaim";
  readonly costs: readonly Cost[];
}

/**
 * "If …, you win the game" on a card in play or an emblem (an emblem always
 * is in play): the state-based victory check (P5) wins the battle for the
 * source's controller whenever the condition holds (C15). It never resolves
 * and holds no effect. A resolving effect wins with the `winTheGame`
 * primitive instead.
 */
export interface WinConditionAbility {
  readonly kind: "winCondition";
  readonly condition: Condition;
}

/** One additional physical event copy per successful copy attempt, from an in-play controlled source. */
export interface EventCopyModifierAbility {
  readonly kind: "eventCopyModifier";
}

/** A requirement checked before playing this card, by every play method. */
export interface PlayConditionAbility {
  readonly kind: "playCondition";
  readonly condition: Condition;
}

export type Ability =
  | { readonly kind: "event"; readonly effect: Effect }
  | StaticAbility
  | WinConditionAbility
  | EventCopyModifierAbility
  | PlayConditionAbility
  | AdditionalCostAbility
  | AlternativeCostAbility
  | ReclaimAbility
  | { readonly kind: "keyword"; readonly keyword: Keyword }
  | ActivatedAbility
  | TriggeredAbility;

/** A card's abilities for a variant; the amplified flag selects amplified text's behavior. */
export type AbilityList = (variant: Variant) => readonly Ability[];
