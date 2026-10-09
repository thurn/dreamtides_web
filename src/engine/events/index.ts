/**
 * The engine event registry. Each kind is declared in its own module under
 * `kinds/`; adding a kind adds its module, one import, one union member, and
 * one entry below. The `satisfies` clause makes a missing entry a type error.
 */
import { abandoned, type AbandonedEvent } from "./kinds/abandoned";
import { abilityActivated, type AbilityActivatedEvent } from "./kinds/ability-activated";
import { abilityResolved, type AbilityResolvedEvent } from "./kinds/ability-resolved";
import { avatarExhaustionChanged, type AvatarExhaustionChangedEvent } from "./kinds/avatar-exhaustion-changed";
import { banished, type BanishedEvent } from "./kinds/banished";
import { battleEnded, type BattleEndedEvent } from "./kinds/battle-ended";
import { blockersDesignated, type BlockersDesignatedEvent } from "./kinds/blockers-designated";
import { capacityReached, type CapacityReachedEvent } from "./kinds/capacity-reached";
import { cardCopied, type CardCopiedEvent } from "./kinds/card-copied";
import { cardCreated, type CardCreatedEvent } from "./kinds/card-created";
import { cardDrawn, type CardDrawnEvent } from "./kinds/card-drawn";
import { cardPlayed, type CardPlayedEvent } from "./kinds/card-played";
import { ceasedToExist, type CeasedToExistEvent } from "./kinds/ceased-to-exist";
import { challengersDesignated, type ChallengersDesignatedEvent } from "./kinds/challengers-designated";
import { controlChanged, type ControlChangedEvent } from "./kinds/control-changed";
import { countersChanged, type CountersChangedEvent } from "./kinds/counters-changed";
import { discarded, type DiscardedEvent } from "./kinds/discarded";
import { dissolved, type DissolvedEvent } from "./kinds/dissolved";
import { dreamwellDrawn, type DreamwellDrawnEvent } from "./kinds/dreamwell-drawn";
import { effectEnded, type EffectEndedEvent } from "./kinds/effect-ended";
import { effectStarted, type EffectStartedEvent } from "./kinds/effect-started";
import { energyChanged, type EnergyChangedEvent } from "./kinds/energy-changed";
import { eroded, type ErodedEvent } from "./kinds/eroded";
import { exhaustionChanged, type ExhaustionChangedEvent } from "./kinds/exhaustion-changed";
import { fatigue, type FatigueEvent } from "./kinds/fatigue";
import { feasibilityBounded, type FeasibilityBoundedEvent } from "./kinds/feasibility-bounded";
import { figmentsMerged, type FigmentsMergedEvent } from "./kinds/figments-merged";
import { laneResolved, type LaneResolvedEvent } from "./kinds/lane-resolved";
import { leftPlay, type LeftPlayEvent } from "./kinds/left-play";
import { leftVoid, type LeftVoidEvent } from "./kinds/left-void";
import { loopEnded, type LoopEndedEvent } from "./kinds/loop-ended";
import { loopStarted, type LoopStartedEvent } from "./kinds/loop-started";
import { materialized, type MaterializedEvent } from "./kinds/materialized";
import { noLegalTarget, type NoLegalTargetEvent } from "./kinds/no-legal-target";
import { payableEffectEnded, type PayableEffectEndedEvent } from "./kinds/payable-effect-ended";
import { payableEffectRegistered, type PayableEffectRegisteredEvent } from "./kinds/payable-effect-registered";
import { pendingAbility, type PendingAbilityEvent } from "./kinds/pending-ability";
import { phaseChanged, type PhaseChangedEvent } from "./kinds/phase-changed";
import { pointsScored, type PointsScoredEvent } from "./kinds/points-scored";
import { prevented, type PreventedEvent } from "./kinds/prevented";
import { repositioned, type RepositionedEvent } from "./kinds/repositioned";
import { resolved, type ResolvedEvent } from "./kinds/resolved";
import { returnedToHand, type ReturnedToHandEvent } from "./kinds/returned-to-hand";
import { revealed, type RevealedEvent } from "./kinds/revealed";
import { sparkGained, type SparkGainedEvent } from "./kinds/spark-gained";
import { triggerQueued, type TriggerQueuedEvent } from "./kinds/trigger-queued";
import { triggerResolved, type TriggerResolvedEvent } from "./kinds/trigger-resolved";
import { turnStarted, type TurnStartedEvent } from "./kinds/turn-started";
import { winConditionMet, type WinConditionMetEvent } from "./kinds/win-condition-met";
import type { Side } from "../state/ids";
import type { BattleState } from "../state/types";
import type { EventDefinition } from "./types";

