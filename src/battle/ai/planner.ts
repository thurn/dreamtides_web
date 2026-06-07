import { starterCardModels } from "./cards/index";
import type { AiTargetChoice } from "./cards/index";
import { CHARACTER_CARD_NUMBERS } from "./cards/card-numbers";
import { evaluate } from "./evaluate";
import { scoreAgainstOpponent, type OpponentMode } from "./opponent-model";
import { cloneForwardModel, type AiCard, type ForwardModel } from "./forward-model";
import {
  FRONT_RANK_SLOT_IDS,
  BACK_RANK_SLOT_IDS,
  type BattleAiChoiceTrace,
  type BattleAiDecisionStage,
  type BattlefieldSlotId,
  type FrontRankSlotId,
  type BackRankSlotId,
} from "../types";

/**
 * Staged beam-search planner with a deadline guard (`battle_ai.md`
 * §"The Planner"). It runs a receding-horizon search: it plans the whole
 * intended turn so look-ahead captures order-sensitive synergies (e.g. play
 * Nocturne Strummer before Wildflower Colossus so the Colossus evaluates with
 * its supporter present), but RETURNS ONLY THE SINGLE NEXT ACTION — the first
 * action of the best plan found — plus its trace. The caller applies that one
 * action and re-plans.
 */

// --- Public API -----------------------------------------------------------

export interface PlannedAction {
  stage: BattleAiDecisionStage;
  kind: "PLAY_CARD" | "MOVE_CARD" | "END_TURN";
  /** The card being played/moved (PLAY_CARD / MOVE_CARD). */
  self?: AiCard;
  /** Chosen targets for a targeted play (Flashpoint, Worlds Await, …). */
  targets?: AiTargetChoice | null;
  /** Destination slot for a MOVE_CARD or a play placement. */
  toSlot?: BattlefieldSlotId;
  trace: BattleAiChoiceTrace;
}

export interface PlannerOptions {
  /** Absolute deadline timestamp; abort beam expansion if approached. */
  deadlineMs: number;
  /** Beam width K (~8–16). */
  beamWidth: number;
  opponentMode: OpponentMode;
  /** Opponent-model sample cap. */
  sampleCap: number;
  /** INJECTED clock snapshot. `Date.now()` is never called (it throws here). */
  nowMs: number;
  /** Deterministic seed threaded to the opponent model. */
  rngSeed: number;
}

// --- Card classification --------------------------------------------------

function isCharacterCard(card: AiCard): boolean {
  return CHARACTER_CARD_NUMBERS.has(card.cardNumber);
}

// --- Internal action representation ---------------------------------------

/**
 * One concrete action in a partial plan. `self` and `toSlot` identify the card
 * and destination; `targets` carries event targeting. Identity is captured by
 * `battleCardId` so applying the action against a CLONE locates the same card.
 */
interface PlanAction {
  stage: BattleAiDecisionStage;
  kind: "PLAY_CARD" | "MOVE_CARD";
  card: AiCard;
  targets: AiTargetChoice | null;
  toSlot: BattlefieldSlotId | null;
  /** Hand index of the played card in the model the action was generated from. */
  sourceHandIndex: number | null;
  /** Reserve slot a MOVE_CARD pulls the card from. */
  sourceSlotId: BattlefieldSlotId | null;
}

interface BeamEntry {
  model: ForwardModel;
  /** The actions applied to reach `model`, in order. */
  actions: PlanAction[];
  /** Cached score of `model`. */
  score: number;
}

// --- Scoring --------------------------------------------------------------

/**
 * Whether the AI has any committed challenger — a deployed body that can act
 * this turn. When it does, scoring routes through the opponent-response model so
 * the plan accounts for the opponent's likely defense/removal; otherwise the
 * cheaper static {@link evaluate} is enough.
 */
function hasCommittedChallenger(model: ForwardModel): boolean {
  for (const slot of FRONT_RANK_SLOT_IDS) {
    const card = model.aiDeployed[slot];
    if (card !== null && card.canChallengeThisTurn) {
      return true;
    }
  }
  return false;
}

function scorePlan(model: ForwardModel, opts: PlannerOptions): number {
  if (hasCommittedChallenger(model)) {
    return scoreAgainstOpponent(model, opts.opponentMode, opts.sampleCap, opts.rngSeed);
  }
  return evaluate(model);
}

// --- Candidate generation -------------------------------------------------

