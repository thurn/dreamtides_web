import type { CardSubtype } from "../../types/card-identity";
import type { TransfigurationType } from "../../types/journey";
import type { CardFilter, Condition, Cost, DeckMods, Keyword, NamedTrigger, Speed, Variant } from "../dsl/types";
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
  /** Rounds after which an unfinished battle is a draw (P11), or `null` for unrestricted rounds. */
  readonly turnLimit: number | null;
  /** Sides eligible for any victory condition; absent means both sides. */
  readonly victorySides?: readonly Side[];
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
   * The feasibility budget of one play or activation: most dry runs its
   * legality search and the narrowing of its play-time prompts make
   * together, along one path of answers (steps/feasibility.ts). Running out
   * is conservative: nothing unproven is offered.
   */
  readonly feasibilitySearchRuns: number;
  /** Most cards a Discover offers (rules § Keywords and Effects → Discover). */
  readonly discoverOptions: number;
  readonly dreamwell: DreamwellConfig;
}

/** One journey deck entry as the battle receives it: its card and full variant (D39). */
export interface DeckEntry {
  readonly cardId: CardId;
  /** Played as its amplified text (the Amplified transfiguration). */
  readonly amplified?: boolean;
  /** The entry's journey transfigurations. */
  readonly transfigurations?: readonly TransfigurationType[];
  /** The entry's deck-entry modifications. */
  readonly deckMods?: DeckMods;
}

/**
 * Extra opening-hand cards (NextBattleOpeningHand): after the ordinary hand,
 * the side draws `count` more cards, taking the first deck cards that match
 * `filter` when it has one.
 */
export interface OpeningHandDraw {
  readonly count: number;
  readonly filter: CardFilter | null;
}

/**
 * The next-battle effects a journey carries into one battle (D39). Battle
 * setup consumes them once: the opening hand and starting energy in the
 * `beginBattle` step, the cost discount on the side's deck instances.
 */
export interface NextBattleEffects {
  /** NextBattleOpeningHand, in the order they are drawn. */
  readonly openingHand: readonly OpeningHandDraw[];
  /** NextBattleStartingEnergy: the current and maximum energy the side begins with. */
  readonly startingEnergy: number;
  /**
   * NextBattleSmallerHandAndCostDiscount: each changes the ordinary opening
   * hand by `openingHandDelta` and reduces the energy cost of every card the
   * side's deck starts with by `costReduction` for the battle.
   */
  readonly smallerHandAndCostDiscount: readonly {
    readonly openingHandDelta: number;
    readonly costReduction: number;
  }[];
}

/** One physical copy from the full input deck, placed without a zone-change effect. */
export type BattlePlacement = {
  readonly side: Side;
  readonly deckIndex: number;
} & (
  | { readonly zone: "hand" | "void"; readonly slot?: never; readonly exhausted?: never }
  | { readonly zone: "play"; readonly slot: Slot; readonly exhausted?: boolean }
);

/** A normal turn at entry to Draw, Dawn, or Day, with explicitly ordered decks and hands. */
export interface BattleSetup {
  readonly placements: readonly BattlePlacement[];
  readonly sides: Readonly<Record<Side, {
    readonly currentEnergy: number;
    readonly maxEnergy: number;
    readonly score: number;
  }>>;
  readonly turn: {
    readonly active: Side;
    readonly phase: "draw" | "dawn" | "day";
    readonly round: number;
    readonly turnNumber: number;
    readonly sideTurns: Readonly<Record<Side, number>>;
    readonly lastNormal: Side;
  };
  readonly dreamwell: { readonly deck: readonly DreamwellCardId[]; readonly next: number };
}

