import { starterCardModels } from "./cards/index";
import type { AiTargetChoice } from "./cards/index";
import { CHARACTER_CARD_NUMBERS } from "./cards/card-numbers";
import { evaluate } from "./evaluate";
import { scoreAgainstOpponent, type OpponentMode } from "./opponent-model";
import type {
  AiEvaluationWeights,
  AiOpponentModelTuning,
} from "../../types/opponents-data";
import {
  centerPreferredEmptyModelSlot,
  cloneForwardModel,
  type AiCard,
  type ForwardModel,
} from "./forward-model";
import {
  BACK_RANK_SLOTS,
  FRONT_RANK_SLOTS,
  backRankSlotId,
  frontRankSlotId,
  isBackRankSlotId,
  isFrontRankSlotId,
  rankSlotIds,
  type BattleAiChoiceTrace,
  type BattleAiDecisionStage,
  type BattlefieldSlotId,
  type FrontRankSlotId,
  type BackRankSlotId,
} from "../types";
import type { AiDifficultyPresetId } from "../../types/identifiers";
import { parseAiActionKey, type AiActionKey } from "../../types/identifiers";

/**
 * Staged beam-search planner with a deadline guard (`battle_ai.md`
 * §"The Planner"). It runs a receding-horizon search: it plans the whole
 * intended turn so look-ahead captures order-sensitive synergies (e.g. play
 * Nocturne Strummer before Rusted Colossus so the Colossus evaluates with
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
  /**
   * Optional deterministic cap on explored child states.  Tutorial automation
   * uses this instead of a wall-clock budget so every client chooses the same
   * action from the same confirmed fold.
   */
  expansionBudget?: number;
  scoreToWin: number;
  maxSearchDepth?: number;
  evaluation: AiEvaluationWeights;
  opponentModel: AiOpponentModelTuning;
  aiPresetId?: AiDifficultyPresetId;
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
  /** Back-rank slot a MOVE_CARD pulls the card from. */
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
 * Whether the AI has any committed challenger — a front-rank body that can act
 * this turn. When it does, scoring routes through the opponent-response model so
 * the plan accounts for the opponent's likely blocking/removal; otherwise the
 * cheaper static {@link evaluate} is enough.
 */
function hasCommittedChallenger(model: ForwardModel): boolean {
  for (const slot of rankSlotIds(model.aiFrontRank)) {
    const card = model.aiFrontRank[slot];
    if (card !== null && card.canChallengeThisTurn) {
      return true;
    }
  }
  return false;
}

function scorePlan(model: ForwardModel, opts: PlannerOptions): number {
  if (hasCommittedChallenger(model)) {
    return scoreAgainstOpponent(
      model,
      opts.opponentMode,
      opts.sampleCap,
      opts.rngSeed,
      opts.scoreToWin,
      opts.evaluation,
      opts.opponentModel,
    );
  }
  return evaluate(model, opts.scoreToWin, opts.evaluation);
}

// --- Candidate generation -------------------------------------------------

/**
 * Applies a {@link PlanAction} to `model` (already a clone). Locates the card by
 * `battleCardId` so the action composes against any equivalent state, then
 * mutates via the card model or a back-rank→front-rank move.
 */
