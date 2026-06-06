import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forwardModelFromState, type ForwardModel } from "./forward-model";
import { planDefense } from "./defense";
import { planNextAction, type PlannedAction, type PlannerOptions } from "./planner";
import { AI_DIFFICULTY_V1 } from "./difficulty";
import { buildTrace } from "./trace";
import { actionToCommands } from "./driver";
import { buildSupportContribution } from "./cards/support-contribution";
import { resolveJudgment } from "../engine/judgment";
import { planHandoff } from "../engine/handoff";
import type { BattleCommand, BattleDebugEdit } from "../debug/commands";
import {
  DEPLOY_SLOT_IDS,
  RESERVE_SLOT_IDS,
  type BattleAiChoiceTrace,
  type BattleMutableState,
  type BattleReducerState,
  type BattleSide,
} from "../types";

/**
 * A held AI proposal: the plain-language description, the enriched trace, and
 * the exact commands `approve()` will dispatch. The proposal is computed but
 * NEVER applied on its own — only the human-triggered `approve()` dispatches.
 */
export interface AiProposal {
  kind: "action" | "endTurn";
  /** Plain-language description, from the trace rationale. */
  description: string;
  trace: BattleAiChoiceTrace | null;
  /** The commands `approve()` dispatches, in order. */
  commands: BattleCommand[];
}

/** Planning budget in ms past the snapshot clock. */
const PLAN_BUDGET_MS = 100;

/** Defaults for the win/turn/energy caps when the init is unavailable. */
const DEFAULT_SCORE_TO_WIN = 25;
const DEFAULT_TURN_LIMIT = 50;
const DEFAULT_MAX_ENERGY_CAP = 10;

/** Worlds Await (#519) grants +3✦ to the chosen ally. */
const DISTANT_WORLDS_CARD_NUMBER = 519;
const DISTANT_WORLDS_SPARK_BONUS = 3;

interface BattleCapsInput {
  scoreToWin?: number;
  turnLimit?: number;
  maxEnergyCap?: number;
}

export interface UseBattleAiArgs {
  reducerState: BattleReducerState;
  dispatch: (action: { type: "APPLY_COMMAND"; command: BattleCommand }) => void;
  enabled: boolean;
  /** The side the AI controls (e.g. "enemy"). */
  aiSide: BattleSide;
  /** Optional win/turn/energy caps; defaults to 25/50/10. */
  caps?: BattleCapsInput;
}

export interface UseBattleAiResult {
  proposal: AiProposal | null;
  approve: () => void;
  reject: () => void;
  endAiTurn: () => void;
}

/**
 * Drives the AI's turn as an APPROVAL LOOP, never as an autonomous mutator.
 *
 * THE SAFETY CONTRACT: the hook computes a {@link AiProposal} and holds it.
 * ONLY the human-triggered {@link UseBattleAiResult.approve} dispatches. Mounting
 * the hook, recomputing a proposal, {@link UseBattleAiResult.reject}, and
 * {@link UseBattleAiResult.endAiTurn} dispatch NOTHING.
 *
 * The proposal is recomputed (via `useMemo`) whenever the live mutable state
 * changes (keyed by `reducerState.transitionId`), whenever an action is rejected
 * (the exclusion set grows), and whenever the human forces an end-of-turn. When
 * `approve()` dispatches, the resulting state change re-runs the memo, which
 * produces the next proposal — that is the entire loop.
 */
