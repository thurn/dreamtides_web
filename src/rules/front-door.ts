import type { EventContext } from "../eventlog/types";
import { parseTutorialActions } from "../data/tutorial-actions";
import { collectEngineWork } from "./battle/engine-battle";
import { getTutorialBattleInitProvider } from "./battle/tutorial-lifecycle";
import { startTutorialPrefix, enterPrefixAction, completePrefixAction, playPrefixPlayer, prefixPlayerInstance } from "./battle/tutorial-prefix";
import type { JourneyState } from "../types/journey";
import { parseBattleCardId } from "../types/identifiers";
import type { FrontDoorState } from "./fold-state";
import {
  frontDoorActionIdFromUnknown,
  parseFrontDoorActionId,
  parseJourneyId,
  parseTutorialRunId,
} from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import type {
  BattleSlotViewId,
  AvatarId,
  FrontDoorActionId,
} from "../types/identifiers";

/** Fold-safe identities loaded from the pinned tutorial scenario. */
export interface TutorialFrontDoorContentProvider {
  readonly playerCardId: CardId;
  readonly journeyAvatarId: AvatarId;
}

let tutorialContentProvider: TutorialFrontDoorContentProvider | null = null;

/** Register tutorial identities before any game event is folded. */
export function registerTutorialFrontDoorContentProvider(
  provider: TutorialFrontDoorContentProvider | null,
): void {
  tutorialContentProvider = provider;
}

/** Resolve the configured post-victory avatar for pure battle decisions. */
export function configuredTutorialJourneyAvatarId(): AvatarId | null {
  return tutorialContentProvider?.journeyAvatarId ?? null;
}

const MAIN_ACTION_IDS: ReadonlySet<FrontDoorActionId> = new Set([
  parseFrontDoorActionId("new-journey"),
]);

function isTutorialPlayerBackSlotId(value: unknown): value is BattleSlotViewId {
  return (
    typeof value === "string" &&
    (/^player-back-\d+$/.test(value) || /^B\d+$/.test(value))
  );
}

/** Fold one player action taken on a standalone front-door scene. */
export function frontDoorAction(
  state: FrontDoorState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): FrontDoorState | null {
  const surface = payload.surface;
  const actionId = frontDoorActionIdFromUnknown(payload.actionId);
  if (actionId === null) return null;

  if (surface === "tutorial") {
    const configuredPlayerCardId = tutorialContentProvider?.playerCardId;
    if (configuredPlayerCardId === undefined) return null;
    const tutorial = state.tutorial;
    const detail = payload.detail;
    const currentAction =
      tutorial?.currentActionIndex === null ||
      tutorial?.currentActionIndex === undefined
        ? null
        : (tutorial.actions[tutorial.currentActionIndex] ?? null);
    if (
      state.phase !== "tutorial" ||
      actionId !== "play-card" ||
      tutorial === null ||
      (currentAction !== null && currentAction.action !== "end-turn") ||
      tutorial.playerCardPlay != null ||
      typeof detail !== "object" ||
      detail === null ||
      Array.isArray(detail)
    ) {
      return null;
    }
    const play = detail as Record<string, unknown>;
    const targetSlotId = play.targetSlotId;
    if (
      play.runId !== tutorial.runId ||
      tutorial.prefix === undefined ||
      play.cardInstanceId !== prefixPlayerInstance(tutorial.prefix, configuredPlayerCardId) ||
      play.cardId !== configuredPlayerCardId ||
      (targetSlotId !== null && !isTutorialPlayerBackSlotId(targetSlotId))
    ) {
      return null;
    }
    const provider = getTutorialBattleInitProvider();
    const instance = tutorial.prefix === undefined ? null : prefixPlayerInstance(tutorial.prefix, configuredPlayerCardId);
    if (provider === null || tutorial.prefix === undefined || instance === null) return null;
    const prefix = playPrefixPlayer(provider.engine, tutorial.prefix, instance, ctx.seq, tutorial.actions, targetSlotId);
    if (prefix === null) return null;
    return {
      ...state,
      tutorial: {
        ...tutorial,
        prefix,
        playerCardPlay: {
          cardInstanceId: parseBattleCardId(instance),
          cardId: configuredPlayerCardId,
          targetSlotId,
        },
      },
    };
  }

  if (surface !== "main") return null;
  if (state.phase !== "main" || !MAIN_ACTION_IDS.has(actionId)) return null;

  return {
    phase: "mainExiting",
    journeyId: parseJourneyId(`event:${String(ctx.seq)}`),
    tutorial: null,
  };
}