/**
 * Applies a {@link PlanAction} to `model` (already a clone). Locates the card by
 * `battleCardId` so the action composes against any equivalent state, then
 * mutates via the card model (plays + triggers) or a reserve→deploy move.
 */
function applyAction(model: ForwardModel, action: PlanAction): void {
  if (action.kind === "PLAY_CARD") {
    const cardModel = starterCardModels.get(action.card.cardNumber);
    if (cardModel === undefined) {
      return;
    }
    // Re-locate the live card instance in the clone's hand by id.
    const live = model.aiHand.find((c) => c.battleCardId === action.card.battleCardId);
    const self = live ?? action.card;
    cardModel.play(model, self, action.targets);
    // `play` does NOT fire triggers; ▸Materialized fires immediately on entering
    // play (e.g. Circlewatch's Foresee), so the planner fires it here.
    cardModel.onMaterialized?.(model, self);
    return;
  }
  // MOVE_CARD: reserve → empty deploy slot.
  const fromSlot = action.sourceSlotId as BackRankSlotId | null;
  const toSlot = action.toSlot as FrontRankSlotId | null;
  if (fromSlot === null || toSlot === null) {
    return;
  }
  const card = model.aiReserve[fromSlot];
  if (card === null || card.battleCardId !== action.card.battleCardId) {
    // The card moved/changed in the clone; locate it by id across reserve.
    let found: BackRankSlotId | null = null;
    for (const slot of BACK_RANK_SLOT_IDS) {
      if (model.aiReserve[slot]?.battleCardId === action.card.battleCardId) {
        found = slot;
        break;
      }
    }
    if (found === null || model.aiDeployed[toSlot] !== null) {
      return;
    }
    model.aiDeployed[toSlot] = model.aiReserve[found];
    model.aiReserve[found] = null;
    return;
  }
  if (model.aiDeployed[toSlot] !== null) {
    return;
  }
  model.aiDeployed[toSlot] = card;
  model.aiReserve[fromSlot] = null;
}

function firstEmptyDeploySlot(model: ForwardModel): FrontRankSlotId | null {
  for (const slot of FRONT_RANK_SLOT_IDS) {
    if (model.aiDeployed[slot] === null) {
      return slot;
    }
  }
  return null;
}

/**
 * The reserve slot a character play lands in: the first empty slot, matching
 * {@link playCharacterToReserve}. Recording it on the action lets the driver
 * emit the body's `MOVE_CARD_TO_ZONE` to a concrete reserve destination.
 */
function firstEmptyReserveSlot(model: ForwardModel): BackRankSlotId | null {
  for (const slot of BACK_RANK_SLOT_IDS) {
    if (model.aiReserve[slot] === null) {
      return slot;
    }
  }
  return null;
}

/**
 * Generates every legal next action from `model`, tagged by stage. Legality is
 * mandatory: a `PLAY_CARD` is generated only when the card model's `canPlay` is
 * true; a `MOVE_CARD` only into an empty deploy slot from a ready reserve card.
 *
 * The staged order (`battle_ai.md` §"The Planner") is reflected by stage tags
 * and by the order actions are emitted: character plays, then repositions, then
 * non-character (event) plays. The beam ranks the resulting models by score, so
 * order-sensitive synergies (Minstrel before Colossus) surface naturally.
 */
