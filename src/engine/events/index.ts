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
import { cardDiscovered, type CardDiscoveredEvent } from "./kinds/card-discovered";
import { cardDrawn, type CardDrawnEvent } from "./kinds/card-drawn";
import { cardPlayed, type CardPlayedEvent } from "./kinds/card-played";
import { cardTaken, type CardTakenEvent } from "./kinds/card-taken";
import { cardsPlaced, type CardsPlacedEvent } from "./kinds/cards-placed";
import { ceasedToExist, type CeasedToExistEvent } from "./kinds/ceased-to-exist";
import { challengersDesignated, type ChallengersDesignatedEvent } from "./kinds/challengers-designated";
import { controlChanged, type ControlChangedEvent } from "./kinds/control-changed";
import { countersChanged, type CountersChangedEvent } from "./kinds/counters-changed";
import { scoreGroup, type ScoreGroupEvent } from "./kinds/score-group";
import { discardBatch, type DiscardBatchEvent } from "./kinds/discard-batch";
import { discarded, type DiscardedEvent } from "./kinds/discarded";
import { dissolved, type DissolvedEvent } from "./kinds/dissolved";
import { dreamwellDrawn, type DreamwellDrawnEvent } from "./kinds/dreamwell-drawn";
import { effectEnded, type EffectEndedEvent } from "./kinds/effect-ended";
import { effectStarted, type EffectStartedEvent } from "./kinds/effect-started";
import { energyChanged, type EnergyChangedEvent } from "./kinds/energy-changed";
import { enteredVoid, type EnteredVoidEvent } from "./kinds/entered-void";
import { eroded, type ErodedEvent } from "./kinds/eroded";
import { exhaustionChanged, type ExhaustionChangedEvent } from "./kinds/exhaustion-changed";
import { extraTurnGranted, type ExtraTurnGrantedEvent } from "./kinds/extra-turn-granted";
import { fatigue, type FatigueEvent } from "./kinds/fatigue";
import { feasibilityBounded, type FeasibilityBoundedEvent } from "./kinds/feasibility-bounded";
import { figmentsMerged, type FigmentsMergedEvent } from "./kinds/figments-merged";
import { foresaw, type ForesawEvent } from "./kinds/foresaw";
import { handEmptied, type HandEmptiedEvent } from "./kinds/hand-emptied";
import { laneResolved, type LaneResolvedEvent } from "./kinds/lane-resolved";
import { leftPlay, type LeftPlayEvent } from "./kinds/left-play";
import { leftVoid, type LeftVoidEvent } from "./kinds/left-void";
import { lookedAtTop, type LookedAtTopEvent } from "./kinds/looked-at-top";
import { loopEnded, type LoopEndedEvent } from "./kinds/loop-ended";
import { loopStarted, type LoopStartedEvent } from "./kinds/loop-started";
import { materialized, type MaterializedEvent } from "./kinds/materialized";
import { noLegalTarget, type NoLegalTargetEvent } from "./kinds/no-legal-target";
import { openingHandCompleted, type OpeningHandCompletedEvent } from "./kinds/opening-hand-completed";
import { payableEffectEnded, type PayableEffectEndedEvent } from "./kinds/payable-effect-ended";
import { payableEffectRegistered, type PayableEffectRegisteredEvent } from "./kinds/payable-effect-registered";
import { pendingAbility, type PendingAbilityEvent } from "./kinds/pending-ability";
import { phaseChanged, type PhaseChangedEvent } from "./kinds/phase-changed";
import { pointsScored, type PointsScoredEvent } from "./kinds/points-scored";
import { prevented, type PreventedEvent } from "./kinds/prevented";
import { promptAutoAnswered, type PromptAutoAnsweredEvent } from "./kinds/prompt-auto-answered";
import { repositioned, type RepositionedEvent } from "./kinds/repositioned";
import { resolved, type ResolvedEvent } from "./kinds/resolved";
import { returnedToHand, type ReturnedToHandEvent } from "./kinds/returned-to-hand";
import { revealed, type RevealedEvent } from "./kinds/revealed";
import { shuffledIntoDeck, type ShuffledIntoDeckEvent } from "./kinds/shuffled-into-deck";
import { sparkGained, type SparkGainedEvent } from "./kinds/spark-gained";
import { subtypeChosen, type SubtypeChosenEvent } from "./kinds/subtype-chosen";
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
  | CardDiscoveredEvent
  | CardDrawnEvent
  | CardPlayedEvent
  | CardTakenEvent
  | CardsPlacedEvent
  | CeasedToExistEvent
  | ChallengersDesignatedEvent
  | ControlChangedEvent
  | CountersChangedEvent
  | DiscardedEvent
  | ScoreGroupEvent
  | DiscardBatchEvent
  | DissolvedEvent
  | DreamwellDrawnEvent
  | EffectEndedEvent
  | EffectStartedEvent
  | EnergyChangedEvent
  | EnteredVoidEvent
  | ErodedEvent
  | ExhaustionChangedEvent
  | ExtraTurnGrantedEvent
  | FatigueEvent
  | FeasibilityBoundedEvent
  | FigmentsMergedEvent
  | ForesawEvent
  | HandEmptiedEvent
  | LaneResolvedEvent
  | LeftPlayEvent
  | LeftVoidEvent
  | LookedAtTopEvent
  | LoopEndedEvent
  | LoopStartedEvent
  | MaterializedEvent
  | NoLegalTargetEvent
  | OpeningHandCompletedEvent
  | PayableEffectEndedEvent
  | PayableEffectRegisteredEvent
  | PendingAbilityEvent
  | PhaseChangedEvent
  | PointsScoredEvent
  | PreventedEvent
  | PromptAutoAnsweredEvent
  | RepositionedEvent
  | ResolvedEvent
  | ReturnedToHandEvent
  | RevealedEvent
  | ShuffledIntoDeckEvent
  | SparkGainedEvent
  | SubtypeChosenEvent
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
  cardDiscovered,
  cardDrawn,
  cardPlayed,
  cardTaken,
  cardsPlaced,
  ceasedToExist,
  challengersDesignated,
  controlChanged,
  countersChanged,
  discarded,
  discardBatch,
  scoreGroup,
  dissolved,
  dreamwellDrawn,
  effectEnded,
  get effectStarted() {
    return effectStarted;
  },
  energyChanged,
  enteredVoid,
  eroded,
  exhaustionChanged,
  extraTurnGranted,
  fatigue,
  feasibilityBounded,
  figmentsMerged,
  foresaw,
  handEmptied,
  laneResolved,
  leftPlay,
  leftVoid,
  lookedAtTop,
  loopEnded,
  loopStarted,
  materialized,
  noLegalTarget,
  openingHandCompleted,
  payableEffectEnded,
  payableEffectRegistered,
  pendingAbility,
  phaseChanged,
  pointsScored,
  prevented,
  promptAutoAnswered,
  repositioned,
  resolved,
  returnedToHand,
  revealed,
  shuffledIntoDeck,
  sparkGained,
  subtypeChosen,
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