/** Everything a battle needs to start. */
export interface BattleInit {
  /** Battle seed, derived by the host from the game seed and battle index. */
  readonly seed: BattleSeed;
  readonly scoreToWin: number;
  readonly startingSide?: Side;
  readonly decks: Readonly<Record<Side, readonly DeckEntry[]>>;
  /** Public fixed source multisets; repeated UUIDs retain copies. Absent for legacy battles without a declared pool. */
  readonly draftPools?: Readonly<Record<Side, readonly CardId[]>>;
  /** The Dreamwell catalog cards the shared Dreamwell deck is built from. */
  readonly dreamwell: readonly DreamwellCardId[];
  /** Each side's avatar, in play from the start of the battle (P4). */
  readonly avatars?: Readonly<Partial<Record<Side, AvatarId>>>;
  /** Each side's dreamsigns, in order. */
  readonly dreamsigns?: Readonly<Partial<Record<Side, readonly DreamsignId[]>>>;
  /** Each side's next-battle effects. */
  readonly nextBattle?: Readonly<Partial<Record<Side, NextBattleEffects>>>;
  /** Explicit initial zones/resources at a supported phase boundary; input decks are ordered. */
  readonly setup?: BattleSetup;
  readonly victorySides?: readonly Side[];
  /** Positive round limit, or `null` to permit any number of rounds. */
  readonly turnLimit?: number | null;
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
  /** The latest actual committed play used Reclaim; independent of the mutable zone-change replacement status. */
  playedViaReclaim: boolean;
  /** Latest actual card-defined alternative play; absent when legacy history is unknown. */
  playedViaAlternativeCost?: boolean;
  /** Played by Offering; it is banished during each Ending, wherever it is. */
  offering: boolean;
  /** Drawn or created with Ephemeral; it is banished during Ending while it is in a hand. */
  ephemeral: boolean;
  /** The X paid to play the card, kept while it is in play (variable spark reads it); `null` elsewhere. */
  x: number | null;
  /**
   * The cards whose abilities the character has gained (rules § Keywords and
   * Effects → Gaining abilities), in the order gained; absent when it has
   * gained none. It mirrors the character's `abilities` floating changes, and
   * rules/floating.ts alone writes it as they begin and end, so an
   * instance's abilities (rules/activation.ts `instanceOrigin`) read from
   * the instance alone.
   */
  gainedAbilities?: readonly GainedAbilities[];
  /**
   * Present while the character has lost all its abilities (rules § Keywords
   * and Effects → Losing abilities): it has none of its own, nor those of the
   * first `lostAbilities` entries of `gainedAbilities`, which it gained before
   * its latest loss; absent when it has lost none. It mirrors the
   * character's `loseAbilities` floating changes, and rules/floating.ts alone
   * writes it, with `gainedAbilities`.
   */
  lostAbilities?: number;
}

/**
 * The abilities a character gained from one source (rules § Keywords and
 * Effects → Gaining abilities): those of the card `cardId` for `variant`, or
 * those of the figment type `figment`.
 */
export type GainedAbilities =
  | { readonly cardId: CardId; readonly variant: Variant }
  | { readonly figment: FigmentId };

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
  /** Immutable original input-deck membership; omitted when legacy provenance is unknown. */
  readonly journeyDeck?: boolean;
  /**
   * The side controlling the card: in play or on the stack, its controller;
   * in a hand, the side whose hand holds it, which may differ from its owner;
   * in a deck, a void, or the Banished zone, its owner.
   */
  controller: Side;
  zone: Zone;
  readonly variant: Variant;
  /** Immutable eligible UUID copies captured by this pool creation, independent of its selected printing. */
  readonly poolCandidates?: readonly CardId[];
  status: CardStatus;
  /** Monotonic timestamp of the last zone entry, for layer ordering. */
  enteredZoneAt: number;
}

/** The public position vacated by the single character abandoned for an activation. */
export interface AbandonedPosition {
  readonly side: Side;
  readonly slot: Slot;
}

/**
 * The play-time choices for one effect: its modes, one per modal node on the
 * chosen path, and its targets, one list per target spec, both in walk order.
 */
