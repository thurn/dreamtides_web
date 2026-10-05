import type { InstanceId, Side } from "../state/ids";
import { FRONT_RANK_SIZE, opponent } from "../state/ids";
import type { StepContext } from "../steps/types";
import { gainPoints } from "./resources";
import { effectiveSpark } from "./spark";
import { dissolve, instanceOf } from "./zones";

/**
 * End of Day: the active side's front-rank characters that are not
 * exhausted become challengers (rules § Challengers, Blockers, and Scoring).
 */
export function designateChallengers(ctx: StepContext): void {
  const { state } = ctx;
  const side = state.turn.active;
  const challengers = state.sides[side].frontRank.filter(
    (id): id is InstanceId => id !== null && !instanceOf(state, id).status.exhausted,
  );
  state.challenge = { challengers, blockers: {} };
  ctx.emit({ kind: "challengersDesignated", side, challengers });
}

/**
 * End of Dusk: each opposing front-rank character directly opposite a
 * challenger, and not exhausted, becomes that challenger's blocker.
 */
export function designateBlockers(ctx: StepContext): void {
  const { state } = ctx;
  const challenge = state.challenge;
  if (challenge === null) {
    return;
  }
  const active = state.turn.active;
  const defending = opponent(active);
  const blockers: Record<InstanceId, InstanceId> = {};
  for (const challenger of challenge.challengers) {
    const lane = state.sides[active].frontRank.indexOf(challenger);
    if (lane < 0) {
      continue;
    }
    const blocker = state.sides[defending].frontRank[lane] ?? null;
    if (blocker !== null && !instanceOf(state, blocker).status.exhausted) {
      blockers[challenger] = blocker;
    }
  }
  challenge.blockers = blockers;
  ctx.emit({ kind: "blockersDesignated", side: defending, blockers });
}

function hasKeyword(ctx: StepContext, id: InstanceId, keyword: "vengeful"): boolean {
  return ctx.catalog.card(instanceOf(ctx.state, id).cardId).keywords.includes(keyword);
}

/**
 * Resolves one front-rank lane. The challenger is the designated challenger
 * now in this lane; the blocker is a designated blocker now opposite it.
 * Night movement therefore re-pairs designated characters by position.
 */
export function resolveLane(ctx: StepContext, lane: number): void {
  const { state, catalog } = ctx;
  const challenge = state.challenge;
  if (challenge === null || lane < 0 || lane >= FRONT_RANK_SIZE) {
    return;
  }
  const active = state.turn.active;
  const defending: Side = opponent(active);
  const challenger = state.sides[active].frontRank[lane] ?? null;
  if (challenger === null || !challenge.challengers.includes(challenger)) {
    return;
  }
  const opposite = state.sides[defending].frontRank[lane] ?? null;
  const blocker =
    opposite !== null && Object.values(challenge.blockers).includes(opposite)
      ? opposite
      : null;
  const challengerSpark = effectiveSpark(state, catalog, challenger);
  if (blocker === null) {
    gainPoints(ctx, active, challengerSpark, "challenge");
    ctx.emit({
      kind: "laneResolved",
      lane,
      challenger,
      blocker: null,
      challengerSpark,
      blockerSpark: 0,
      winner: null,
      scored: challengerSpark,
    });
    return;
  }
  const blockerSpark = effectiveSpark(state, catalog, blocker);
  let challengerDissolves = challengerSpark <= blockerSpark;
  let blockerDissolves = blockerSpark <= challengerSpark;
  // Vengeful: a character that loses its challenge dissolves its opponent too.
  if (challengerDissolves && hasKeyword(ctx, challenger, "vengeful")) {
    blockerDissolves = true;
  }
  if (blockerDissolves && hasKeyword(ctx, blocker, "vengeful")) {
    challengerDissolves = true;
  }
  const scored =
    blockerDissolves && !challengerDissolves ? challengerSpark - blockerSpark : 0;
  const winner =
    blockerDissolves && !challengerDissolves
      ? active
      : challengerDissolves && !blockerDissolves
        ? defending
        : null;
  gainPoints(ctx, active, scored, "challenge");
  ctx.emit({
    kind: "laneResolved",
    lane,
    challenger,
    blocker,
    challengerSpark,
    blockerSpark,
    winner,
    scored,
  });
  if (challengerDissolves) {
    dissolve(ctx, challenger);
  }
  if (blockerDissolves) {
    dissolve(ctx, blocker);
  }
}
