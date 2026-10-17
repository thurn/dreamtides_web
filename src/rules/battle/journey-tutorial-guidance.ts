import { tutorialCheckpointQueue } from "./tutorial-checkpoints";
import { BATTLE } from "../../content/battle";
import type { Engine, EngineEvent } from "../../engine";
import type { BattleSlice, FoldObservation } from "../../engine/fold/slice";
import { parseBattleCardId, parsePresentationId, type DreamwellCardId, type PresentationId, type TutorialTriggerId } from "../../types/identifiers";
import { cardIdFromUnknown, type CardId } from "../../types/card-identity";
import type { TutorialTriggerDefinition, TutorialTriggerEvent } from "../../types/tutorial";
import type { FoldState } from "../fold-state";
import { journeyBattleOf, type BattleFoldState, type JourneyBattleFoldState, type TutorialBattleDisplayInit, type TutorialCheckpoint, type TutorialGuidancePresentation, type TutorialGuidanceSource } from "./fold";
import { batchStates, foldAdapterFor } from "./engine-battle";
import { matchTutorialGuidance } from "./tutorial-guidance";
import { createBattleCardDisplayResolver } from "../../battle/card-display-definition";

/** Common read projection; journey battles retain their ordinary mode and host. */
export interface BattleGuidanceHost {
  readonly init: TutorialBattleDisplayInit;
  readonly engine: BattleFoldState["engine"];
  readonly checkpoints: readonly TutorialCheckpoint[];
}

export function battleGuidanceOf(battle: BattleFoldState | null): BattleGuidanceHost | null {
  if (battle === null) return null;
  if (battle.mode.kind === "tutorial") return battle as import("./fold").TutorialBattleFoldState;
  const journey = journeyBattleOf(battle);
  const guidance = journey?.guidance;
  return journey === null || guidance === undefined ? null : {
    init: { ...journey.init, tutorialTriggers: guidance.tutorialTriggers, dreamwellDeck: guidance.dreamwellDeck },
    engine: battle.engine,
    checkpoints: guidance.checkpoints,
  };
}

/** One shared matcher and authored-message projection for both battle hosts. */
export function selectBattleGuidance(
  triggers: readonly TutorialTriggerDefinition[], seen: readonly TutorialTriggerId[],
  event: TutorialTriggerEvent, source: TutorialGuidanceSource, id: PresentationId,
  cardId?: CardId | DreamwellCardId, text = "", cardKind?: "character" | "event", automatic = false,
): TutorialGuidancePresentation | null {
  const matches = matchTutorialGuidance(triggers, { event, renderedText: text, seenTriggerIds: new Set(seen), ...(cardId === undefined ? {} : { cardId }), ...(cardKind === undefined ? {} : { cardKind }) });
  return matches.length === 0 ? null : {
    kind: "tutorial-guidance", id, source, messageIndex: 0, automatic,
    messages: matches.map(trigger => ({ triggerId: trigger.id, speaker: trigger.speaker, text: trigger.text, duration: trigger.duration, ...(trigger.delay?.[event] === undefined ? {} : { delay: trigger.delay[event] }), horizontalOffset: trigger.horizontalOffset, verticalOffset: trigger.verticalOffset, bubbleWidth: trigger.bubbleWidth })),
  };
}

type GuidanceCardText = (cardId: CardId) => string | undefined;
type GuidanceMetadata = NonNullable<JourneyBattleFoldState["guidance"]>;
const captureKeys = new WeakMap<GuidanceMetadata, WeakMap<JourneyBattleFoldState["init"], Map<GuidanceCardText | undefined, object>>>();

/** Immutable metadata identity; shared first-occurrence history is intentionally excluded. */
function captureKey(battle: JourneyBattleFoldState, text: GuidanceCardText | undefined): object {
  const guidance = battle.guidance!;
  let byInit = captureKeys.get(guidance);
  if (byInit === undefined) { byInit = new WeakMap(); captureKeys.set(guidance, byInit); }
  let byText = byInit.get(battle.init);
  if (byText === undefined) { byText = new Map(); byInit.set(battle.init, byText); }
  let key = byText.get(text);
  if (key === undefined) { key = {}; byText.set(text, key); }
  return key;
}

/**
 * Retain potential teaching sources independently of the ordinary visual cap.
 * Empty local history stays a subset of any shared history: each selected
 * trigger either is already shared-seen or is selected by both matchers.
 * Every actual teaching edge is therefore captured, with at most one new
 * required frame per authored trigger in this public intent.
 */