function applyAction(model: ForwardModel, action: PlanAction): void {
  if (action.kind === "PLAY_CARD") {
    const cardModel = starterCardModels.get(action.card.cardNumber);
    if (cardModel === undefined) {
      return;
    }
    // Re-locate the live card instance in the clone's hand by id.
    const live = model.aiHand.find(
      (c) => c.battleCardId === action.card.battleCardId,
    );
    const self = live ?? action.card;
    cardModel.play(model, self, action.targets);
    return;
  }
  // MOVE_CARD: back rank → empty front-rank slot.
  const fromSlot = action.sourceSlotId;
  const toSlot = action.toSlot;
  if (
    fromSlot === null ||
    !isBackRankSlotId(fromSlot) ||
    toSlot === null ||
    !isFrontRankSlotId(toSlot)
  ) {
    return;
  }
  const card = model.aiBackRank[fromSlot] ?? null;
  if (card === null || card.battleCardId !== action.card.battleCardId) {
    // The card moved/changed in the clone; locate it by id across the back rank.
    let found: BackRankSlotId | null = null;
    for (const slot of rankSlotIds(model.aiBackRank)) {
      if (model.aiBackRank[slot]?.battleCardId === action.card.battleCardId) {
        found = slot;
        break;
      }
    }
    if (found === null || (model.aiFrontRank[toSlot] ?? null) !== null) {
      return;
    }
    model.aiFrontRank[toSlot] = model.aiBackRank[found];
    model.aiBackRank[found] = null;
    return;
  }
  if ((model.aiFrontRank[toSlot] ?? null) !== null) {
    return;
  }
  model.aiFrontRank[toSlot] = card;
  model.aiBackRank[fromSlot] = null;
}

/** The empty front-rank slot nearest the center, or a fresh slot when every
 * materialized position is occupied. */
function centerPreferredFrontRankSlot(model: ForwardModel): FrontRankSlotId {
  return centerPreferredEmptyModelSlot(
    model.aiFrontRank,
    frontRankSlotId,
    (FRONT_RANK_SLOTS - 1) / 2,
  );
}

/**
 * The back-rank slot a character play lands in: the empty position nearest the
 * center (or a fresh one when the rank is full), matching
 * {@link playCharacterToBackRank}. Recording it on the action lets the driver
 * emit the body's `MOVE_CARD_TO_ZONE` to a concrete back-rank destination.
 */
function centerPreferredBackRankSlot(model: ForwardModel): BackRankSlotId {
  return centerPreferredEmptyModelSlot(
    model.aiBackRank,
    backRankSlotId,
    (BACK_RANK_SLOTS - 1) / 2,
  );
}

/**
 * Generates every legal next action from `model`, tagged by stage. Legality is
 * mandatory: a `PLAY_CARD` is generated only when the card model's `canPlay` is
 * true; a `MOVE_CARD` only into an empty front-rank slot from a ready back-rank card.
 *
 * The staged order (`battle_ai.md` §"The Planner") is reflected by stage tags
 * and by the order actions are emitted: character plays, then repositions, then
 * non-character (event) plays. The beam ranks the resulting models by score, so
 * order-sensitive synergies (Nocturne Strummer before Rusted Colossus)
 * surface naturally.
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
      // The character body materializes near the center of the back rank
      // (see `playCharacterToBackRank`). Record it so the driver moves the
      // card out of hand rather than only paying its energy.
      toSlot: centerPreferredBackRankSlot(model),
      sourceHandIndex: handIndex,
      sourceSlotId: null,
    });
  });

  // Stage 2: reposition — push a ready back-rank character into an empty
  // front-rank slot so it becomes a challenger. Only the center-preferred empty
  // front-rank slot is offered per ready card; front-rank slots are
  // interchangeable for scoring, so enumerating all of them only multiplies the
  // branching factor without changing value.
  const targetFrontRankSlot = centerPreferredFrontRankSlot(model);
  for (const backRankSlot of rankSlotIds(model.aiBackRank)) {
    const card = model.aiBackRank[backRankSlot];
    if (card === null || !card.canChallengeThisTurn) {
      continue;
    }
    actions.push({
      stage: "reposition",
      kind: "MOVE_CARD",
      card,
      targets: null,
      toSlot: targetFrontRankSlot,
      sourceHandIndex: null,
      sourceSlotId: backRankSlot,
    });
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

function actionSortKey(action: PlanAction): AiActionKey {
  return parseAiActionKey(
    [
      STAGE_ORDER[action.stage],
      action.kind,
      action.card.cardNumber,
      action.card.battleCardId,
      action.sourceSlotId ?? "",
      action.toSlot ?? "",
    ].join("|"),
  );
}

/**
 * Safety cap on beam-search depth. The depth is already bounded by available
 * energy and board space (each play spends energy and a back-rank slot, each
 * reposition fills a front-rank slot), so the search terminates well before
 * this; the cap is a belt-and-suspenders guard.
 */