export interface EffectChoices {
  readonly modes: readonly number[];
  readonly targets: readonly (readonly InstanceId[])[];
  /** Captured before paying the activation's single-character abandonment cost. */
  readonly abandonedPosition?: AbandonedPosition;
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
  /**
   * The card was played from its owner's void, by Reclaim or a play
   * permission, which "When you play a card from your void" abilities match
   * (RD-hv-umm2.93-1); absent for a play from a hand and for a copy.
   */
  readonly playedFromVoid?: true;
  /** Entry readiness captured from the actual selected alternative; copies omit it. */
  readonly materializesAwakened?: true;
}

/**
 * Where an activated ability's definition comes from, captured at
 * activation so the ability resolves even if its source has left play.
 */
export type AbilityOrigin =
  /**
   * A card's abilities for its variant, then, in order, those of each card
   * or figment type in `gained` (rules/activation.ts `originAbilities`), so
   * the indexes of its own abilities never change; `gained` is absent when
   * it has none. With `lost`, it has lost its own abilities and those of the
   * first `lost` entries of `gained`, which keep their indexes.
   */
  | {
      readonly kind: "card";
      readonly cardId: CardId;
      readonly variant: Variant;
      readonly gained?: readonly GainedAbilities[];
      readonly lost?: number;
    }
  /** A figment type's abilities; with `lost`, it has lost them. */
  | { readonly kind: "figment"; readonly id: FigmentId; readonly lost?: true }
  | { readonly kind: "avatar"; readonly id: AvatarId }
  | { readonly kind: "dreamsign"; readonly id: DreamsignId }
  | { readonly kind: "dreamwell"; readonly id: DreamwellCardId };

