import type { CardId, InstanceId, Side, Zone } from "../state/ids";
import type {
  BattleConfig,
  BattleResult,
  BattleState,
  CardInstance,
  CardStatus,
  ChallengeState,
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
}

/**
 * What one side may know about a battle. It is the only thing the UI and the
 * AI read. It shares no objects with the state it was built from, carries no
 * seed or random-stream counters, and lists only instances the viewer can
 * see: those in public zones and those known to the viewer (for now, the
 * viewer's own hand). Every deck and the opponent's hand appear as counts.
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
      return instance.owner === viewer;
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
      ...item,
      modes: [...item.modes],
      targets: item.targets.map((list) => list.filter(visible)),
    })),
    priority: state.priority,
    dreamwell: { remaining: state.dreamwell.deck.length - state.dreamwell.next },
    challenge: copy(state.challenge),
    result: copy(state.result),
  };
}
