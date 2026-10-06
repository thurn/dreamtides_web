import type { AbilitySource, AvatarId, CardId, DreamsignId, EffectId, InstanceId, Side, Zone } from "../state/ids";
import { opponent } from "../state/ids";
import type {
  BattleConfig,
  BattleResult,
  BattleState,
  CardInstance,
  CardStatus,
  ChallengeState,
  Expiry,
  FloatingChange,
  FloatingEffect,
  StackItem,
  TurnState,
} from "../state/types";
import type { Variant } from "../dsl/types";

/** One instance the viewer can see, with its card identity. */
export interface InstanceView {
  readonly id: InstanceId;
  readonly cardId: CardId;
  readonly owner: Side;
  readonly controller: Side;
  readonly zone: Zone;
  readonly variant: Readonly<Variant>;
  readonly status: Readonly<CardStatus>;
  readonly enteredZoneAt: number;
}

/**
 * A zone whose contents are hidden from at least one side: its size plus the
 * cards in it the viewer knows, in zone order. A hidden card appears only in
 * `count`; its instance ID is never exposed.
 */
export interface HiddenZoneView {
  readonly count: number;
  readonly known: readonly InstanceId[];
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

/** A triggered ability waiting to resolve; a source the viewer cannot see is `null`. */
export interface QueuedTriggerView {
  readonly controller: Side;
  readonly source: AbilitySource | null;
  readonly ability: number;
  readonly node: number | null;
  readonly subject: InstanceId | null;
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

/**
 * What one side may know about a battle. It is the only thing the UI and the
 * AI read. It shares no objects with the state it was built from, carries no
 * seed or random-stream counters, and lists only instances the viewer can
 * see: those in public zones and those known to the viewer (for now, the
 * cards in the viewer's own hand, including any the opponent owns). Every
 * deck and the opponent's hand appear as counts.
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
  readonly dreamwell: { readonly remaining: number };
  readonly challenge: Readonly<ChallengeState> | null;
  readonly result: Readonly<BattleResult> | null;
}

/** Whether `viewer` may see this instance's identity. */
function visibleTo(instance: CardInstance, viewer: Side): boolean {
  switch (instance.zone) {
    case "deck":
      return false;
    case "hand":
      // The side holding a card sees it, whoever owns it.
      return instance.controller === viewer;
    case "stack":
    case "play":
    case "void":
    case "banished":
      return true;
  }
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
  return { count: ids.length, known: ids.filter(visible) };
}

export function view(state: BattleState, viewer: Side): BattleView {
  const instances: Record<InstanceId, InstanceView> = {};
  for (const instance of Object.values(state.instances)) {
    if (visibleTo(instance, viewer)) {
      instances[instance.id] = {
        id: instance.id,
        cardId: instance.cardId,
        owner: instance.owner,
        controller: instance.controller,
        zone: instance.zone,
        variant: { ...instance.variant },
        status: { ...instance.status },
        enteredZoneAt: instance.enteredZoneAt,
      };
    }
  }
  const visible = (id: InstanceId): boolean => id in instances;
  const visibleSource = (source: AbilitySource): boolean => typeof source !== "string" || visible(source);
  const floatingVisible = (effect: FloatingEffect): boolean =>
    visibleSource(effect.source) && (effect.change.kind === "trigger" || visible(effect.change.instance));
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
      ability: trigger.ability,
      node: trigger.node,
      subject: trigger.subject !== null && visible(trigger.subject) ? trigger.subject : null,
    })),
    dreamwell: { remaining: state.dreamwell.deck.length - state.dreamwell.next },
    challenge: copy(state.challenge),
    result: copy(state.result),
  };
}