/** An activated ability on the stack. */
export interface AbilityStackItem extends StackItemBase {
  /** Public source count immediately before this activation's own removal payment. */
  readonly paymentSourceCounters?: number;
  /** Effective spark just before the source last left play, while this ability waited. */
  readonly lastKnownSourceSpark?: number;
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
 * How a `cardCost` change changes one card's energy cost: "It costs N●" sets
 * it, "It costs N● more" increases it, and "reduce its cost by N●" reduces it.
 */
export type CardCostMode = "set" | "increase" | "reduce";

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
/** Bounded player rules; numeric tunables belong to their authored abilities. */
export type RuleModifierInstruction =
  | { readonly rule: "eventAlternative"; readonly energy: number }
  | { readonly rule: "carryEnergy" }
  | { readonly rule: "dawnThreshold"; readonly count: number };

export type ContinuousChange =
  /** Null is static first-occasion eligibility; physical grants permanently retain Awakened. */
  | { readonly kind: "firstMaterializationKeyword"; readonly player: Side; readonly keyword: "awakened"; readonly instance: InstanceId | null }
  /** Null enables the player's current-turn cohort; a physical member retains Awakened until the same expiry. */
  | { readonly kind: "materializeKeyword"; readonly player: Side; readonly keyword: "awakened"; readonly instance: InstanceId | null }
  /** Static-only additional cards for the named player's Draw phase. */
  | { readonly kind: "additionalDrawPhaseCards"; readonly player: Side; readonly count: number }
  | ({ readonly kind: "ruleModifier"; readonly player: Side } & RuleModifierInstruction)
  /** Layer 2: the character has all character types. */
  | { readonly kind: "allTypes"; readonly instance: InstanceId }
  /**
   * Layer 2: the character is the character type `subtype` in place of its
   * printed one ("This character is that character type"). The latest such
   * change its own source made to it is that source's chosen character type
   * (effects/primitives/choose-subtype.ts).
   */
  | { readonly kind: "subtype"; readonly instance: InstanceId; readonly subtype: CardSubtype }
  /**
   * Layer 3: the card gains (`gains`) or loses a keyword. A gained Reclaim
   * may carry `reclaimCosts` ("gains reclaim 0●"): the costs of playing the
   * card from the void in place of its printed or deck-entry Reclaim cost
   * (rules/timing.ts `grantedReclaimCosts`).
   */
  | {
      readonly kind: "keyword";
      readonly instance: InstanceId;
      readonly keyword: Keyword;
      readonly gains: boolean;
      readonly reclaimCosts?: readonly Cost[];
    }
  /**
   * Layer 3: the character gains the abilities of the card `cardId` for
   * `variant`, or of the figment type `figment` (rules § Keywords and
   * Effects → Gaining abilities): their keyword abilities here, and every
   * other ability through the character's `status.gainedAbilities`, which
   * mirrors these changes.
   */
  | ({ readonly kind: "abilities"; readonly instance: InstanceId } & GainedAbilities)
  /**
   * Layer 3: the character loses all its abilities (rules § Keywords and
   * Effects → Losing abilities): its keywords here, as of the change's
   * timestamp, and every other ability its own or gained before the change
   * through the character's `status.lostAbilities`, which mirrors these
   * changes. It ends as the character leaves play, whatever its expiry.
   */
  | { readonly kind: "loseAbilities"; readonly instance: InstanceId }
  /** Layer 4: the character's base spark becomes `value`. */
  | { readonly kind: "baseSpark"; readonly instance: InstanceId; readonly value: number }
  /** Layer 5: spark gained with a duration, or spark a character has; it ends wherever the card is. */
  | { readonly kind: "spark"; readonly instance: InstanceId; readonly amount: number }
  /**
   * Layer 6: cards `player` plays that match `filter` cost `amount` more
   * (less when negative). A `next` modifier applies to one card: it ends as
   * that card is played. `mode: "set"` instead sets its normal fixed energy
   * base; an optional `nth` limits the change to that matching play ordinal.
   * A plain adjustment with `route: "activated"` instead changes matching
   * card-sourced activated abilities and is consumed when an activation pays.
   */
  | ({ readonly kind: "cost"; readonly player: Side; readonly filter: CardFilter; readonly amount: number; readonly next: boolean } &
      ({ readonly nth?: never; readonly mode?: never; readonly route?: "activated"; readonly from?: never } | { readonly nth: number; readonly mode?: "set"; readonly route?: never; readonly from?: "void" } |
       { readonly nth?: never; readonly mode: "set"; readonly next: false; readonly route?: never; readonly from?: never }))
  /** Layer 6, static only: the selected Reclaim fixed base or whole-payment reduction. */
  | { readonly kind: "reclaimCost"; readonly player: Side; readonly mode: "set" | "reduce"; readonly amount: number }
  /**
   * Layer 6: one card's energy cost, whoever plays it. `"set"` gives it
   * `amount`● in place of its ● cost (its copiable cost); `"increase"` makes
   * it cost `amount`● more, and `"reduce"` `amount`● less. The latest set
   * applies, then every increase, then every reduction, with the other cost
   * changes joining them (continuous/costs.ts).
   */
  | { readonly kind: "cardCost"; readonly instance: InstanceId; readonly mode: CardCostMode; readonly amount: number }
  /**
   * Layer 6, a play permission: `player` may play the cards in the void it
   * owns that match `filter`, or its identified current deck top. A named
   * void permission covers only `instance`, for its
   * normal costs (continuous/permissions.ts). A `next` permission allows one
   * play: it ends as that card is played.
   */
  | {
      readonly kind: "playFrom";
      readonly player: Side;
      readonly zone: "void" | "deck";
      readonly instance: InstanceId | null;
      readonly filter: CardFilter;
      readonly next: boolean;
      /** Only static, filter-based permissions use a turn allowance. */
      readonly oncePerTurn?: boolean;
    }
  /**
   * Layer 6, a play restriction (rules § Playing Cards and the Stack → Play
   * restrictions): `player` cannot play the cards that match `filter`, and
   * are `instance` when it names one; with `player` `null`, no player can
   * play them. It covers every route of play (rules/timing.ts `canPlay`).
   */
  | {
      readonly kind: "cannotPlay";
      readonly player: Side | null;
      readonly instance: InstanceId | null;
      readonly filter: CardFilter;
    }
  /**
   * Layer 6, a play limit: `player` cannot play a card once it has played
   * `count` cards this turn, counting those played before the limit began
   * (the turn log).
   */
  | { readonly kind: "playLimit"; readonly player: Side; readonly count: number }
  /** Static-only Ephemeral cleanup exemption for the held hand at this player's own Ending. */
  | { readonly kind: "preserveEphemeralHand"; readonly player: Side }
  /** Static-only choice of discard or hand banishment for this player's Offering payment. */
  | { readonly kind: "offeringDiscardPaymentOption"; readonly player: Side }
  /** Static-only public visibility of the current top card. */
  | { readonly kind: "revealDeckTop"; readonly player: Side }
  /**
   * Layer 6, made only by a static ability (`reclaimNotBanished`): a
   * reclaimed card `player` owns is not banished instead of leaving play or
   * the stack (rules/zones.ts `banishedAsReclaimed`).
   */
  | { readonly kind: "reclaimNotBanished"; readonly player: Side };

/** Selective suppression: triggered abilities, optionally also new activations. */
export type AbilityDisablingMode = "triggered" | "triggeredAndActivated";

/** What a floating effect changes while it lasts. */
export type FloatingChange =
  | ContinuousChange
  /**
   * "Until end of turn, when …" (floating) or "the next time …" (delayed,
   * `once`: it ends as it triggers). One created inside a `withMaterialized`
   * binding keeps that binding's cards as `captured`, in the order they
   * entered play, for its effect's captured-card references.
   */
  | { readonly kind: "trigger"; readonly ref: EffectRef; readonly once: boolean; readonly captured?: readonly InstanceId[]; readonly lastKnownSourceSpark?: number }
  /** Selectively disables new abilities, while `while` holds; absent mode means triggered-only. */
  | { readonly kind: "disableTriggers"; readonly instance: InstanceId; readonly while?: Condition; readonly mode?: AbilityDisablingMode }
  /** "Banish … until …": as the effect ends, the banished card returns to play under `side` (F3). */
  | { readonly kind: "banishedUntil"; readonly instance: InstanceId; readonly side: Side }
  /** A hand card returns to its owner's hand only from this exact Banished-zone entry. */
  | { readonly kind: "banishedToHandUntil"; readonly instance: InstanceId; readonly banishedAt: number }
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
  /** Combined-only source attribution actually observed by these sides; absent legacy records are conservative. */
  readonly sourceObservedBy?: readonly Side[];
}

