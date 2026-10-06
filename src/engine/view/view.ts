import type { LoopId } from "../loops/types";
import type { Prompt } from "../prompts/types";
import type { AbilitySource, AvatarId, DreamsignId, DreamwellCardId, EffectId, InstanceId, OncePerTurnKey, Side, Zone } from "../state/ids";
import { opponent } from "../state/ids";
import type {
  AbilityOrigin,
  BattleConfig,
  BattleResult,
  BattleState,
  CardStatus,
  ChallengeState,
  Expiry,
  FloatingChange,
  FloatingEffect,
  PlayedCard,
  Printing,
  StackItem,
  TurnState,
} from "../state/types";
import { printedCard, type EngineCatalog } from "../catalog";
import { characteristics } from "../continuous/characteristics";
import { adjustedEnergy, costModifier } from "../continuous/costs";
import { fixedEnergy } from "../dsl/energy";
import type { Keyword, Variant } from "../dsl/types";
import type { CardSubtype } from "../../types/card-identity";
import { changedInstance } from "../rules/floating";
import { playCosts } from "../rules/costs";
import { knows } from "./knowledge";

/**
 * A card's effective characteristics, after every continuous effect (the
 * layer evaluation): what the UI and the AI show and compare.
 */
export interface CharacteristicsView {
  readonly cardType: "character" | "event";
  readonly subtype: CardSubtype;
  readonly allTypes: boolean;
  readonly keywords: readonly Keyword[];
  /** A character's effective spark; `null` for an event. */
  readonly spark: number | null;
  /**
   * The energy its controller would pay to play it now, X counted as 0,
   * after cost modifications.
   */
  readonly cost: number;
}

/** One instance the viewer can see, with its identity: a card, a figment, or a figment copy of a card. */
export interface InstanceView {
  readonly id: InstanceId;
  readonly printing: Printing;
  readonly owner: Side;
  readonly controller: Side;
  readonly zone: Zone;
  readonly variant: Readonly<Variant>;
  readonly status: Readonly<CardStatus>;
  readonly enteredZoneAt: number;
  readonly characteristics: CharacteristicsView;
}

/** A card in a hidden zone that the viewer knows, at its position in the zone. */
export interface KnownCardView {
  readonly id: InstanceId;
  /** Its index in the zone: for a deck, 0 is the top. */
  readonly index: number;
}

/**
 * A zone whose contents are hidden from at least one side: its size plus the
 * cards in it the viewer knows (view/knowledge.ts), in zone order. A hidden
 * card appears only in `count`; its instance ID is never exposed.
 */
export interface HiddenZoneView {
  readonly count: number;
  readonly known: readonly KnownCardView[];
}

/** A side's avatar: its identity and whether it is exhausted (P4). */
export interface AvatarView {
  readonly id: AvatarId;
  readonly exhausted: boolean;
}

/** One of a side's dreamsigns. */
export interface DreamsignView {
  readonly id: DreamsignId;
}

/** An effect lasting "until the opponent pays N●" (C7). */
export interface PayableEffectView {
  readonly id: EffectId;
  /** The side whose effect it is. */
  readonly controller: Side;
  /** The side that may pay to end it: the affected characters' controller. */
  readonly payer: Side;
  /** Energy the payer pays to end it. */
  readonly cost: number;
  /** A source the viewer cannot see is `null`. */
  readonly source: AbilitySource | null;
  /** The characters whose changes from the effect end when it ends. */
  readonly affects: readonly InstanceId[];
}

/** A change with a duration (rules § Durations). */
export interface FloatingEffectView {
  readonly id: EffectId;
  readonly controller: Side;
  readonly source: AbilitySource;
  readonly timestamp: number;
  readonly expiry: Expiry;
  readonly change: FloatingChange;
}

/**
 * A triggered ability waiting to resolve. A source the viewer cannot see is
 * `null`, and so is the origin it would identify.
 */
export interface QueuedTriggerView {
  readonly controller: Side;
  readonly source: AbilitySource | null;
  readonly origin: AbilityOrigin | null;
  readonly ability: number;
  readonly node: number | null;
  readonly subject: InstanceId | null;
}

/**
 * The loop on offer, or being repeated (rules § Optional Loops). Its
 * recorded actions and answers stay hidden: some answers are private to
 * their chooser.
 */
export interface LoopView {
  readonly id: LoopId;
  /** The side that may repeat it. */
  readonly side: Side;
  /** The repetition in progress, or `null` while the loop is only on offer. */
  readonly run: { readonly remaining: number | "untilVictory"; readonly iterations: number } | null;
}