function generateActions(model: ForwardModel): PlanAction[] {
  const actions: PlanAction[] = [];

  // Stage 1: character — play each affordable character from hand.
  model.aiHand.forEach((card, handIndex) => {
    if (!isCharacterCard(card)) {
      return;
    }
    const cardModel = starterCardModels.get(card.cardNumber);
    if (cardModel === undefined || !cardModel.canPlay(model, card)) {
      return;
    }
    actions.push({
      stage: "character",
      kind: "PLAY_CARD",
      card,
      targets: cardModel.chooseTargets(model, card),
      // The character body materializes into the first empty reserve slot
      // (see `playCharacterToReserve`). Record it so the driver moves the
      // card out of hand rather than only paying its energy.
      toSlot: firstEmptyReserveSlot(model),
      sourceHandIndex: handIndex,
      sourceSlotId: null,
    });
  });

  // Stage 2: reposition — push a ready reserve character into an empty deploy
  // slot so it becomes a challenger. Only the FIRST empty deploy slot is offered
  // per ready card; deploy slots are interchangeable for scoring, so enumerating
  // all of them only multiplies the branching factor without changing value.
  const targetDeploySlot = firstEmptyDeploySlot(model);
  if (targetDeploySlot !== null) {
    for (const reserveSlot of BACK_RANK_SLOT_IDS) {
      const card = model.aiReserve[reserveSlot];
      if (card === null || !card.canChallengeThisTurn) {
        continue;
      }
      actions.push({
        stage: "reposition",
        kind: "MOVE_CARD",
        card,
        targets: null,
        toSlot: targetDeploySlot,
        sourceHandIndex: null,
        sourceSlotId: reserveSlot,
      });
    }
  }

  // Stage 3: nonCharacter — play each legal event where it scores best.
  model.aiHand.forEach((card, handIndex) => {
    if (isCharacterCard(card)) {
      return;
    }
    const cardModel = starterCardModels.get(card.cardNumber);
    if (cardModel === undefined || !cardModel.canPlay(model, card)) {
      return;
    }
    actions.push({
      stage: "nonCharacter",
      kind: "PLAY_CARD",
      card,
      targets: cardModel.chooseTargets(model, card),
      toSlot: null,
      sourceHandIndex: handIndex,
      sourceSlotId: null,
    });
  });

  return actions;
}

// --- Beam search ----------------------------------------------------------

/**
 * Stable tie-break key for a beam expansion, ensuring deterministic selection
 * among equal-scoring candidates. Orders by stage, kind, card number, source,
 * then destination so identical inputs always pick the same action.
 */
const STAGE_ORDER: Record<BattleAiDecisionStage, number> = {
  character: 0,
  reposition: 1,
  nonCharacter: 2,
  endTurn: 3,
};

function actionSortKey(action: PlanAction): string {
  return [
    STAGE_ORDER[action.stage],
    action.kind,
    action.card.cardNumber,
    action.card.battleCardId,
    action.sourceSlotId ?? "",
    action.toSlot ?? "",
  ].join("|");
}

/**
 * Runs the staged beam search and returns the best COMPLETE plan found (its
 * action list, possibly empty).
 *
 * Every plan node — including the empty root — is itself a complete plan, in the
 * sense that the AI could stop there and pass; a node's value is simply its
 * model score ({@link scorePlan}). The search therefore tracks the
 * highest-scoring node encountered anywhere in the tree (the root/END_TURN
 * baseline included) and returns its action list.
 *
 * Expansion is a real bounded beam, NOT greedy: a partial plan is expanded by
 * EVERY legal next action, with no "strictly improving" gate. A momentarily
 * neutral-or-worse setup play (e.g. dropping Nocturne Strummer into the reserve)
 * is allowed to remain in the beam so a later step (repositioning Meadowforged
 * Colossus into a slot the Minstrel supports) can pay off within the same turn.
 * A line that genuinely goes nowhere still loses to the root baseline, so the
 * planner does not over-develop into losing positions.
 *
 * Work is bounded by `beamWidth` (top-K kept each round), the {@link MAX_DEPTH}
 * safety cap, and the deadline guard. The per-node action set is bounded by
 * finite energy and board space: each play spends energy and a reserve slot,
 * each reposition fills a deploy slot, and draw events (Glimpse, Sign of Arrival)
 * only add cards a later node can play if it can still pay for them. Combined
 * with the MAX_DEPTH cap the search terminates well before the cap.
 */
