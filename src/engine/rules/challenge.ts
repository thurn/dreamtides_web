import type { InstanceId, Side } from "../state/ids";
import { FRONT_RANK_SIZE, opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import type { StepContext } from "../steps/types";
import { copiableCostOf } from "../continuous/characteristics";
import { gainPoints } from "./resources";
import { recordCharacterScored } from "./turn-log";
import { hasKeyword } from "./keywords";
import { effectiveSpark } from "./spark";
import { dissolve, instanceOf, slotOf } from "./zones";

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
  state.challenge = { challengers, blockers: {}, scoring: { scorers: [], settled: false } };
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
  delete challenge.unpairedBlockers;
  ctx.emit({ kind: "blockersDesignated", side: defending, blockers });
}

/** The characters holding the challenge roles in one front-rank lane. */
interface LaneRoles {
  readonly challenger: InstanceId;
  readonly blocker: InstanceId | null;
}

/**
 * The roles held now in one front-rank lane (rules § Challengers, Blockers,
 * and Scoring → Holding a role): the designated challenger now in the active
 * side's front rank at `lane`, and the designated blocker now directly
 * opposite it, or `null` when no challenger is there. Night movement
 * therefore re-pairs designated characters by position. The Challenge phase
 * resolves these pairs, and the challenger and blocker selectors read them.
 */
export function laneRoles(state: BattleState, lane: number): LaneRoles | null {
  const challenge = state.challenge;
  if (challenge === null || lane < 0 || lane >= FRONT_RANK_SIZE) {
    return null;
  }
  const active = state.turn.active;
  const challenger = state.sides[active].frontRank[lane] ?? null;
  if (challenger === null || !challenge.challengers.includes(challenger)) {
    return null;
  }
  const opposite = state.sides[opponent(active)].frontRank[lane] ?? null;
  const blocker =
    opposite !== null && (Object.values(challenge.blockers).includes(opposite) ||
      challenge.unpairedBlockers?.includes(opposite) === true)
      ? opposite
      : null;
  return { challenger, blocker };
}

/** The role `id` holds now in its front-rank lane's `laneRoles`, if any. */
export function challengeRoleOf(
  state: BattleState,
  id: InstanceId,
): "challenger" | "blocker" | null {
  const slot = slotOf(state, id);
  if (slot?.rank !== "front") {
    return null;
  }
  const roles = laneRoles(state, slot.index);
  if (roles?.challenger === id) {
    return "challenger";
  }
  return roles?.blocker === id ? "blocker" : null;
}

/** Captures positive scoring before subsequent reactions can move or change its character. */
function recordScorer(ctx: StepContext, challenger: InstanceId, points: number): void {
  const scoring = ctx.state.challenge?.scoring;
  if (points > 0 && scoring !== undefined && !scoring.settled && !scoring.scorers.some(entry => entry.instance === challenger)) {
    scoring.scorers.push({ instance: challenger, controller: instanceOf(ctx.state, challenger).controller });
  }
}

/** Settles each captured controller's group once, at the final lane's boundary. */
export function settleScoreGroups(ctx: StepContext): void {
  const scoring = ctx.state.challenge?.scoring;
  if (scoring === undefined || scoring.settled || ctx.state.result !== null) return;
  scoring.settled = true;
  for (const side of ["player", "enemy"] as const) {
    const count = scoring.scorers.filter(entry => entry.controller === side).length;
    if (count > 0) ctx.emit({ kind: "scoreGroup", side, count });
  }
}

/** Resolves one front-rank lane's `laneRoles`. */
export function resolveLane(ctx: StepContext, lane: number): void {
  const { state, catalog } = ctx;
  const roles = laneRoles(state, lane);
  if (roles === null) {
    return;
  }
  const { challenger, blocker } = roles;
  const active = state.turn.active;
  const defending: Side = opponent(active);
  const challengerSpark = effectiveSpark(state, catalog, challenger);
  if (blocker === null) {
    recordScorer(ctx, challenger, challengerSpark);
    recordCharacterScored(state, challenger, instanceOf(state, challenger).controller, challengerSpark);
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
  const challengerCause = { controller: instanceOf(state, challenger).controller, character: challenger, characterCost: copiableCostOf(state, catalog, challenger) };
  const blockerCause = { controller: instanceOf(state, blocker).controller, character: blocker, characterCost: copiableCostOf(state, catalog, blocker) };
  let challengerDissolves = challengerSpark <= blockerSpark;
  let blockerDissolves = blockerSpark <= challengerSpark;
  // Vengeful: a character that loses its challenge dissolves its opponent too.
  if (challengerDissolves && hasKeyword(state, catalog, challenger, "vengeful")) {
    blockerDissolves = true;
  }
  if (blockerDissolves && hasKeyword(state, catalog, blocker, "vengeful")) {
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
  recordScorer(ctx, challenger, scored);
  recordCharacterScored(state, challenger, instanceOf(state, challenger).controller, scored);
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
    dissolve(ctx, challenger, null, false, blockerCause);
  }
  if (blockerDissolves) {
    dissolve(ctx, blocker, null, false, challengerCause);
  }
}
