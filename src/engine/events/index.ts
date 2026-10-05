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
import { cardDrawn, type CardDrawnEvent } from "./kinds/card-drawn";
import { cardPlayed, type CardPlayedEvent } from "./kinds/card-played";
import { ceasedToExist, type CeasedToExistEvent } from "./kinds/ceased-to-exist";
import { challengersDesignated, type ChallengersDesignatedEvent } from "./kinds/challengers-designated";
import { discarded, type DiscardedEvent } from "./kinds/discarded";
import { dissolved, type DissolvedEvent } from "./kinds/dissolved";
import { dreamwellDrawn, type DreamwellDrawnEvent } from "./kinds/dreamwell-drawn";
import { energyChanged, type EnergyChangedEvent } from "./kinds/energy-changed";
import { eroded, type ErodedEvent } from "./kinds/eroded";
import { exhaustionChanged, type ExhaustionChangedEvent } from "./kinds/exhaustion-changed";
import { fatigue, type FatigueEvent } from "./kinds/fatigue";
import { laneResolved, type LaneResolvedEvent } from "./kinds/lane-resolved";
import { materialized, type MaterializedEvent } from "./kinds/materialized";
import { noLegalTarget, type NoLegalTargetEvent } from "./kinds/no-legal-target";
import { pendingAbility, type PendingAbilityEvent } from "./kinds/pending-ability";
import { payableEffectEnded, type PayableEffectEndedEvent } from "./kinds/payable-effect-ended";
import { payableEffectRegistered, type PayableEffectRegisteredEvent } from "./kinds/payable-effect-registered";
import { phaseChanged, type PhaseChangedEvent } from "./kinds/phase-changed";
import { pointsScored, type PointsScoredEvent } from "./kinds/points-scored";
import { prevented, type PreventedEvent } from "./kinds/prevented";
import { repositioned, type RepositionedEvent } from "./kinds/repositioned";
import { resolved, type ResolvedEvent } from "./kinds/resolved";
import { returnedToHand, type ReturnedToHandEvent } from "./kinds/returned-to-hand";
import { sparkGained, type SparkGainedEvent } from "./kinds/spark-gained";
import { turnStarted, type TurnStartedEvent } from "./kinds/turn-started";
import type { EventDefinition } from "./types";

export type EngineEvent =
  | AbandonedEvent
  | AbilityActivatedEvent
  | AbilityResolvedEvent
  | AvatarExhaustionChangedEvent
  | BanishedEvent
  | BattleEndedEvent
  | BlockersDesignatedEvent
  | CardDrawnEvent
  | CardPlayedEvent
  | CeasedToExistEvent
  | ChallengersDesignatedEvent
  | DiscardedEvent
  | DissolvedEvent
  | DreamwellDrawnEvent
  | EnergyChangedEvent
  | ErodedEvent
  | ExhaustionChangedEvent
  | FatigueEvent
  | LaneResolvedEvent
  | MaterializedEvent
  | NoLegalTargetEvent
  | PendingAbilityEvent
  | PayableEffectEndedEvent
  | PayableEffectRegisteredEvent
  | PhaseChangedEvent
  | PointsScoredEvent
  | PreventedEvent
  | RepositionedEvent
  | ResolvedEvent
  | ReturnedToHandEvent
  | SparkGainedEvent
  | TurnStartedEvent;

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
  cardDrawn,
  cardPlayed,
  ceasedToExist,
  challengersDesignated,
  discarded,
  dissolved,
  dreamwellDrawn,
  energyChanged,
  eroded,
  exhaustionChanged,
  fatigue,
  laneResolved,
  materialized,
  noLegalTarget,
  pendingAbility,
  payableEffectEnded,
  payableEffectRegistered,
  phaseChanged,
  pointsScored,
  prevented,
  repositioned,
  resolved,
  returnedToHand,
  sparkGained,
  turnStarted,
} as const satisfies { readonly [K in EngineEventKind]: EventDefinition<EventOf<K>> };

export function eventDefinition<K extends EngineEventKind>(
  kind: K,
): EventDefinition<EventOf<K>> {
  return EVENT_DEFINITIONS[kind] as EventDefinition<EventOf<K>>;
}