export function useBattleAi(args: UseBattleAiArgs): UseBattleAiResult {
  const { reducerState, dispatch, enabled, aiSide, caps } = args;
  const mutable = reducerState.mutable;

  // Actions the human rejected this turn, by stable key. Cleared when the turn
  // actually passes (a new transition with a different turn/active-side).
  const [excludedKeys, setExcludedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Whether the human forced an end-of-turn for the current AI turn.
  const [forceEndTurn, setForceEndTurn] = useState(false);

  // Reset per-turn UI state (exclusions, forced end) when the AI turn changes
  // (it is no longer the AI's turn, or the turn number advanced). This runs
  // during render via a ref guard so the reset is visible to the memo below
  // without an extra commit.
  const turnKey = `${mutable.activeSide}:${String(mutable.turnNumber)}`;
  const lastTurnKeyRef = useRef(turnKey);
  if (lastTurnKeyRef.current !== turnKey) {
    lastTurnKeyRef.current = turnKey;
    if (excludedKeys.size > 0) {
      setExcludedKeys(new Set());
    }
    if (forceEndTurn) {
      setForceEndTurn(false);
    }
  }

  const isAiTurn =
    enabled && mutable.activeSide === aiSide && mutable.result === null;

  const proposal = useMemo<AiProposal | null>(() => {
    if (!isAiTurn) {
      return null;
    }
    // `reducerState.transitionId` keys live-state changes; `mutable` covers the
    // initial state and any non-transition reference swap.
    return computeProposal(mutable, aiSide, excludedKeys, forceEndTurn, caps);
  }, [
    isAiTurn,
    reducerState.transitionId,
    mutable,
    aiSide,
    excludedKeys,
    forceEndTurn,
    caps,
  ]);

  // Defensive auto-block: on the OPPONENT's Dusk the AI is the defender and
  // positions front-rank blockers opposite the opponent's challengers. Unlike
  // the offensive turn (gated behind human approval), defense is applied
  // automatically so the player's own turn is not interrupted by a proposal —
  // the dispatched repositions still flow through the normal command path and
  // are logged and undoable. A ref keyed by the opponent's turn ensures the AI
  // defends at most once per Dusk, so the dispatched moves do not re-trigger the
  // effect into a loop.
  const lastDefenseTurnKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || mutable.result !== null) {
      return;
    }
    if (mutable.activeSide === aiSide || mutable.phase !== "dusk") {
      return;
    }
    const defenseKey = `${mutable.activeSide}:${String(mutable.turnNumber)}`;
    if (lastDefenseTurnKeyRef.current === defenseKey) {
      return;
    }
    lastDefenseTurnKeyRef.current = defenseKey;

    const model = forwardModelFromState(mutable, aiSide);
    const moves = planDefense(model, {
      scoreToWin: caps?.scoreToWin ?? DEFAULT_SCORE_TO_WIN,
    });
    for (const move of moves) {
      const commands = actionToCommands(move, aiSide);
      const [firstCommand, ...restCommands] = commands;
      const trace = buildTrace(move);
      const tracedCommands = firstCommand === undefined
        ? commands
        : [{ ...firstCommand, aiChoices: [trace] }, ...restCommands];
      for (const command of tracedCommands) {
        dispatch({ type: "APPLY_COMMAND", command });
      }
    }
  }, [enabled, aiSide, mutable, caps, dispatch]);

  // ONLY this path dispatches. It applies the held proposal's commands in order;
  // the resulting state change re-runs the memo to produce the next proposal.
  const approve = useCallback(() => {
    if (proposal === null) {
      return;
    }
    for (const command of proposal.commands) {
      dispatch({ type: "APPLY_COMMAND", command });
    }
  }, [proposal, dispatch]);

  // Excludes the proposed action and recomputes — dispatches NOTHING.
  const reject = useCallback(() => {
    if (proposal === null || proposal.kind === "endTurn") {
      return;
    }
    const key = proposalExclusionKey(proposal);
    if (key === null) {
      return;
    }
    setExcludedKeys((prev) => {
      if (prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, [proposal]);

  // Forces the endTurn proposal on the next render — dispatches NOTHING. The
  // human still approves the endTurn proposal to actually pass.
  const endAiTurn = useCallback(() => {
    setForceEndTurn(true);
  }, []);

  return { proposal, approve, reject, endAiTurn };
}

// --- Proposal computation --------------------------------------------------

/**
 * Computes the held proposal for the live `mutable` state: an action proposal
 * for the planner's chosen play (skipping excluded actions), or the endTurn
 * proposal when the human forced an end-of-turn or no non-excluded action
 * remains.
 */
function computeProposal(
  mutable: BattleMutableState,
  aiSide: BattleSide,
  excludedKeys: ReadonlySet<string>,
  forceEndTurn: boolean,
  caps: BattleCapsInput | undefined,
): AiProposal {
  const model = forwardModelFromState(mutable, aiSide);

  if (forceEndTurn) {
    return buildEndTurnProposal(mutable, model, aiSide, caps);
  }

  const action = planNonExcludedAction(model, mutable, excludedKeys);
  if (action === null || action.kind === "END_TURN") {
    return buildEndTurnProposal(mutable, model, aiSide, caps);
  }
  return buildActionProposal(mutable, action, aiSide);
}

/**
 * Plans the next action, skipping any whose exclusion key is in `excludedKeys`.
 * Re-plans against a model with the excluded card removed from hand/reserve so
 * the planner advances to the next-best line, falling back to `null` (→ endTurn)
 * when every remaining option is excluded.
 */
function planNonExcludedAction(
  model: ForwardModel,
  mutable: BattleMutableState,
  excludedKeys: ReadonlySet<string>,
): PlannedAction | null {
  const opts = plannerOptions(aiHandSeed(model, mutable.turnNumber));
  let workingModel = model;

  // Bounded retry: each iteration removes one excluded card and re-plans, so the
  // loop terminates after the hand/reserve is exhausted.
  const maxAttempts = model.aiHand.length + RESERVE_AND_DEPLOY_SLOTS + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const action = planNextAction(workingModel, opts);
    if (action.kind === "END_TURN") {
      return action;
    }
    const key = plannedActionExclusionKey(action);
    if (!excludedKeys.has(key)) {
      return action;
    }
    // Remove the excluded card from the working model and re-plan.
    const without = removeCardFromModel(workingModel, action.self?.battleCardId);
    if (without === null) {
      return null;
    }
    workingModel = without;
  }
  return null;
}

const RESERVE_AND_DEPLOY_SLOTS = RESERVE_SLOT_IDS.length + DEPLOY_SLOT_IDS.length;

/**
 * Returns a clone of `model` with the card identified by `battleCardId` removed
 * from hand and every reserve/deploy slot, or `null` when the id is missing
 * (nothing to remove — stop re-planning).
 */
function removeCardFromModel(
  model: ForwardModel,
  battleCardId: string | undefined,
): ForwardModel | null {
  if (battleCardId === undefined) {
    return null;
  }
  const handLengthBefore = model.aiHand.length;
  const aiHand = model.aiHand.filter((c) => c.battleCardId !== battleCardId);
  const aiDeployed = { ...model.aiDeployed };
  const aiReserve = { ...model.aiReserve };
  let removedFromBoard = false;
  for (const slot of Object.keys(aiDeployed) as (keyof typeof aiDeployed)[]) {
    if (aiDeployed[slot]?.battleCardId === battleCardId) {
      aiDeployed[slot] = null;
      removedFromBoard = true;
    }
  }
  for (const slot of Object.keys(aiReserve) as (keyof typeof aiReserve)[]) {
    if (aiReserve[slot]?.battleCardId === battleCardId) {
      aiReserve[slot] = null;
      removedFromBoard = true;
    }
  }
  if (aiHand.length === handLengthBefore && !removedFromBoard) {
    return null;
  }
  return { ...model, aiHand, aiDeployed, aiReserve };
}

/** Builds an action proposal: trace, description, and enriched commands. */
function buildActionProposal(
  mutable: BattleMutableState,
  action: PlannedAction,
  aiSide: BattleSide,
): AiProposal {
  const trace = buildTrace(action);
  const commands = actionToCommands(action, aiSide);
  enrichDeferredCommands(commands, action, mutable, aiSide);
  // Attach the trace to the FIRST command so the resulting transition's
  // `aiChoices` carries this action's rationale into the battle log. The first
  // command is the action's primary edit; subsequent edits (e.g. Distant
  // Worlds' deferred spark) ride the same transition but need no trace. We
  // replace the command rather than mutating it in place so the proposal's
  // stored command stays a plain rebuild on each render.
  const [firstCommand, ...restCommands] = commands;
  const tracedCommands = firstCommand === undefined
    ? commands
    : [{ ...firstCommand, aiChoices: [trace] }, ...restCommands];
  return {
    kind: "action",
    description: trace.rationale ?? describeFallback(action),
    trace,
    commands: tracedCommands,
  };
}

/**
 * Appends the live-state edits the driver deferred to the hook. Currently only
 * Worlds Await (#519): `SET_CARD_SPARK_DELTA` is an ABSOLUTE write, so it is
 * computed against the target instance's CURRENT `sparkDelta` plus the +3 bonus.
 */
function enrichDeferredCommands(
  commands: BattleCommand[],
  action: PlannedAction,
  mutable: BattleMutableState,
  aiSide: BattleSide,
): void {
  if (action.kind !== "PLAY_CARD") {
    return;
  }
  if (action.self?.cardNumber !== DISTANT_WORLDS_CARD_NUMBER) {
    return;
  }
  const targetId = action.targets?.targetBattleCardId ?? null;
  if (targetId === null) {
    return;
  }
  const target = mutable.cardInstances[targetId];
  if (target === undefined) {
    return;
  }
  commands.push(
    makeAiCommand(
      {
        kind: "SET_CARD_SPARK_DELTA",
        battleCardId: targetId,
        value: target.sparkDelta + DISTANT_WORLDS_SPARK_BONUS,
      },
      aiSide,
    ),
  );
}

/**
 * Builds the endTurn proposal: the challenge-resolution edits from
 * {@link resolveJudgment} (using the card-keyed support map from
 * {@link buildSupportContribution}), followed by the handoff edits
 * (`flowEdit`, `drawEdits`, `energyEdits`) from {@link planHandoff}. Every edit
 * is wrapped as an AI-authored DEBUG_EDIT command.
 */
function buildEndTurnProposal(
  mutable: BattleMutableState,
  model: ForwardModel,
  aiSide: BattleSide,
  caps: BattleCapsInput | undefined,
): AiProposal {
  const supportContribution = buildSupportContribution(model);
  const judgment = resolveJudgment({
    state: mutable,
    activeSide: aiSide,
    supportContribution,
  });

  const handoff = planHandoff({
    state: mutable,
    scoreToWin: caps?.scoreToWin ?? DEFAULT_SCORE_TO_WIN,
    turnLimit: caps?.turnLimit ?? DEFAULT_TURN_LIMIT,
    maxEnergyCap: caps?.maxEnergyCap ?? DEFAULT_MAX_ENERGY_CAP,
  });

  const edits: BattleDebugEdit[] = [
    ...judgment.edits,
    handoff.flowEdit,
    ...handoff.drawEdits,
    ...handoff.energyEdits,
  ];
  const commands = edits.map((edit) => makeAiCommand(edit, aiSide));

  return {
    kind: "endTurn",
    description: "End turn — resolve the Challenge and pass",
    trace: null,
    commands,
  };
}

// --- Planner options + seeding ---------------------------------------------

function plannerOptions(rngSeed: number): PlannerOptions {
  // In the browser `performance.now()` is available; under jsdom/node it is too.
  // The planner treats `nowMs` as a fixed snapshot, so a single read suffices.
  const nowMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : 0;
  return {
    deadlineMs: nowMs + PLAN_BUDGET_MS,
    beamWidth: AI_DIFFICULTY_V1.beamWidth,
    opponentMode: AI_DIFFICULTY_V1.opponentMode,
    sampleCap: AI_DIFFICULTY_V1.sampleCap,
    nowMs,
    rngSeed,
  };
}

/**
 * Derives a stable RNG seed from the turn number plus a hash of the AI hand's
 * card ids, so re-planning the SAME state is deterministic but different turns /
 * hands vary. `Math.random()` is never used.
 */
function aiHandSeed(model: ForwardModel, turnNumber: number): number {
  let hash = 2166136261 >>> 0;
  for (const card of model.aiHand) {
    for (let i = 0; i < card.battleCardId.length; i += 1) {
      hash ^= card.battleCardId.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  }
  return (hash ^ Math.imul(turnNumber + 1, 2654435761)) >>> 0;
}

// --- Command + key helpers -------------------------------------------------

/**
 * Wraps a {@link BattleDebugEdit} as an AI-authored DEBUG_EDIT command, matching
 * the driver's envelope (`actor: aiSide`, `sourceSurface: "auto-system"`).
 */
function makeAiCommand(edit: BattleDebugEdit, aiSide: BattleSide): BattleCommand {
  return {
    id: "DEBUG_EDIT",
    edit,
    actor: aiSide,
    sourceSurface: "auto-system",
  };
}

/** Stable exclusion key for a planned action: card id + kind + destination. */
function plannedActionExclusionKey(action: PlannedAction): string {
  return [
    action.kind,
    action.self?.battleCardId ?? "",
    action.toSlot ?? "",
    action.targets?.targetBattleCardId ?? "",
  ].join("|");
}

/** Exclusion key for a held action proposal, derived from its trace. */
function proposalExclusionKey(proposal: AiProposal): string | null {
  const trace = proposal.trace;
  if (trace === null) {
    return null;
  }
  return [
    trace.choice,
    trace.battleCardId ?? "",
    trace.targetSlotId ?? "",
    trace.targetBattleCardId ?? "",
  ].join("|");
}

function describeFallback(action: PlannedAction): string {
  return action.kind === "END_TURN"
    ? "End turn"
    : `Play ${action.self?.name ?? "a card"}`;
}
