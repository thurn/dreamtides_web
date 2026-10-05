/**
 * The engine event registry. Each kind is declared in its own module under
 * `kinds/`; adding a kind adds its module, one import, one union member, and
 * one entry below. The `satisfies` clause makes a missing entry a type error.
 */
import { battleEnded, type BattleEndedEvent } from "./kinds/battle-ended";
import { blockersDesignated, type BlockersDesignatedEvent } from "./kinds/blockers-designated";
import { cardDrawn, type CardDrawnEvent } from "./kinds/card-drawn";
import { cardPlayed, type CardPlayedEvent } from "./kinds/card-played";
import { challengersDesignated, type ChallengersDesignatedEvent } from "./kinds/challengers-designated";
import { discarded, type DiscardedEvent } from "./kinds/discarded";
import { dissolved, type DissolvedEvent } from "./kinds/dissolved";
import { dreamwellDrawn, type DreamwellDrawnEvent } from "./kinds/dreamwell-drawn";
import { energyChanged, type EnergyChangedEvent } from "./kinds/energy-changed";
import { fatigue, type FatigueEvent } from "./kinds/fatigue";
import { laneResolved, type LaneResolvedEvent } from "./kinds/lane-resolved";
import { materialized, type MaterializedEvent } from "./kinds/materialized";
import { noLegalTarget, type NoLegalTargetEvent } from "./kinds/no-legal-target";
import { phaseChanged, type PhaseChangedEvent } from "./kinds/phase-changed";
import { pointsScored, type PointsScoredEvent } from "./kinds/points-scored";
import { repositioned, type RepositionedEvent } from "./kinds/repositioned";
import { resolved, type ResolvedEvent } from "./kinds/resolved";
import { turnStarted, type TurnStartedEvent } from "./kinds/turn-started";
import type { EventDefinition } from "./types";

export type EngineEvent =
  | BattleEndedEvent
  | BlockersDesignatedEvent
  | CardDrawnEvent
  | CardPlayedEvent
  | ChallengersDesignatedEvent
  | DiscardedEvent
  | DissolvedEvent
  | DreamwellDrawnEvent
  | EnergyChangedEvent
  | FatigueEvent
  | LaneResolvedEvent
  | MaterializedEvent
  | NoLegalTargetEvent
  | PhaseChangedEvent
  | PointsScoredEvent
  | RepositionedEvent
  | ResolvedEvent
  | TurnStartedEvent;

export type EngineEventKind = EngineEvent["kind"];

export type EventOf<K extends EngineEventKind> = Extract<EngineEvent, { kind: K }>;

export const EVENT_DEFINITIONS = {
  battleEnded,
  blockersDesignated,
  cardDrawn,
  cardPlayed,
  challengersDesignated,
  discarded,
  dissolved,
  dreamwellDrawn,
  energyChanged,
  fatigue,
  laneResolved,
  materialized,
  noLegalTarget,
  phaseChanged,
  pointsScored,
  repositioned,
  resolved,
  turnStarted,
} as const satisfies { readonly [K in EngineEventKind]: EventDefinition<EventOf<K>> };

export function eventDefinition<K extends EngineEventKind>(
  kind: K,
): EventDefinition<EventOf<K>> {
  return EVENT_DEFINITIONS[kind] as EventDefinition<EventOf<K>>;
}
