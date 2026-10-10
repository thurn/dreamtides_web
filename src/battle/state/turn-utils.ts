// tutorial-only until Phase 6

import type { BattleSide } from "../types";

/**
 * Whether the side entering its turn draws a card during the start-of-turn Draw
 * phase. The single source of truth for the opening-turn draw rule — every draw
 * path (the handoff planner and basic automation) MUST route through this so
 * the rule cannot drift.
 *
 * Only the first player skips their opening Draw (rules §Battle start: "The
 * first player's first turn skips the Draw phase"). The first player is the side
 * that begins the battle active — `"player"` (see `createInitialState`), which
 * is what `BattleInit.playerDrawSkipsTurnOne` records.
 *
 * The subtlety this guards against: a player→enemy handoff KEEPS `turnNumber` at
 * 1 — only enemy→player increments it (see `nextStartOfTurnPair`). So the
 * enemy's first turn also carries `turnNumber === 1`. Gating the draw on
 * `turnNumber` alone therefore wrongly skips the SECOND player's opening draw,
 * leaving them a card short. The incoming side must be checked too.
 */
export function drawsAtStartOfTurn(
  incomingSide: BattleSide,
  turnNumber: number,
): boolean {
  return !(incomingSide === "player" && turnNumber === 1);
}

/** Dreamwell draws begin in round 2 for both players. */
export function drawsDreamwellCardAtStartOfTurn(turnNumber: number): boolean {
  return turnNumber >= 2;
}