export interface SideView {
  readonly score: number;
  readonly currentEnergy: number;
  readonly maxEnergy: number;
  readonly fatigueCount: number;
  readonly deck: HiddenZoneView;
  readonly hand: HiddenZoneView;
  readonly void: readonly InstanceId[];
  readonly banished: readonly InstanceId[];
  /** `B0`–`B9`. */
  readonly backRank: readonly (InstanceId | null)[];
  /** `F0`–`F8`. */
  readonly frontRank: readonly (InstanceId | null)[];
  readonly avatar: AvatarView | null;
  /** In order. */
  readonly dreamsigns: readonly DreamsignView[];
}

/** This turn's counters, as far as the viewer can see the cards played. */
export interface TurnLogView {
  readonly played: Readonly<Record<Side, readonly PlayedCard[]>>;
  readonly drawn: Readonly<Record<Side, number>>;
}

/**
 * What one side may know about a battle. It is the only thing the UI and the
 * AI read. It shares no objects with the state it was built from, carries no
 * seed or random-stream counters, and lists only instances the viewer can
 * see: those in public zones, those in the viewer's own hand (including any
 * the opponent owns), and hidden cards the viewer knows (view/knowledge.ts).
 * Every deck and the opponent's hand appear as counts plus the known cards.
 */
export interface BattleView {
  readonly viewer: Side;
  /** The state version this view was built from. */
  readonly version: number;
  readonly config: Readonly<BattleConfig>;
  readonly turn: Readonly<TurnState>;
  readonly sides: Readonly<Record<Side, SideView>>;
  /** Every instance the viewer can see, by ID. */
  readonly instances: Readonly<Record<InstanceId, InstanceView>>;
  /** The last element is the top. Targets the viewer cannot see are omitted. */
  readonly stack: readonly StackItem[];
  readonly priority: Side | null;
  /** Effects a side may pay to end, in registration order. */
  readonly payable: readonly PayableEffectView[];
  /**
   * Floating effects, in creation order, except those whose source or
   * changed card the viewer cannot see.
   */
  readonly floating: readonly FloatingEffectView[];
  /** Triggered abilities waiting to resolve, first in, first out. */
  readonly triggerQueue: readonly QueuedTriggerView[];
  readonly turnLog: TurnLogView;
  /** Once-per-turn abilities used this turn, except those of sources the viewer cannot see. */
  readonly oncePerTurn: readonly OncePerTurnKey[];
  /** The shared Dreamwell: cards left before the next cycle, and the catalog cycles are built from. */
  readonly dreamwell: { readonly remaining: number; readonly catalog: readonly DreamwellCardId[] };
  readonly challenge: Readonly<ChallengeState> | null;
  readonly loop: LoopView | null;
  readonly result: BattleResult | null;
}

/** A deep copy of plain JSON data. */
function copy<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(copy) as T;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = copy(entry);
    }
    return result as T;
  }
  return value;
}

function hiddenZone(ids: readonly InstanceId[], visible: (id: InstanceId) => boolean): HiddenZoneView {
  const known: KnownCardView[] = [];
  ids.forEach((id, index) => {
    if (visible(id)) known.push({ id, index });
  });
  return { count: ids.length, known };
}

