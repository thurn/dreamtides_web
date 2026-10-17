// The player's walk on the overworld (decision P14), as pure state steps.
// Walking is view-local presentation: it is never logged and never an event.
// A keyboard direction steps tile by tile while held; a click follows an A*
// path; either moves at the walking speed and stops at blocked tiles.

import type { TilePoint } from "../map/definition";

export type Facing = "up" | "down" | "left" | "right";

export const FACING_STEPS: Readonly<Record<Facing, TilePoint>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export interface WalkerState {
  /** The tile the walker stands on, or is leaving. */
  readonly tile: TilePoint;
  readonly facing: Facing;
  /** The step in progress: its target tile and progress in [0, 1). */
  readonly step: { readonly to: TilePoint; readonly progress: number } | null;
  /** Remaining path tiles after the current step. */
  readonly path: readonly TilePoint[];
  /** The held keyboard direction, if any. */
  readonly held: Facing | null;
}

/** Whether a tile can be entered (on the map, walkable, unoccupied). */
export type CanEnter = (tile: TilePoint) => boolean;

export function initialWalker(tile: TilePoint, facing: Facing = "down"): WalkerState {
  return { tile, facing, step: null, path: [], held: null };
}

function facingToward(from: TilePoint, to: TilePoint, fallback: Facing): Facing {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/** The tile the walker faces. */
export function facedTile(walker: WalkerState): TilePoint {
  const origin = walker.step?.to ?? walker.tile;
  const [dx, dy] = FACING_STEPS[walker.facing];
  return [origin[0] + dx, origin[1] + dy];
}

/** The walker's position in tiles, between its tile and its step target. */
export function walkerPosition(walker: WalkerState): { readonly x: number; readonly y: number } {
  if (walker.step === null) return { x: walker.tile[0], y: walker.tile[1] };
  const t = walker.step.progress;
  return {
    x: walker.tile[0] + (walker.step.to[0] - walker.tile[0]) * t,
    y: walker.tile[1] + (walker.step.to[1] - walker.tile[1]) * t,
  };
}

/** Start the next step from the path or the held direction, if any. */
function beginNext(walker: WalkerState, canEnter: CanEnter): WalkerState {
  const [next, ...rest] = walker.path;
  if (next !== undefined) {
    const facing = facingToward(walker.tile, next, walker.facing);
    if (!canEnter(next)) return { ...walker, facing, path: [] };
    return { ...walker, facing, step: { to: next, progress: 0 }, path: rest };
  }
  if (walker.held !== null) {
    const [dx, dy] = FACING_STEPS[walker.held];
    const to: TilePoint = [walker.tile[0] + dx, walker.tile[1] + dy];
    if (!canEnter(to)) return { ...walker, facing: walker.held };
    return { ...walker, facing: walker.held, step: { to, progress: 0 } };
  }
  return walker;
}

/** Press or release a keyboard direction; a press cancels any click path. */
export function holdDirection(
  walker: WalkerState,
  direction: Facing | null,
  canEnter: CanEnter,
): WalkerState {
  const next = { ...walker, held: direction, path: direction === null ? walker.path : [] };
  return next.step === null ? beginNext(next, canEnter) : next;
}

/**
 * Follow `path` (from `findPath`, starting at the walker's tile or its step
 * target). A step in progress finishes first.
 */
export function followPath(
  walker: WalkerState,
  path: readonly TilePoint[],
  canEnter: CanEnter,
): WalkerState {
  const origin = walker.step?.to ?? walker.tile;
  const start = path[0];
  const rest = start !== undefined && start[0] === origin[0] && start[1] === origin[1] ? path.slice(1) : path;
  const next = { ...walker, path: rest, held: null };
  return next.step === null ? beginNext(next, canEnter) : next;
}

/** Turn to face `tile` without moving (when idle). */
export function faceTile(walker: WalkerState, tile: TilePoint): WalkerState {
  if (walker.step !== null) return walker;
  return { ...walker, facing: facingToward(walker.tile, tile, walker.facing) };
}

/** Place the walker on `tile`, idle (a teleport; QA only). */
export function placeWalker(walker: WalkerState, tile: TilePoint): WalkerState {
  return { ...walker, tile, step: null, path: [], held: null };
}

/** Whether the walker is standing still with nothing queued. */
export function isIdle(walker: WalkerState): boolean {
  return walker.step === null && walker.path.length === 0 && walker.held === null;
}

/**
 * Advance the walk by `seconds` at `tilesPerSecond`, finishing steps and
 * starting queued ones.
 */
export function advanceWalker(
  walker: WalkerState,
  seconds: number,
  tilesPerSecond: number,
  canEnter: CanEnter,
): WalkerState {
  let state = walker;
  let budget = seconds * tilesPerSecond;
  while (budget > 0 && state.step !== null) {
    const remaining = 1 - state.step.progress;
    if (budget < remaining) {
      return { ...state, step: { ...state.step, progress: state.step.progress + budget } };
    }
    budget -= remaining;
    state = beginNext({ ...state, tile: state.step.to, step: null }, canEnter);
  }
  return state;
}
