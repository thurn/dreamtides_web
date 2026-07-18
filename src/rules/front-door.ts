import type { EventContext } from "../eventlog/types";
import type { FrontDoorState } from "./fold-state";

const MAIN_ACTION_IDS: ReadonlySet<string> = new Set([
  "new-journey",
  "dream-codex",
  "settings",
  "about",
  "quit",
  "github",
  "discord",
]);

/** Fold one player action taken on a standalone front-door scene. */
export function frontDoorAction(
  state: FrontDoorState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): FrontDoorState | null {
  const surface = payload.surface;
  const actionId = payload.actionId;
  if (surface !== "main" || typeof actionId !== "string") return null;
  if (state.phase !== "main" || !MAIN_ACTION_IDS.has(actionId)) return null;

  if (actionId !== "new-journey") {
    return state;
  }

  return {
    phase: "mainExiting",
    journeyId: `event:${String(ctx.seq)}`,
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
