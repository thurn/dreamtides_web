import type { EventContext } from "../eventlog/types";
import { parseTutorialActions } from "../data/tutorial-actions";
import {
  TUTORIAL_PLAYER_CARD_ID,
  TUTORIAL_PLAYER_CARD_INSTANCE_ID,
} from "../data/tutorial-cards";
import type { FrontDoorState } from "./fold-state";

const MAIN_ACTION_IDS: ReadonlySet<string> = new Set([
  "new-journey",
  "dream-codex",
  "settings",
  "about",
  "quit",
  "github",
  "discord",
  "reddit",
]);

function isTutorialPlayerBackSlotId(value: unknown): value is string {
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
  const actionId = payload.actionId;
  if (typeof actionId !== "string") return null;

  if (surface === "tutorial") {
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
      play.cardInstanceId !== TUTORIAL_PLAYER_CARD_INSTANCE_ID ||
      play.cardId !== TUTORIAL_PLAYER_CARD_ID ||
      (targetSlotId !== null &&
        !isTutorialPlayerBackSlotId(targetSlotId))
    ) {
      return null;
    }
    return {
      ...state,
      tutorial: {
        ...tutorial,
        playerCardPlay: {
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId,
        },
      },
    };
  }

  if (surface !== "main") return null;
  if (state.phase !== "main" || !MAIN_ACTION_IDS.has(actionId)) return null;

  if (actionId !== "new-journey") {
    return state;
  }

  return {
    phase: "mainExiting",
    journeyId: `event:${String(ctx.seq)}`,
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
): FrontDoorState | null {
  if (state.phase !== "tutorial") return null;
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
  const playerCardPlay =
    actions
      .slice(0, completedActionCount)
      .some((action) => action.action === "end-turn")
      ? {
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId: null,
        }
      : null;
  return {
    ...state,
    tutorial: {
      runId: `event:${String(ctx.seq)}`,
      actions,
      currentActionIndex: startActionIndex,
      playerCardPlay,
    },
  };
}

/** Advance exactly the currently active action in one tutorial playback. */
export function completeTutorialAction(
  state: FrontDoorState,
  payload: Record<string, unknown>,
): FrontDoorState | null {
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
  const nextIndex = tutorial.currentActionIndex + 1;
  return {
    ...state,
    tutorial: {
      ...tutorial,
      currentActionIndex:
        nextIndex < tutorial.actions.length ? nextIndex : null,
    },
  };
}
