// Character animation and facing as pure functions: which frame of the walk
// or idle sheet to show, which sheet row a facing uses, the idle frames of a
// layer without an idle sheet, and which way an idle character faces given
// where the player stands.

import type { D97CharacterTunables } from "../../../content/d97/tunables";
import type { TilePoint } from "../../map/definition";
import type { Facing } from "../walker";
import type { CharacterAnimation } from "./resolve-recipe";

/** LPC sheets lay out one row per facing, in this order. */
export const FACING_ROWS: Readonly<Record<Facing, number>> = { up: 0, left: 1, down: 2, right: 3 };

/** Frame columns per sheet; walk's column 0 is the standing frame. */
export const ANIMATION_COLUMNS: Readonly<Record<CharacterAnimation, number>> = { walk: 9, idle: 2 };

/** LPC frames are 64×64 pixels. */
export const CHARACTER_FRAME_SIZE = 64;

/**
 * Idle frames for a layer without an idle sheet: in every facing row, its
 * walk sheet's standing frame (column 0) held for each idle column.
 */
export function standingIdleFrames<Frame>(walk: readonly (readonly Frame[])[]): Frame[][] {
  return walk.map((row) => {
    const standing = row[0];
    return standing === undefined ? [] : Array.from({ length: ANIMATION_COLUMNS.idle }, () => standing);
  });
}

/** The sheet column to show `seconds` into an animation. */
export function animationColumn(
  animation: CharacterAnimation,
  seconds: number,
  tunables: D97CharacterTunables,
): number {
  if (animation === "walk") {
    return 1 + (Math.floor(seconds * tunables.walkFramesPerSecond) % (ANIMATION_COLUMNS.walk - 1));
  }
  return Math.floor(seconds * tunables.idleFramesPerSecond) % ANIMATION_COLUMNS.idle;
}

/**
 * An idle character's facing: toward the player while the player stands
 * within range (on the dominant axis), otherwise down.
 */
export function idleFacing(
  character: TilePoint,
  player: { readonly x: number; readonly y: number },
  rangeTiles: number,
): Facing {
  const dx = player.x - character[0];
  const dy = player.y - character[1];
  if (Math.max(Math.abs(dx), Math.abs(dy)) > rangeTiles || (dx === 0 && dy === 0)) return "down";
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}