/**
 * A triggered ability waiting to resolve (D14). The ability is read from
 * `origin` as it was when it triggered, so it resolves even if its source has
 * since changed zones or ceased to exist.
 */
/** One paired ability occurrence on a source's particular stay in play. */
export interface LinkedSourceContext {
  readonly source: InstanceId;
  readonly enteredPlayAt: number;
  /** Index within its own or gained definition, independent of other gained groups. */
  readonly ability: number;
  /** The acquisition that contributed this pair; absent for the source's printed abilities. */
  readonly gainedFrom?: EffectId;
}

/** Cards a linked producer banished during one source object and ability occurrence. */
export interface LinkedBanishedCards extends LinkedSourceContext {
  readonly cards: readonly { readonly instance: InstanceId; readonly enteredBanishedAt: number }[];
}

/** Public copiable values captured before a confirmed abandoned subject leaves play. */
export interface AbandonedCopyContext {
  readonly printing: Printing;
  readonly variant: Variant;
}

export interface HandCopyContext {
  readonly printing: Extract<Printing, { readonly kind: "card" }>;
  readonly variant: Variant;
  readonly ephemeral: boolean;
  readonly copier: Side;
  /** Captured at the first copy occasion; historical originals can cease. */
  readonly originalHiddenFrom: readonly Side[];
}