/** Advance one automatic cinematic boundary for the current journey. */
export function advanceFrontDoor(
  state: FrontDoorState,
  payload: Record<string, unknown>,
): FrontDoorState | null {
  const from = payload.from;
  const journeyId = payload.journeyId;
  if (typeof journeyId !== "string" || journeyId !== state.journeyId)
    return null;

  if (from === "mainExiting" && state.phase === "mainExiting") {
    return { ...state, phase: "loading" };
  }
  if (from === "loading" && state.phase === "loading") {
    return { ...state, phase: "tutorial" };
  }
  return null;
}

/** Start or replay a shared tutorial from an authored action snapshot. */
export function beginTutorial(
  state: FrontDoorState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  journey: JourneyState,
): FrontDoorState | null {
  return collectEngineWork(ctx.seq,()=>beginTutorialPlayback(state,payload,ctx,journey));
}
function beginTutorialPlayback(state: FrontDoorState,payload: Record<string,unknown>,ctx: EventContext,journey:JourneyState):FrontDoorState|null {
  const configuredPlayerCardId = tutorialContentProvider?.playerCardId;
  if (state.phase !== "tutorial" || configuredPlayerCardId === undefined) {
    return null;
  }
  let actions;
  try {
    actions = parseTutorialActions(payload.actions);
  } catch {
    return null;
  }
  const startActionId = payload.startActionId;
  if (startActionId !== undefined && typeof startActionId !== "string") {
    return null;
  }
  const startAtEnd = payload.startAtEnd;
  if (
    (startAtEnd !== undefined && typeof startAtEnd !== "boolean") ||
    (startAtEnd === true && startActionId !== undefined)
  ) {
    return null;
  }
  const startActionIndex =
    startAtEnd === true
      ? null
      : startActionId === undefined
        ? actions.length === 0
          ? null
          : 0
        : actions.findIndex((action) => action.id === startActionId);
  if (startActionIndex === -1) return null;
  const completedActionCount =
    startAtEnd === true ? actions.length : (startActionIndex ?? 0);
  const provider = getTutorialBattleInitProvider();
  if (provider === null) return null;
  const runId = parseTutorialRunId(`event:${String(ctx.seq)}`);
  const setup = provider.beginTutorialPrefix({journey,actions,tutorialRunId:runId,restartNumber:0});
  if (setup === null) return null;
  let prefix = startTutorialPrefix(provider.engine,setup,actions,ctx.seq);
  if (prefix === null) return null;
  let playerCardPlay: import("../types/tutorial").TutorialPlayerCardPlay | null = null;
  for (const action of actions.slice(0,completedActionCount)) {
    if (action.action === "end-turn") {
      const card = prefixPlayerInstance(prefix,configuredPlayerCardId);
      if (card === null) return null;
      prefix = playPrefixPlayer(provider.engine,prefix,card,ctx.seq,actions,null);
      if (prefix === null) return null;
      playerCardPlay = {cardInstanceId:parseBattleCardId(card),cardId:configuredPlayerCardId,targetSlotId:null};
    }
    prefix = completePrefixAction(provider.engine,prefix,action,actions,ctx.seq);
    if (prefix === null) return null;
  }
  prefix = enterPrefixAction(provider.engine,prefix,startActionIndex === null ? undefined : actions[startActionIndex],actions,ctx.seq);
  if (prefix === null) return null;
  return {
    ...state,
    tutorial: {
      runId,
      prefix,
      actions,
      currentActionIndex: startActionIndex,
      playerCardPlay: playerCardPlay,
    },
  };
}

/** Advance exactly the currently active action in one tutorial playback. */
export function completeTutorialAction(
  state: FrontDoorState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): FrontDoorState | null {
  return collectEngineWork(ctx.seq,()=>completeTutorialPlaybackAction(state,payload,ctx));
}
function completeTutorialPlaybackAction(state:FrontDoorState,payload:Record<string,unknown>,ctx:EventContext):FrontDoorState|null {
  const tutorial = state.tutorial;
  if (
    state.phase !== "tutorial" ||
    tutorial === null ||
    tutorial.currentActionIndex === null ||
    payload.runId !== tutorial.runId
  ) {
    return null;
  }
  const current = tutorial.actions[tutorial.currentActionIndex];
  if (current === undefined || payload.actionId !== current.id) return null;
  if (current.action === "end-turn" && tutorial.playerCardPlay == null) {
    return null;
  }
  const provider = getTutorialBattleInitProvider();
  if (provider === null || tutorial.prefix === undefined) return null;
  let prefix = completePrefixAction(provider.engine,tutorial.prefix,current,tutorial.actions,ctx.seq);
  if (prefix === null) return null;
  const nextIndex = tutorial.currentActionIndex + 1;
  prefix = enterPrefixAction(provider.engine,prefix,tutorial.actions[nextIndex],tutorial.actions,ctx.seq);
  if (prefix === null) return null;
  return {
    ...state,
    tutorial: {
      ...tutorial,
      prefix,
      currentActionIndex:
        nextIndex < tutorial.actions.length ? nextIndex : null,
    },
  };
}