export function view(state: BattleState, viewer: Side, catalog: EngineCatalog): BattleView {
  const layers = characteristics(state, catalog);
  const instances: Record<InstanceId, InstanceView> = {};
  for (const instance of Object.values(state.instances)) {
    if (knows(state, instance, viewer)) {
      const card = layers.of(instance.id);
      const printed = fixedEnergy(playCosts(printedCard(catalog, instance.printing), instance.variant));
      instances[instance.id] = {
        id: instance.id,
        printing: { ...instance.printing },
        owner: instance.owner,
        controller: instance.controller,
        zone: instance.zone,
        variant: { ...instance.variant },
        status: { ...instance.status },
        enteredZoneAt: instance.enteredZoneAt,
        characteristics: {
          cardType: card.cardType,
          subtype: card.subtype,
          allTypes: card.allTypes,
          keywords: [...card.keywords],
          spark: card.spark,
          cost: adjustedEnergy(printed, costModifier(state, catalog, instance.id, instance.controller, layers)),
        },
      };
    }
  }
  const visible = (id: InstanceId): boolean => id in instances;
  const visibleSource = (source: AbilitySource): boolean => typeof source !== "string" || visible(source);
  const floatingVisible = (effect: FloatingEffect): boolean => {
    const changed = changedInstance(effect.change);
    return visibleSource(effect.source) && (changed === null || visible(changed));
  };
  const side = (which: Side): SideView => {
    const source = state.sides[which];
    return {
      score: source.score,
      currentEnergy: source.currentEnergy,
      maxEnergy: source.maxEnergy,
      fatigueCount: source.fatigueCount,
      deck: hiddenZone(source.deck, visible),
      hand: hiddenZone(source.hand, visible),
      void: [...source.void],
      banished: [...source.banished],
      backRank: [...source.backRank],
      frontRank: [...source.frontRank],
      avatar: source.avatar === null ? null : { id: source.avatar.id, exhausted: source.avatar.exhausted },
      dreamsigns: source.dreamsigns.map((dreamsign) => ({ id: dreamsign.id })),
    };
  };
  return {
    viewer,
    version: state.version,
    config: copy(state.config),
    turn: copy(state.turn),
    sides: { player: side("player"), enemy: side("enemy") },
    instances,
    stack: state.stack.map((item) => ({
      ...copy(item),
      modes: [...item.modes],
      targets: item.targets.map((list) => list.filter(visible)),
    })),
    priority: state.priority,
    payable: state.payable.map((effect) => ({
      id: effect.id,
      // C7: the payer is the opponent of the effect's controller.
      controller: opponent(effect.payer),
      payer: effect.payer,
      cost: effect.cost,
      source: visibleSource(effect.source) ? copy(effect.source) : null,
      affects: effect.affects.filter(visible),
    })),
    floating: state.floating.filter(floatingVisible).map((effect) => copy(effect)),
    triggerQueue: state.triggerQueue.map((trigger) => ({
      controller: trigger.controller,
      source: visibleSource(trigger.source) ? copy(trigger.source) : null,
      origin: visibleSource(trigger.source) ? copy(trigger.origin) : null,
      ability: trigger.ability,
      node: trigger.node,
      subject: trigger.subject !== null && visible(trigger.subject) ? trigger.subject : null,
    })),
    turnLog: {
      played: {
        player: state.turnLog.played.player.filter((card) => visible(card.instance)).map((card) => ({ ...card })),
        enemy: state.turnLog.played.enemy.filter((card) => visible(card.instance)).map((card) => ({ ...card })),
      },
      drawn: { ...state.turnLog.drawn },
    },
    // A key names its source by instance ID or emblem: `i12#0`, `avatar:player#1`.
    oncePerTurn: state.oncePerTurn.filter((key) => {
      const source = key.slice(0, key.indexOf("#"));
      return source.startsWith("avatar:") || source.startsWith("dreamsign:") || source in instances;
    }),
    dreamwell: { remaining: state.dreamwell.deck.length - state.dreamwell.next, catalog: [...state.dreamwell.catalog] },
    challenge: copy(state.challenge),
    loop:
      state.loops.candidate === null
        ? null
        : {
            id: state.loops.candidate.id,
            side: state.loops.candidate.side,
            run: state.loops.run === null ? null : { remaining: state.loops.run.remaining, iterations: state.loops.run.iterations },
          },
    result: copy(state.result),
  };
}

/**
 * A pending prompt as `viewer` may see it. The side answering sees all of
 * it. Anyone else sees its kind, purpose, and bounds, with only the cards
 * `viewer` can identify in the display state, a purpose source it cannot
 * identify as `null` (so never the cards of a
 * `privateTo` prompt shown to the other side); such a redacted prompt is for
 * display and cannot be answered.
 */
export function promptView(prompt: Prompt, viewer: Side, display: BattleState): Prompt {
  if (prompt.side === viewer) return copy(prompt);
  const visible = (id: InstanceId): boolean => {
    const instance = display.instances[id];
    return instance !== undefined && knows(display, instance, viewer);
  };
  const { source } = prompt.purpose;
  const purpose = source === null || visible(source) ? copy(prompt.purpose) : { ...prompt.purpose, source: null, cardId: null };
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards":
      return { ...copy(prompt), purpose, candidates: prompt.candidates.filter(visible) };
    case "arrange":
      return { ...copy(prompt), purpose, cards: prompt.cards.filter(visible) };
    case "chooseMode":
    case "chooseNumber":
    case "confirm":
    case "payOrDecline":
      return { ...copy(prompt), purpose };
  }
}