/** A bounded named-ability instruction retained from one abandonment. */
export interface AbandonedNamedEntry {
  readonly named: "materialized" | "dawn" | "dissolved";
  readonly ability: number;
  readonly disabled: boolean;
  used: boolean;
  /** Actual source visit/acquisition, also for non-linked once identity. */
  readonly occurrence: LinkedSourceContext;
  readonly linkedSource?: LinkedSourceContext;
  readonly lastKnownSourceSpark?: number;
  readonly lastKnownSubjectCost?: number;
  readonly lastKnownSubjectSpark?: number;
  confirmed?: true;
}

export interface AbandonedNamedBinding {
  readonly readerObservedBy?: readonly Side[];
  readonly source: InstanceId;
  readonly origin: Extract<AbilityOrigin, { readonly kind: "card" | "figment" }>;
  readonly controller: Side;
  readonly observedBy: readonly Side[];
  readonly entries: readonly AbandonedNamedEntry[];
}

interface QueuedAbility {
  readonly abandonedNamed?: AbandonedNamedBinding;
  /** Sampled historical context withheld by the input view, independent of current source visibility. */
  readonly historyHiddenFrom?: readonly Side[];
  /** Audience and named classification of an actual explicitly repeated pending occurrence. */
  readonly repeated?: { readonly named: import("../dsl/types").NamedTrigger; readonly observedBy: readonly Side[]; readonly visibleTo: readonly Side[] };
  /** Exact causing named occurrence, retained only for an immediate repeat reader. */
  readonly triggeringAbility?: { readonly named: import("../dsl/types").NamedTrigger; readonly occurrence: QueuedTrigger; readonly observedBy?: readonly Side[]; readonly readerObservedBy?: readonly Side[] };
  /** Public effective predeparture spark, captured only for a lookback subject value. */
  readonly lastKnownSubjectSpark?: number;
  /** Copiable subject cost captured for a body that reads it. */
  readonly lastKnownSubjectCost?: number;
  readonly linkedSource?: LinkedSourceContext;
  /** Captured hand-copy action, only for a body copying its subject. */
  readonly handCopy?: HandCopyContext;
  /** Retained only for a body copying its confirmed abandoned subject. */
  readonly abandonedCopy?: AbandonedCopyContext;
  /** Effective spark just before the source last left play, while this trigger waited. */
  readonly lastKnownSourceSpark?: number;
  readonly source: AbilitySource;
  readonly controller: Side;
  readonly origin: AbilityOrigin;
  /** The ability's index in its origin's ability list. */
  readonly ability: number;
  /** A floating or delayed trigger's node in that ability's effect tree; `null` for a triggered ability. */
  readonly node: number | null;
  /** The card the triggering event concerns ("it", "that character"), if any. */
  readonly subject: InstanceId | null;
  /**
   * The sides that could not identify `subject` as the ability triggered,
   * such as the opponent of the side drawing it; absent when both could.
   * Neither the view nor the `triggerQueued` event shows them the subject
   * (view/knowledge.ts `seesSubject`).
   */
  readonly subjectHiddenFrom?: readonly Side[];
  /** The gain a "when … gains ✦" trigger matched; absent for any other trigger. */
  readonly gain?: SparkGain;
  /** The positive challenge award a scoring trigger matched; absent for other triggers. */
  readonly scored?: number;
  /** Public positive count captured from one completed discard occasion. */
  readonly discardedCount?: number;
  /** The cards its floating or delayed trigger kept from a `withMaterialized` binding; absent otherwise. */
  readonly captured?: readonly InstanceId[];
}

