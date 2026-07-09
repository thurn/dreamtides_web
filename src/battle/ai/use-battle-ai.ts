import { useCallback, useEffect, useRef, useState } from "react";
import { forwardModelFromState, type ForwardModel } from "./forward-model";
import { planDefense } from "./defense";
import { planNextActionAsync, type PlannedAction, type PlannerOptions } from "./planner";
import { AI_DIFFICULTY_V1 } from "./difficulty";
import { buildTrace } from "./trace";
import { actionToCommands } from "./driver";
import { buildSupportContribution } from "./cards/support-contribution";
import { resolveChallenge } from "../engine/challenge";
import { planHandoff } from "../engine/handoff";
import type { BattleCommand, BattleDebugEdit } from "../debug/commands";
import {
  type BattleAiChoiceTrace,
  type BattleMutableState,
  type BattleSide,
} from "../types";

/**
 * A held AI proposal: the plain-language description, the enriched trace, and
 * the exact commands `approve()` will dispatch. The proposal is computed but
 * NEVER applied on its own — only the human-triggered `approve()` dispatches.
 */
export interface AiProposal {
  /**
   * `action` is a card play/move (rejectable). `endPhase` advances the AI from
   * its Day phase to Dusk and stops, so the human (the defender on the AI's
   * turn) can reposition before driving Night/Challenge. `endTurn` bundles the
   * full Challenge resolution + handoff in one step, used only when basic
   * automation is off and nothing else will resolve the turn.
   */
  kind: "action" | "endPhase" | "endTurn";
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
const WORLDS_AWAIT_CARD_NUMBER = 519;
const WORLDS_AWAIT_SPARK_BONUS = 3;

interface BattleCapsInput {
  scoreToWin?: number;
  turnLimit?: number;
  maxEnergyCap?: number;
}

export interface UseBattleAiArgs {
  board: BattleMutableState;
  submitCommand: (command: BattleCommand) => void;
  submitGesture: (commands: readonly BattleCommand[]) => void;
  enabled: boolean;
  /** The side the AI controls (e.g. "enemy"). */
  aiSide: BattleSide;
  /** Optional win/turn/energy caps; defaults to 25/50/10. */
  caps?: BattleCapsInput;
  /**
   * Whether basic automation is resolving turn bookends. When on, the AI ends
   * its Day with an `endPhase` proposal and lets the human drive the rest;
   * automation resolves the Challenge and handoff. When off, the AI bundles the
   * whole end-of-turn into a single `endTurn` proposal.
   */
  basicAutomation: boolean;
}

export interface UseBattleAiResult {
  proposal: AiProposal | null;
  /**
   * True while the planner is computing the next proposal off the render path.
   * The AI's beam search is heavy enough to freeze the UI if run synchronously
   * during render, so it runs asynchronously (yielding between beam rounds);
   * this flag lets the screen keep its controls locked and show a "thinking"
   * indicator until {@link proposal} settles.
   */
  thinking: boolean;
  approve: () => void;
  reject: () => void;
}

/**
 * Yields control to the event loop as a MACROTASK so the browser can paint a
 * frame and process input between beam rounds. A microtask (`Promise.resolve`)
 * is NOT enough — the browser cannot paint between microtasks, so it would not
 * relieve the freeze. `MessageChannel` is a macrotask without `setTimeout`'s
 * ~4ms clamp, so it keeps the added planning latency minimal; `setTimeout` is
 * the fallback where `MessageChannel` is unavailable.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel === "function") {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(undefined);
      return;
    }
    setTimeout(resolve, 0);
  });
}

/**
 * Drives the AI's turn as an APPROVAL LOOP, never as an autonomous mutator.
 *
 * THE SAFETY CONTRACT: the hook computes a {@link AiProposal} and holds it.
 * ONLY the human-triggered {@link UseBattleAiResult.approve} dispatches. Mounting
 * the hook, recomputing a proposal, and {@link UseBattleAiResult.reject} dispatch
 * NOTHING.
 *
 * The proposal is recomputed by an effect — ASYNCHRONOUSLY, off the render path,
 * with the beam search yielding the main thread between rounds — whenever the
 * live mutable state changes (keyed by a turn/side/phase/score transition key)
 * and whenever
 * an action is rejected (the exclusion set grows). While a plan is in flight the
 * hook reports {@link UseBattleAiResult.thinking}. When `approve()` dispatches,
 * the resulting state change re-runs the effect, which produces the next
 * proposal — that is the entire loop.
 */
export function useBattleAi(args: UseBattleAiArgs): UseBattleAiResult {
  const {
    board,
    submitCommand,
    submitGesture,
    enabled,
    aiSide,
    caps,
    basicAutomation,
  } = args;
  const mutable = board;
  // A stable replan key: the driver owns nondeterministic triggers, so there is
  // no `transitionId` to key off of here. Turn/side/phase/score capture every
  // meaningfully distinct board the planner cares about; the `mutable`
  // reference itself is also a dependency below so an in-place edit under the
  // same key (e.g. a mid-turn energy tweak) still re-triggers the effect.
  const transitionKey = `${mutable.turnNumber}:${mutable.activeSide}:${mutable.phase}:${String(mutable.sides.player.score)}:${String(mutable.sides.enemy.score)}`;

  // Actions the human rejected this turn, by stable key. Cleared when the turn
  // actually passes (a new transition with a different turn/active-side).
  const [excludedKeys, setExcludedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // Reset per-turn UI state (exclusions) when the AI turn changes (it is no
  // longer the AI's turn, or the turn number advanced). This runs during render
  // via a ref guard so the reset is visible to the planning effect below without
  // an extra commit.
  const turnKey = `${mutable.activeSide}:${String(mutable.turnNumber)}`;
  const lastTurnKeyRef = useRef(turnKey);
  if (lastTurnKeyRef.current !== turnKey) {
    lastTurnKeyRef.current = turnKey;
    if (excludedKeys.size > 0) {
      setExcludedKeys(new Set());
    }
  }

  // The AI holds no proposal while its own turn sits on the Dreamwell phase: the
  // human first clicks through the AI opponent's Dreamwell card with the phase
  // advance arrow, which moves the AI off `dreamwell`, and only then does the AI
  // begin proposing its Day-phase plays.
  const isAiTurn =
    enabled &&
    mutable.activeSide === aiSide &&
    mutable.result === null &&
    mutable.phase !== "dreamwell";

  // The proposal is computed ASYNCHRONOUSLY off the render path: the planner's
  // beam search is heavy enough that running it synchronously during render
  // freezes the whole tab for the AI's turn. The effect (re)plans whenever the
  // live state changes — keyed by `transitionKey` plus the `mutable`
  // reference and the exclusion set — and stores the result in state.
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [thinking, setThinking] = useState(false);
  // Monotonic token identifying the in-flight plan. Bumped whenever the inputs
  // change or the hook unmounts, so a slower earlier plan that resolves late is
  // dropped instead of overwriting a fresher proposal (or a stale plan being
  // approvable against state that has already moved on).
  const planTokenRef = useRef(0);

  useEffect(() => {
    if (!isAiTurn) {
      planTokenRef.current += 1;
      setThinking(false);
      setProposal(null);
      return;
    }

    const token = (planTokenRef.current += 1);
    // Clear the prior proposal up front: while replanning, the human must not be
    // able to approve a plan computed against an earlier state.
    setProposal(null);
    setThinking(true);
    void computeProposalAsync(
      mutable,
      aiSide,
      excludedKeys,
      caps,
      basicAutomation,
      yieldToEventLoop,
    ).then((next) => {
      if (planTokenRef.current !== token) {
        return;
      }
      setProposal(next);
      setThinking(false);
    });

    return () => {
      // Invalidate this plan: its `.then` becomes a no-op, so it cannot set
      // state after the inputs change or the component unmounts.
      planTokenRef.current += 1;
    };
  }, [
    isAiTurn,
    transitionKey,
    mutable,
    aiSide,
    excludedKeys,
    caps,
    basicAutomation,
  ]);

  const submitCommands = useCallback((commands: readonly BattleCommand[]): void => {
    const [firstCommand] = commands;
    if (firstCommand === undefined) {
      return;
    }
    if (commands.length === 1) {
      submitCommand(firstCommand);
      return;
    }
    submitGesture(commands);
  }, [submitCommand, submitGesture]);

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
    const defenseCommands: BattleCommand[] = [];
    for (const move of moves) {
      const commands = actionToCommands(move, aiSide);
      const [firstCommand, ...restCommands] = commands;
      const trace = buildTrace(move);
      const tracedCommands = firstCommand === undefined
        ? commands
        : [{ ...firstCommand, aiChoices: [trace] }, ...restCommands];
      defenseCommands.push(...tracedCommands);
    }
    submitCommands(defenseCommands);
  }, [enabled, aiSide, mutable, caps, submitCommands]);