/**
 * Expands every partial plan in `beam` by one action and returns the next beam
 * (the top-`beamWidth` expansions) together with the best complete plan seen so
 * far (`best`, threaded in and updated). `done` is true when the whole beam was
 * a dead end and the caller should stop.
 *
 * This is the single unit of beam-search work, shared verbatim by the
 * synchronous {@link searchBestPlan} and the cooperative
 * {@link searchBestPlanAsync} so both explore an identical tree and pick an
 * identical action — the async variant only differs by yielding the main thread
 * between rounds.
 *
 * Expansion is a real bounded beam, NOT greedy: a partial plan is expanded by
 * EVERY legal next action, with no "strictly improving" gate. A momentarily
 * neutral-or-worse setup play (e.g. dropping Nocturne Strummer into the back rank)
 * is allowed to remain in the beam so a later step (repositioning Wildflower
 * Colossus into a slot the Nocturne Strummer supports) can pay off within the
 * same turn. A line that genuinely goes nowhere still loses to the root
 * baseline, so the planner does not over-develop into losing positions.
 */
function expandBeamRound(
  beam: BeamEntry[],
  best: BeamEntry,
  opts: PlannerOptions,
  remainingExpansions: number,
): { beam: BeamEntry[]; best: BeamEntry; done: boolean; expansions: number } {
  let nextBest = best;
  const expansions: BeamEntry[] = [];
  let expansionCount = 0;

  for (const entry of beam) {
    const candidates = generateActions(entry.model);
    // Deterministic candidate order.
    candidates.sort((a, b) => actionSortKey(a).localeCompare(actionSortKey(b)));

    // A branch with no legal action is a dead end: it contributes no expansions
    // and simply drops out of the beam. Its own score was already folded into
    // `best` when the node was created.
    for (const action of candidates) {
      if (expansionCount >= remainingExpansions) {
        return {
          beam: expansions.length === 0 ? beam : keepBestBeam(expansions, opts),
          best: nextBest,
          done: true,
          expansions: expansionCount,
        };
      }
      const nextModel = cloneForwardModel(entry.model);
      applyAction(nextModel, action);
      const score = scorePlan(nextModel, opts);
      // Keep EVERY legal expansion — non-improving steps included — so a later
      // payoff in the same turn can still be discovered.
      const child: BeamEntry = {
        model: nextModel,
        actions: [...entry.actions, action],
        score,
      };
      expansions.push(child);
      expansionCount += 1;
      // Track the best complete plan across the whole search. Tie-break on the
      // plan's action path so identical inputs pick the same plan.
      if (
        score > nextBest.score ||
        (score === nextBest.score &&
          planSortKey(child).localeCompare(planSortKey(nextBest)) < 0)
      ) {
        nextBest = child;
      }
    }
  }

  // Whole beam exhausted (every branch was a dead end): nothing left to expand.
  if (expansions.length === 0) {
    return { beam, best: nextBest, done: true, expansions: expansionCount };
  }

  // Keep the top-K expansions, breaking ties deterministically by the plan's
  // action path so identical inputs always retain the same beam.
  return {
    beam: keepBestBeam(expansions, opts),
    best: nextBest,
    done: false,
    expansions: expansionCount,
  };
}

function keepBestBeam(
  expansions: BeamEntry[],
  opts: PlannerOptions,
): BeamEntry[] {
  expansions.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return planSortKey(a).localeCompare(planSortKey(b));
  });
  return expansions.slice(0, Math.max(1, opts.beamWidth));
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
 */
