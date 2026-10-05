import type { Phase, Side } from "../state/ids";
import { opponent, PHASES } from "../state/ids";
import type { StepContext } from "../steps/types";
import { designateBlockers, designateChallengers } from "./challenge";
import { drawDreamwell } from "./dreamwell";
import type { ChooseCardsPrompt } from "../prompts/types";
import { expireAt } from "./floating";
import { discardCard, drawCard, setEnergy } from "./resources";
import { emptyTurnLog } from "./turn-log";
import { endBattle } from "./victory";
import { charactersInPlay, instanceOf } from "./zones";

function enterPhase(ctx: StepContext, phase: Phase): void {
  const { state } = ctx;
  state.turn.phase = phase;
  ctx.emit({ kind: "phaseChanged", phase, active: state.turn.active });
  const active = state.turn.active;
  switch (phase) {
    case "dreamwell": {
      // Current ● resets to maximum at the start of the turn; the Dreamwell
      // draw then raises the maximum from round 2 on, and in every extra turn.
      const side = state.sides[active];
      setEnergy(ctx, active, side.maxEnergy, side.maxEnergy);
      if (state.turn.round >= 2 || state.turn.extra) {
        drawDreamwell(ctx, active);
      }
      return;
    }
    case "draw": {
      const skips =
        state.turn.turnNumber === 1 &&
        active === state.config.startingSide &&
        state.config.skipFirstDraw;
      if (!skips) {
        drawCard(ctx, active);
      }
      return;
    }
    case "day":
      expireAt(ctx, { at: "nextDay" });
      return;
    case "challenge":
      state.turn.challengeLane = 0;
      return;
    case "ending":
      discardToHandLimit(ctx);
      expireAt(ctx, { at: "endOfTurn" });
      clearExhaustion(ctx);
      return;
    default:
      return;
  }
}

/** Ending: the active side chooses cards to discard down to the hand limit (P6). */
function discardToHandLimit(ctx: StepContext): void {
  const { state } = ctx;
  const side = state.turn.active;
  const hand = state.sides[side].hand;
  const excess = hand.length - state.config.handLimit;
  if (excess <= 0) {
    return;
  }
  const chosen = ctx.choose<ChooseCardsPrompt>({
    kind: "chooseCards",
    side,
    purpose: { source: null, cardId: null, ability: null, role: "discardToHandLimit" },
    candidates: [...hand],
    min: excess,
    max: excess,
  });
  for (const card of chosen) {
    discardCard(ctx, side, card);
  }
}

/** Ending: every exhausted character in play, and each exhausted avatar, loses the exhausted status. */
function clearExhaustion(ctx: StepContext): void {
  for (const side of ["player", "enemy"] as const) {
    for (const id of charactersInPlay(ctx.state, side)) {
      instanceOf(ctx.state, id).status.exhausted = false;
    }
    const avatar = ctx.state.sides[side].avatar;
    if (avatar?.exhausted === true) {
      avatar.exhausted = false;
      ctx.emit({ kind: "avatarExhaustionChanged", side, exhausted: false });
    }
  }
}

function leavePhase(ctx: StepContext, phase: Phase): void {
  switch (phase) {
    case "day":
      designateChallengers(ctx);
      return;
    case "dusk":
      designateBlockers(ctx);
      return;
    case "challenge":
      ctx.state.turn.challengeLane = null;
      return;
    case "ending":
      // An "until end of turn" effect that began during Ending, after its
      // expiry step, ends as the turn ends.
      expireAt(ctx, { at: "endOfTurn" });
      return;
    default:
      return;
  }
}

/**
 * The bookkeeping as `side` begins a turn: its turn count, a fresh turn
 * log, and once-per-turn uses cleared.
 */
function resetForTurn(ctx: StepContext, side: Side): void {
  const { state } = ctx;
  state.turn.sideTurns[side] += 1;
  state.turnLog = emptyTurnLog();
  state.oncePerTurn = [];
}

/**
 * Starts the next turn. Pending extra turns come first, most recent first
 * (C8); otherwise the side after the last non-extra turn goes. A round ends
 * when the second side's non-extra turn ends, and the battle is a draw once
 * more than `turnLimit` rounds would begin (P11).
 */
export function beginNextTurn(ctx: StepContext): void {
  const { state } = ctx;
  const turn = state.turn;
  state.challenge = null;
  let next: Side;
  let extra: boolean;
  const pendingExtra = turn.extraTurns.pop();
  if (pendingExtra !== undefined) {
    next = pendingExtra;
    extra = true;
  } else {
    next = opponent(turn.lastNormal);
    extra = false;
    if (next === state.config.startingSide) {
      if (turn.round >= state.config.turnLimit) {
        endBattle(ctx, { kind: "draw", reason: "turnLimit" });
        return;
      }
      turn.round += 1;
    }
    turn.lastNormal = next;
  }
  turn.active = next;
  turn.extra = extra;
  turn.turnNumber += 1;
  resetForTurn(ctx, next);
  ctx.emit({
    kind: "turnStarted",
    side: next,
    round: turn.round,
    turnNumber: turn.turnNumber,
    extra,
  });
  // "Until your next turn" ends as that side's turn begins, extra turns included (C8).
  expireAt(ctx, { at: "turnStart", side: next });
  enterPhase(ctx, "dreamwell");
}

/** Leaves the current phase and enters the next, or starts the next turn after Ending. */
export function advancePhase(ctx: StepContext): void {
  const { state } = ctx;
  const current = state.turn.phase;
  leavePhase(ctx, current);
  if (current === "ending") {
    beginNextTurn(ctx);
    return;
  }
  const next = PHASES[PHASES.indexOf(current) + 1];
  if (next === undefined) {
    throw new Error(`No phase after ${current}`);
  }
  enterPhase(ctx, next);
}

/** Starts the battle's first turn. */
export function beginFirstTurn(ctx: StepContext): void {
  const { state } = ctx;
  state.turn.turnNumber = 1;
  resetForTurn(ctx, state.turn.active);
  ctx.emit({
    kind: "turnStarted",
    side: state.turn.active,
    round: 1,
    turnNumber: 1,
    extra: false,
  });
  enterPhase(ctx, "dreamwell");
}