  // ONLY this path dispatches. It applies the held proposal's commands in order;
  // the resulting state change re-runs the planning effect to produce the next
  // proposal.
  const approve = useCallback(() => {
    if (proposal === null) {
      return;
    }
    submitCommands(proposal.commands);
  }, [proposal, submitCommands]);

  // Excludes the proposed action and recomputes — dispatches NOTHING. Only a
  // card-play `action` can be rejected; phase/turn-ending proposals cannot.
  const reject = useCallback(() => {
    if (proposal === null || proposal.kind !== "action") {
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

  return { proposal, thinking, approve, reject };
}

// --- Proposal computation --------------------------------------------------

/**
 * Computes the held proposal for the live `mutable` state. While the AI has a
 * non-excluded play it proposes that action. Once no play remains the AI ends
 * its phase/turn:
 *
 * - With basic automation on, the AI proposes `endPhase` to step Day → Dusk and
 *   then holds NO proposal (returns null), so the human repositions their
 *   defenders during the AI's Dusk and drives Night/Challenge with the phase
 *   controls. Basic automation resolves the AI's Challenge and the handoff when
 *   the human passes Challenge.
 * - With basic automation off, nothing else will resolve the turn, so the AI
 *   proposes the all-in-one `endTurn` (Challenge resolution + handoff).
 */
async function computeProposalAsync(
  mutable: BattleMutableState,
  aiSide: BattleSide,
  excludedKeys: ReadonlySet<string>,
  caps: BattleCapsInput | undefined,
  basicAutomation: boolean,
  yieldFn: () => Promise<void>,
): Promise<AiProposal | null> {
  const model = forwardModelFromState(mutable, aiSide);

  const action = await planNonExcludedActionAsync(model, mutable, excludedKeys, yieldFn);
  if (action !== null && action.kind !== "END_TURN") {
    return buildActionProposal(mutable, action, aiSide);
  }

  if (!basicAutomation) {
    return buildEndTurnProposal(mutable, model, aiSide, caps);
  }

  if (mutable.phase === "day") {
    return buildEndPhaseProposal(mutable, aiSide);
  }
  return null;
}

/**
 * Builds the `endPhase` proposal: a single `SET_BATTLE_FLOW` that advances the
 * AI from its Day phase into Dusk, keeping the same side and turn. Approving it
 * hands the Dusk repositioning window to the human defender; the rest of the AI
 * turn is then driven by the human via the phase controls.
 */
function buildEndPhaseProposal(
  mutable: BattleMutableState,
  aiSide: BattleSide,
): AiProposal {
  const flowEdit: BattleDebugEdit = {
    kind: "SET_BATTLE_FLOW",
    phase: "dusk",
    activeSide: aiSide,
    turnNumber: mutable.turnNumber,
  };
  return {
    kind: "endPhase",
    description: "End phase — pass to your Dusk",
    trace: null,
    commands: [makeAiCommand(flowEdit, aiSide)],
  };
}

/**
 * Plans the next action, skipping any whose exclusion key is in `excludedKeys`.
 * Re-plans against a model with the excluded card removed from hand/back rank so
 * the planner advances to the next-best line, falling back to `null` (→ endTurn)
 * when every remaining option is excluded.
 */
async function planNonExcludedActionAsync(
  model: ForwardModel,
  mutable: BattleMutableState,
  excludedKeys: ReadonlySet<string>,
  yieldFn: () => Promise<void>,
): Promise<PlannedAction | null> {
  const opts = plannerOptions(aiHandSeed(model, mutable.turnNumber));
  let workingModel = model;

  // Bounded retry: each iteration removes one excluded card and re-plans, so the
  // loop terminates after the hand/board is exhausted. The board size is read
  // from the model's current ranks since the play area grows without bound.
  const battlefieldSlotCount =
    Object.keys(model.aiBackRank).length + Object.keys(model.aiFrontRank).length;
  const maxAttempts = model.aiHand.length + battlefieldSlotCount + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const action = await planNextActionAsync(workingModel, opts, yieldFn);
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

/**
 * Returns a clone of `model` with the card identified by `battleCardId` removed
 * from hand and every back-rank/front-rank slot, or `null` when the id is missing
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
  const aiFrontRank = { ...model.aiFrontRank };
  const aiBackRank = { ...model.aiBackRank };
  let removedFromBoard = false;
  for (const slot of Object.keys(aiFrontRank) as (keyof typeof aiFrontRank)[]) {
    if (aiFrontRank[slot]?.battleCardId === battleCardId) {
      aiFrontRank[slot] = null;
      removedFromBoard = true;
    }
  }
  for (const slot of Object.keys(aiBackRank) as (keyof typeof aiBackRank)[]) {
    if (aiBackRank[slot]?.battleCardId === battleCardId) {
      aiBackRank[slot] = null;
      removedFromBoard = true;
    }
  }
  if (aiHand.length === handLengthBefore && !removedFromBoard) {
    return null;
  }
  return { ...model, aiHand, aiFrontRank, aiBackRank };
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
  // command is the action's primary edit; subsequent edits (e.g. Worlds
  // Await's deferred spark) ride the same transition but need no trace. We
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
  if (action.self?.cardNumber !== WORLDS_AWAIT_CARD_NUMBER) {
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
        value: target.sparkDelta + WORLDS_AWAIT_SPARK_BONUS,
      },
      aiSide,
    ),
  );
}

/**
 * Builds the endTurn proposal: the challenge-resolution edits from the unified,
 * keyword-aware {@link resolveChallenge} (using the card-keyed support map from
 * {@link buildSupportContribution}), followed by the handoff edits
 * (`endingBanishEdits`, `flowEdit`, `dawnClearEdits`, `drawEdits`,
 * `energyEdits`) from {@link planHandoff}. Every edit is wrapped as an
 * AI-authored DEBUG_EDIT command.
 *
 * The AI resolves combat through the same source of truth the rest of the
 * engine uses, so its committed Challenge outcome honors the four combat
 * keywords (Unstoppable, Vengeful, Preeminence, Awakened) and figment
 * dissolution exactly as the human path does.
 */
function buildEndTurnProposal(
  mutable: BattleMutableState,
  model: ForwardModel,
  aiSide: BattleSide,
  caps: BattleCapsInput | undefined,
): AiProposal {
  const supportContribution = buildSupportContribution(model);
  const challenge = resolveChallenge({
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

  // Hand-limit discard is the human player's responsibility and is
  // intentionally omitted from the AI proposal.
  const edits: BattleDebugEdit[] = [
    ...challenge.edits,
    // Ending (outgoing side) precedes the side flip; Dawn clear (incoming side)
    // follows it, matching the Basic Automation handoff order so the AI's
    // end-of-turn composes the same bookend effects. The flow edit lands the
    // incoming side on its Dreamwell phase; that side's energy is raised when
    // the human clicks through and the Dreamwell card is revealed.
    ...handoff.endingBanishEdits,
    handoff.flowEdit,
    ...handoff.dawnClearEdits,
    ...handoff.drawEdits,
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