function searchBestPlan(
  rootModel: ForwardModel,
  opts: PlannerOptions,
): PlanAction[] {
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
  let expansionsRemaining = opts.expansionBudget ?? Number.POSITIVE_INFINITY;

  const maxDepth = opts.maxSearchDepth ?? 16;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (deadlineApproached(opts) || expansionsRemaining <= 0) {
      break;
    }
    const round = expandBeamRound(beam, best, opts, expansionsRemaining);
    best = round.best;
    expansionsRemaining -= round.expansions;
    if (round.done) {
      break;
    }
    beam = round.beam;
  }

  return best.actions;
}

/**
 * Cooperative variant of {@link searchBestPlan}: it explores the IDENTICAL tree
 * — same rounds, same beam, same tie-breaks — but `await`s `yieldFn` between
 * beam rounds so the browser can paint a frame and process input mid-search.
 * Keeping the AI's heavy planning off a single uninterrupted task is what keeps
 * the battle UI responsive during the AI's turn. The chosen action matches
 * {@link searchBestPlan} exactly; only the scheduling differs.
 */
async function searchBestPlanAsync(
  rootModel: ForwardModel,
  opts: PlannerOptions,
  yieldFn: () => Promise<void>,
): Promise<PlanAction[]> {
  const rootScore = scorePlan(rootModel, opts);
  const root: BeamEntry = { model: rootModel, actions: [], score: rootScore };
  let best: BeamEntry = root;

  if (deadlineApproached(opts)) {
    return best.actions;
  }

  let beam: BeamEntry[] = [root];
  let expansionsRemaining = opts.expansionBudget ?? Number.POSITIVE_INFINITY;

  const maxDepth = opts.maxSearchDepth ?? 16;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    // Yield before each round after the first so the main thread is released
    // between rounds rather than blocked for the whole search.
    if (depth > 0) {
      await yieldFn();
    }
    if (deadlineApproached(opts) || expansionsRemaining <= 0) {
      break;
    }
    const round = expandBeamRound(beam, best, opts, expansionsRemaining);
    best = round.best;
    expansionsRemaining -= round.expansions;
    if (round.done) {
      break;
    }
    beam = round.beam;
  }

  return best.actions;
}

function planSortKey(entry: BeamEntry): AiActionKey {
  return parseAiActionKey(entry.actions.map(actionSortKey).join(">"));
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

function endTurnAction(aiPresetId?: AiDifficultyPresetId): PlannedAction {
  return {
    stage: "endTurn",
    kind: "END_TURN",
    targets: null,
    trace: {
      ...(aiPresetId === undefined ? {} : { aiPresetId }),
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
      ...(opts.aiPresetId === undefined ? {} : { aiPresetId: opts.aiPresetId }),
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
export function planNextAction(
  model: ForwardModel,
  opts: PlannerOptions,
): PlannedAction {
  // Deadline guard: if the injected clock has already reached the deadline,
  // short-circuit to END_TURN before any expensive expansion. (No partial plan
  // has been committed at this point, so END_TURN is the best-so-far.)
  if (deadlineApproached(opts)) {
    return endTurnAction(opts.aiPresetId);
  }

  const plan = searchBestPlan(model, opts);
  if (plan.length === 0) {
    return endTurnAction(opts.aiPresetId);
  }
  return buildPlannedAction(model, plan[0], opts);
}

/**
 * Cooperative variant of {@link planNextAction}: identical result, but the beam
 * search yields to the event loop (`yieldFn`) between rounds so the AI's turn
 * does not freeze the main thread. The hook drives the AI through this variant;
 * the synchronous {@link planNextAction} remains for tests and any non-UI caller.
 */
export async function planNextActionAsync(
  model: ForwardModel,
  opts: PlannerOptions,
  yieldFn: () => Promise<void>,
): Promise<PlannedAction> {
  if (deadlineApproached(opts)) {
    return endTurnAction(opts.aiPresetId);
  }

  const plan = await searchBestPlanAsync(model, opts, yieldFn);
  if (plan.length === 0) {
    return endTurnAction(opts.aiPresetId);
  }
  return buildPlannedAction(model, plan[0], opts);
}