export function journeyGuidanceObservation(battle: JourneyBattleFoldState, engine: Engine, text?: GuidanceCardText): FoldObservation {
  const guidance = battle.guidance!;
  const seen: TutorialTriggerId[] = [];
  const definitions = createBattleCardDisplayResolver(battle.init.cardDefinitions);
  const id = parsePresentationId(`${battle.init.battleId}:guidance-source-observation`);
  return {
    presented: () => true, limit: BATTLE.presentation.maxObservedEventStates,
    required: { key: captureKey(battle, text), select: (event, snapshot) => {
      const on: TutorialTriggerEvent | undefined = event.kind === "cardPlayed" ? "card-play" : event.kind === "dreamwellDrawn" ? "dreamwell-resolve" : event.kind === "cardCreated" && event.printing.kind === "figment" ? "figment-created" : event.kind === "laneResolved" ? "challenge-resolved" : undefined;
      if (on === undefined || !guidance.tutorialTriggers.some(trigger => trigger.on.includes(on) && !seen.includes(trigger.id))) return false;
      const frame = snapshot();
      const presentation = guidanceForEvent(battle, engine, event, frame, seen, id, definitions, text);
      if (presentation === null) return false;
      seen.push(...presentation.messages.map(message => message.triggerId));
      return true;
    } },
  };
}

/** The same physical producer projection supplies selection and persisted teaching. */
function guidanceForEvent(
  battle: JourneyBattleFoldState, engine: Engine, event: EngineEvent,
  frame: import("../../engine/state/types").BattleState,
  seen: readonly TutorialTriggerId[], id: PresentationId,
  definitions: ReturnType<typeof createBattleCardDisplayResolver>, guidanceCardText?: GuidanceCardText,
): TutorialGuidancePresentation | null {
  const guidance = battle.guidance!;
  let presentation: TutorialGuidancePresentation | null = null;
  if (event.kind === "cardPlayed") {
    const printing = frame.instances[event.instance]?.printing;
    const cardId = printing?.kind === "card" || printing?.kind === "figmentCopy" ? printing.cardId : null;
    if (cardId !== null) {
      const physical = frame.instances[event.instance];
      const definition = definitions.definition(cardId, physical.variant);
      const cardKind = engine.view(frame, "player").instances[event.instance]?.characteristics.cardType ?? engine.catalog.card(cardId).cardType;
      presentation = selectBattleGuidance(guidance.tutorialTriggers, seen, "card-play", { kind: "card", cardId, battleCardId: parseBattleCardId(event.instance), cardKind, side: event.side }, id, cardId, definition?.renderedText ?? guidanceCardText?.(cardId) ?? "", cardKind, event.side === "enemy");
    }
  } else if (event.kind === "dreamwellDrawn") {
    const definition = guidance.dreamwellDeck.find(card => card.id === event.card);
    presentation = selectBattleGuidance(guidance.tutorialTriggers, seen, "dreamwell-resolve", { kind: "dreamwell", cardId: event.card, side: event.side }, id, event.card, definition?.renderedText ?? "");
  } else if (event.kind === "cardCreated" && event.printing.kind === "figment") {
    const cardId = cardIdFromUnknown(event.printing.figment);
    if (cardId !== null) presentation = selectBattleGuidance(guidance.tutorialTriggers, seen, "figment-created", { kind: "figment", cardId, battleCardId: parseBattleCardId(event.instance), side: event.side }, id);
  } else if (event.kind === "laneResolved") {
    presentation = selectBattleGuidance(guidance.tutorialTriggers, seen, "challenge-resolved", { kind: "challenge", activeSide: frame.turn.active, turnNumber: frame.turn.turnNumber, slotId: `F${event.lane}` }, id);
  }
  return presentation;
}

/** Only the five journey teaching edges; standalone cinematic pacing stays in its host. */
export function journeyGuidanceTransition(state: FoldState, battle: JourneyBattleFoldState, engine: Engine, slice: BattleSlice, published: readonly EngineEvent[], seq: number, guidanceCardText?: (cardId: CardId) => string | undefined): FoldState {
  const guidance = battle.guidance;
  if (guidance === undefined) return { ...state, battle: { ...battle, engine: { ...battle.engine, slice } } };
  const batch = batchStates(foldAdapterFor(engine), battle.engine.slice, slice, published);
  const checkpoints = [...guidance.checkpoints];
  const definitions = createBattleCardDisplayResolver(battle.init.cardDefinitions);
  const seen = [...state.tutorialTriggerIdsSeen];
  let before = batch.before;
  for (const [index, event] of published.entries()) {
    const observed = batch.eventStates[index];
    const frame = observed ?? batch.state;
    const id = parsePresentationId(`${battle.init.battleId}:${seq}:${index}:guidance`);
    const presentation = guidanceForEvent(battle, engine, event, frame, seen, id, definitions, guidanceCardText);
    if (presentation !== null) {
      seen.push(...presentation.messages.map(message => message.triggerId));
      // Across an unobserved gap, before is the latest retained predecessor,
      // rather than an immediate-event snapshot. Card plays retain their intent start.
      checkpoints.push({ presentation, before: event.kind === "cardPlayed" ? batch.before : before, state: frame, producer: { seq, index } });
    }
    if (observed !== undefined) before = observed;
  }
  return { ...state, tutorialTriggerIdsSeen: seen, battle: { ...battle, engine: { ...battle.engine, slice }, guidance: { ...guidance, ...tutorialCheckpointQueue(checkpoints) } } };
}