/** An event bonus waits in the same FIFO as triggers, with its drawn source pinned. */
export type QueuedTrigger = QueuedAbility & (
  | { readonly kind?: undefined }
  | { readonly kind: "dreamwellBonus" }
  | { readonly kind: "ruleReaction"; readonly node: null; readonly subject: null }
);

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
  /** Actual pre-payment void origin; absent legacy provenance is unknown. */
  readonly playedFromVoid?: boolean;
  /** Public copiable values as played, retained independently of the physical card's survival. */
  readonly copiable?: Pick<CardInstance, "printing" | "variant">;
  /** Named triggers as played; missing legacy abilities are unknown and match no ability filter. */
  readonly namedTriggers?: readonly NamedTrigger[];
  readonly instance: InstanceId;
  readonly cardType: "character" | "event";
  readonly subtype: CardSubtype;
  /** "Has all character types" as it was played: it matches every subtype a filter names. */
  readonly allTypes: boolean;
  /** Copiable speed as played. Missing legacy speed is unknown and matches no Fast filter. */
  readonly speed?: Speed;
  /**
   * Its copiable cost as it was played, which cost-bounded filters compare. A
   * record in a saved state that lacks it is matched by its instance's
   * copiable cost instead when that instance still exists. An unrecoverable
   * historical cost is unknown and matches no cost-bounded filter.
   */
  readonly cost?: number;
  /**
   * Its effective spark as it was played (`null` for an event), which
   * ✦-bounded filters compare (RD-hv-umm2.464-1). A record in a saved state
   * that lacks it is matched by its instance's current spark instead when
   * that instance still exists; otherwise it matches no ✦-bounded filter.
   */
  readonly spark?: number | null;
}

/**
 * A character one side materialized this turn, with the effective type,
 * subtype, and "has all character types" it had as its `materialized` event
 * announced it, so a later change, or its departure, does not alter the
 * record.
 */
export interface MaterializedCard {
  /** Captured figment/figment-copy provenance; absent legacy provenance is unknown. */
  readonly figment?: boolean;
  readonly instance: InstanceId;
  readonly cardType: "character" | "event";
  readonly subtype: CardSubtype;
  /** "Has all character types" as it materialized: it matches every subtype a filter names. */
  readonly allTypes: boolean;
}

/** Counters for the current turn, reset as each turn begins. */
export interface DawnProgress {
  total: number;
  /** Observer-qualified lower bounds, retained after the observed sources move. */
  known: Record<Side, number>;
}

/** A successful physical departure, with the effective type before its controller resets. */
export interface TurnDeparture {
  readonly instance: InstanceId;
  readonly cardType: "character" | "event";
}

/** Bounded current-turn facts; known named categories are viewer-qualified subsets. */
export interface FirstOccurrences {
  handEmptied: Record<Side, boolean>;
  named: Record<Side, NamedTrigger[]>;
  known: Record<Side, Record<Side, NamedTrigger[]>>;
}

/** One actual first event play, independent of its current physical survival. */
export interface FirstEventPlay {
  readonly instance: InstanceId;
  readonly printing: Extract<Printing, { readonly kind: "card" }>;
  readonly variant: Variant;
}

/** Whole-window null is unknown; a side's null is a known absence of event plays. */
export interface FirstEventHistory {
  current: Record<Side, FirstEventPlay | null> | null;
  previous: Record<Side, FirstEventPlay | null> | null;
}

export interface TurnLog {
  /** Absent legacy history begins conservatively empty. */
  firstOccurrences?: FirstOccurrences;
  /** Completed discard occurrence counts, including cards that cease to exist. */
  discarded?: Record<Side, number>;
  /** Physical completed discards, grouped by the hand they left; repeated occurrences are retained. */
  discardedCards?: Record<Side, InstanceId[]>;
  /** Predeparture controller groups; repeated physical occurrences remain separate. */
  leftPlay?: Record<Side, TurnDeparture[]>;
  dissolved?: Record<Side, TurnDeparture[]>;
  abandoned?: Record<Side, TurnDeparture[]>;
  /** True admissions and each side's known lower bound; absent legacy history starts at zero. */
  dawnProgress?: DawnProgress;
  /** Cards each side played this turn, in order. Copies are not played (D15). */
  played: Record<Side, PlayedCard[]>;
  /** Cards each side drew this turn. */
  drawn: Record<Side, number>;
  /**
   * Characters each side materialized this turn, in announcement order: every
   * `materialized` event, figments and rematerializations included. A saved
   * state may lack it; that turn's record then starts empty when the state
   * loads (`materializedThisTurn`).
   */
  materialized?: Record<Side, MaterializedCard[]>;
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
   * At turn zero, opening-hand abilities resolve before the first turn.
   * Otherwise the turn has begun and its start-of-turn abilities resolve
   * before Dreamwell. `phase` is `"dreamwell"` in both waits.
   */
  beginning: boolean;
  /**
   * Present only while the Ending phase has begun and its cleanup has not:
   * the abilities that triggered at end of turn resolve first. `phase` is
   * `"ending"` meanwhile. Only `true` counts.
   */
  endingCleanup?: true;
}