function searchBestPlan(rootModel: ForwardModel, opts: PlannerOptions): PlanAction[] {
  const rootScore = scorePlan(rootModel, opts);
  const root: BeamEntry = { model: rootModel, actions: [], score: rootScore };

  // Best COMPLETE plan found so far. The root (do nothing → END_TURN) is itself
  // a complete plan and the baseline every line must beat to be proposed.
  let best: BeamEntry = root;

  // Deadline already passed at entry: return the empty plan immediately.
  if (deadlineApproached(opts)) {
    return best.actions;
  }

  let beam: BeamEntry[] = [root];

  // Each iteration extends every partial plan in the beam by one action. The
  // depth is bounded by available energy/board space, so the loop always
  // terminates; the explicit cap is a safety belt.
  const MAX_DEPTH = 16;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    if (deadlineApproached(opts)) {
      break;
    }

    const expansions: BeamEntry[] = [];

    for (const entry of beam) {
      const candidates = generateActions(entry.model);
      // Deterministic candidate order.
      candidates.sort((a, b) => actionSortKey(a).localeCompare(actionSortKey(b)));

      // A branch with no legal action is a dead end: it contributes no
      // expansions and simply drops out of the beam. Its own score was already
      // folded into `best` when the node was created.
      for (const action of candidates) {
        const nextModel = cloneForwardModel(entry.model);
        applyAction(nextModel, action);
        const score = scorePlan(nextModel, opts);
        // Keep EVERY legal expansion — non-improving steps included — so a later
        // payoff in the same turn can still be discovered.
        const child: BeamEntry = { model: nextModel, actions: [...entry.actions, action], score };
        expansions.push(child);
        // Track the best complete plan across the whole search. Tie-break on the
        // plan's action path so identical inputs pick the same plan.
        if (
          score > best.score ||
          (score === best.score && planSortKey(child).localeCompare(planSortKey(best)) < 0)
        ) {
          best = child;
        }
      }
    }

    // Whole beam exhausted (every branch was a dead end): nothing left to expand.
    if (expansions.length === 0) {
      break;
    }

    // Keep the top-K expansions, breaking ties deterministically by the plan's
    // action path so identical inputs always retain the same beam.
    expansions.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return planSortKey(a).localeCompare(planSortKey(b));
    });
    beam = expansions.slice(0, Math.max(1, opts.beamWidth));
  }

  return best.actions;
}

function planSortKey(entry: BeamEntry): string {
  return entry.actions.map(actionSortKey).join(">");
}

// --- Deadline guard -------------------------------------------------------

/**
 * Whether the injected clock has reached the deadline. Because `nowMs` is a
 * single fixed snapshot, this is effectively `nowMs >= deadlineMs`; the code is
 * structured so a real wall-clock could be substituted later.
 */
function deadlineApproached(opts: PlannerOptions): boolean {
  return opts.nowMs >= opts.deadlineMs;
}

// --- Trace + result assembly ----------------------------------------------

function endTurnAction(): PlannedAction {
  return {
    stage: "endTurn",
    kind: "END_TURN",
    targets: null,
    trace: {
      stage: "endTurn",
      choice: "END_TURN",
      battleCardId: null,
      cardName: null,
      sourceHandIndex: null,
      sourceSlotId: null,
      targetSlotId: null,
      heuristicScoreBefore: null,
      heuristicScoreAfter: null,
    },
  };
}

/**
 * Builds the returned {@link PlannedAction} for the FIRST action of the best
 * plan, populating the existing {@link BattleAiChoiceTrace} fields.
 * `heuristicScoreBefore` is the score of the root model; `heuristicScoreAfter`
 * is the score after applying just this first action.
 */
function buildPlannedAction(
  rootModel: ForwardModel,
  action: PlanAction,
  opts: PlannerOptions,
): PlannedAction {
  const scoreBefore = scorePlan(rootModel, opts);
  const afterModel = cloneForwardModel(rootModel);
  applyAction(afterModel, action);
  const scoreAfter = scorePlan(afterModel, opts);

  const targetSlotId: BattlefieldSlotId | null = action.toSlot;

  return {
    stage: action.stage,
    kind: action.kind,
    self: action.card,
    targets: action.targets,
    toSlot: action.toSlot ?? undefined,
    trace: {
      stage: action.stage,
      choice: action.kind,
      battleCardId: action.card.battleCardId,
      cardName: action.card.name,
      sourceHandIndex: action.sourceHandIndex,
      sourceSlotId: action.sourceSlotId,
      targetSlotId,
      heuristicScoreBefore: scoreBefore,
      heuristicScoreAfter: scoreAfter,
    },
  };
}

// --- Entry point ----------------------------------------------------------

/**
 * Plans the AI's intended turn against `model` and returns ONLY the first action
 * of the best plan (receding horizon). Always returns a valid action and never
 * throws: a passed deadline or an empty best plan yields `END_TURN`.
 */
export function planNextAction(model: ForwardModel, opts: PlannerOptions): PlannedAction {
  // Deadline guard: if the injected clock has already reached the deadline,
  // short-circuit to END_TURN before any expensive expansion. (No partial plan
  // has been committed at this point, so END_TURN is the best-so-far.)
  if (deadlineApproached(opts)) {
    return endTurnAction();
  }

  const plan = searchBestPlan(model, opts);
  if (plan.length === 0) {
    return endTurnAction();
  }
  return buildPlannedAction(model, plan[0], opts);
}