export type EngineEvent =
  | AbandonedEvent
  | AbilityActivatedEvent
  | AbilityResolvedEvent
  | AvatarExhaustionChangedEvent
  | BanishedEvent
  | BattleEndedEvent
  | BlockersDesignatedEvent
  | CapacityReachedEvent
  | CardCopiedEvent
  | CardCreatedEvent
  | CardDrawnEvent
  | CardPlayedEvent
  | CeasedToExistEvent
  | ChallengersDesignatedEvent
  | ControlChangedEvent
  | CountersChangedEvent
  | DiscardedEvent
  | DissolvedEvent
  | DreamwellDrawnEvent
  | EffectEndedEvent
  | EffectStartedEvent
  | EnergyChangedEvent
  | ErodedEvent
  | ExhaustionChangedEvent
  | FatigueEvent
  | FeasibilityBoundedEvent
  | FigmentsMergedEvent
  | LaneResolvedEvent
  | LeftPlayEvent
  | LeftVoidEvent
  | LoopEndedEvent
  | LoopStartedEvent
  | MaterializedEvent
  | NoLegalTargetEvent
  | PayableEffectEndedEvent
  | PayableEffectRegisteredEvent
  | PendingAbilityEvent
  | PhaseChangedEvent
  | PointsScoredEvent
  | PreventedEvent
  | RepositionedEvent
  | ResolvedEvent
  | ReturnedToHandEvent
  | RevealedEvent
  | SparkGainedEvent
  | TriggerQueuedEvent
  | TriggerResolvedEvent
  | TurnStartedEvent
  | WinConditionMetEvent;

export type EngineEventKind = EngineEvent["kind"];

export type EventOf<K extends EngineEventKind> = Extract<EngineEvent, { kind: K }>;

export const EVENT_DEFINITIONS = {
  abandoned,
  abilityActivated,
  abilityResolved,
  avatarExhaustionChanged,
  banished,
  battleEnded,
  blockersDesignated,
  capacityReached,
  cardCopied,
  cardCreated,
  cardDrawn,
  cardPlayed,
  ceasedToExist,
  challengersDesignated,
  controlChanged,
  countersChanged,
  discarded,
  dissolved,
  dreamwellDrawn,
  effectEnded,
  effectStarted,
  energyChanged,
  eroded,
  exhaustionChanged,
  fatigue,
  feasibilityBounded,
  figmentsMerged,
  laneResolved,
  leftPlay,
  leftVoid,
  loopEnded,
  loopStarted,
  materialized,
  noLegalTarget,
  payableEffectEnded,
  payableEffectRegistered,
  pendingAbility,
  phaseChanged,
  pointsScored,
  prevented,
  repositioned,
  resolved,
  returnedToHand,
  revealed,
  sparkGained,
  triggerQueued,
  triggerResolved,
  turnStarted,
  winConditionMet,
} as const satisfies { readonly [K in EngineEventKind]: EventDefinition<EventOf<K>> };

export function eventDefinition<K extends EngineEventKind>(
  kind: K,
): EventDefinition<EventOf<K>> {
  return EVENT_DEFINITIONS[kind] as EventDefinition<EventOf<K>>;
}

/**
 * `event` as `viewer` sees it, judged in the state that arrives with it:
 * `null` when it is private to the other side or its kind's `redact` hides
 * it from the viewer, else the event with any field naming a card the viewer
 * cannot identify nulled (`EventDefinition.redact`).
 */
export function eventSeenBy(event: EngineEvent, viewer: Side, state: BattleState): EngineEvent | null {
  const definition = EVENT_DEFINITIONS[event.kind] as EventDefinition<EngineEvent>;
  const privateTo = definition.privateTo(event, state);
  if (privateTo !== null && privateTo !== viewer) return null;
  return definition.redact === undefined ? event : definition.redact(event, viewer, state);
}

/** Whether `viewer` sees `event` at all, perhaps with fields nulled (`eventSeenBy`). */
export function eventVisibleTo(event: EngineEvent, viewer: Side, state: BattleState): boolean {
  return eventSeenBy(event, viewer, state) !== null;
}
