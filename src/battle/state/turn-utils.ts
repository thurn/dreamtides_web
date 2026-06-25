import type { BattleMutableState, BattleSide } from "../types";

/**
 * Pure helper that predicts the side/turnNumber pair that the next
 * start-of-turn belongs to. The note editor uses it to compute the
 * `atStartOfTurn` expiry for a freshly created card note: a note created on
 * the active side expires the moment that side hands off, so the relevant
 * pair is the opposing side and — when the enemy is finishing its turn — the
 * incremented turn number.
 */
export function nextStartOfTurnPair(
  state: Pick<BattleMutableState, "activeSide" | "turnNumber">,
): {
  side: BattleSide;
  turnNumber: number;
} {
  const endingSide = state.activeSide;
  const side: BattleSide = endingSide === "player" ? "enemy" : "player";
  const turnNumber = state.turnNumber + (endingSide === "enemy" ? 1 : 0);
  return { side, turnNumber };
}

/**
 * Whether the side entering its turn draws a card during the start-of-turn Draw
 * phase. The single source of truth for the opening-turn draw rule — every draw
 * path (handoff planner, basic automation, the manual AI-mode handoff in
 * `PlayableBattleScreen`) MUST route through this so the rule cannot drift.
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