/** Positive physical scoring provenance captured across one Challenge. */
export interface ChallengeScoring {
  scorers: { readonly instance: InstanceId; readonly controller: Side }[];
  settled: boolean;
}

/** One physical character's positive Challenge award, with its controller at the occasion. */
export interface CharacterScorer {
  readonly instance: InstanceId;
  readonly controller: Side;
}

/** Independent current and preceding global-turn cohorts; null is unknown legacy history. */
export interface CharacterScoring {
  current: CharacterScorer[] | null;
  previous: CharacterScorer[] | null;
}

export interface ChallengeState {
  /** Absent in legacy snapshots whose scoring provenance is unknown. */
  scoring?: ChallengeScoring;
  /** Designated at the end of Day. */
  challengers: InstanceId[];
  /** Designated at the end of Dusk: challenger → blocker. */
  blockers: Record<InstanceId, InstanceId>;
  /** Sampled blocker designations whose original challenger association is unavailable. */
  unpairedBlockers?: InstanceId[];
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

/** Targeted continuous changes with fixed resolved values and source-independent semantics. */
export type FixedCardChange = Extract<ContinuousChange, { readonly instance: InstanceId | null }>;

/** A publicly observed permanent fixed change on an identifiable card. */
export type RememberedEffect = Omit<FloatingEffect, "change" | "expiry"> & {
  readonly change: FixedCardChange;
  readonly expiry: { readonly at: "never" };
};

/** A card record observed by one viewer, retained in first-observation order across hidden-zone forgetting. */
export interface RememberedCard {
  readonly instance: InstanceId;
  readonly owner: Side;
  readonly journeyDeck?: boolean;
  readonly printing: Printing;
  readonly variant: Variant;
  readonly status: CardStatus;
  /** Publicly observed permanent fixed continuous changes, including their source provenance. */
  readonly effects: readonly RememberedEffect[];
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
  /** Immutable non-zone pool snapshots; creation does not spend their entries (C11). */
  readonly draftPools?: Readonly<Record<Side, readonly CardId[]>>;
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
  /** Viewer-specific observed records; absent in older saved battles. */
  rememberedCards?: Record<Side, RememberedCard[]>;
  /** Durable linkage between separate abilities of one source object. */
  linkedBanished?: LinkedBanishedCards[];
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
  /** First events by actor in the current and preceding completed global turn. */
  firstEventHistory?: FirstEventHistory;
  /** Absent legacy provenance is unknown, distinct from a known empty cohort. */
  characterScoring?: CharacterScoring;
  /** Next effect number to mint. */
  nextEffect: number;
  /** Once-per-turn abilities used (activated) or triggered this turn, by source key and ability index. */
  oncePerTurn: OncePerTurnKey[];
  dreamwell: DreamwellState;
  challenge: ChallengeState | null;
  /** Automatic steps run since the last top-level decision. */
  automaticSteps: number;
  /**
   * Automatic steps since the last top-level action in which a player
   * answered a prompt by choice (not a forced answer). Each such answer
   * counts as a decision, so nothing in the rules caps a run of them; a
   * policy bounds its acceptance of a self-retriggering optional ability
   * with this count.
   */
  automaticChoices: number;
  /** Loop detection and the loop shortcut (rules § Infinite Loops). */
  loops: LoopTracker;
  result: BattleResult | null;
}
