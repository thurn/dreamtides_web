import { actionToCommands } from "./ai/driver";
import {
  planDefenseWithDecision,
  type DefenseDecision,
} from "./ai/defense";
import { AI_DIFFICULTY_V1 } from "./ai/difficulty";
import { forwardModelFromState } from "./ai/forward-model";
import { planNextAction } from "./ai/planner";
import { buildTrace } from "./ai/trace";
import type { BattleCommand } from "./debug/commands";
import { planHandoff } from "./engine/handoff";
import type { PromptResolution } from "../rules/battle/effect-runner-core";
import { battleModeOf, type PendingPrompt } from "../rules/battle/fold";
import type { FoldState } from "../rules/fold-state";

/** Fixed search work for tutorial AI. It is intentionally independent of time. */
export const TUTORIAL_AI_EXPANSION_BUDGET = 256;

export type TutorialDriverStatus =
  | "not-tutorial"
  | "driver"
  | "observer"
  | "paused-driver-absent"
  | "terminal";

export interface TutorialBattleControllerInput {
  /** The confirmed room fold only; optimistic state must never drive automation. */
  state: FoldState;
  clientId: string;
  /** `null` means presence has not loaded and automation must pause safely. */
  connectedClientIds: readonly string[] | null;
}

export type TutorialAutomaticIntent =
  | { kind: "battle-command"; command: BattleCommand; intentKey: string; reason: string }
  | {
      kind: "battle-play-card";
      battleCardId: string;
      targetBattleCardIds: readonly string[];
      aiChoices: readonly ReturnType<typeof buildTrace>[];
      intentKey: string;
      reason: string;
    }
  | { kind: "battle-gesture"; commands: readonly BattleCommand[]; intentKey: string; reason: string }
  | {
      kind: "battle-ai-defend";
      decision: DefenseDecision;
      intentKey: string;
      reason: string;
    }
  | { kind: "resolve-prompt"; promptId: number; resolution: PromptResolution; intentKey: string; reason: string };

export interface TutorialBattleControllerPlan {
  status: TutorialDriverStatus;
  driverClientId: string | null;
  /** True only for the persisted driver on this client, including at terminal. */
  isCurrentClientDriver: boolean;
  /** Presence is deliberately explicit: a terminal result may outlive its driver. */
  isDriverPresent: boolean;
  /** A human-owned prompt or block step must be rendered as interactive UI. */
  requiresHumanDecision: boolean;
  intent: TutorialAutomaticIntent | null;
}

/**
 * Pure, one-step tutorial battle coordinator. Consumers submit at most the
 * returned intent and wait for its confirmation before asking again. The fold,
 * presence, and stable intent key are the entire coordination protocol.
 */
export function planTutorialBattleController(
  input: TutorialBattleControllerInput,
): TutorialBattleControllerPlan {
  const battle = input.state.battle;
  if (battle === null || battleModeOf(battle).kind !== "tutorial") {
    return idlePlan("not-tutorial");
  }
  const mode = battleModeOf(battle);
  if (mode.kind !== "tutorial") return idlePlan("not-tutorial");
  const isDriverPresent = input.connectedClientIds?.includes(mode.driverClientId) ?? false;
  const isCurrentClientDriver = input.clientId === mode.driverClientId;
  if (battle.board.result !== null) {
    return { status: "terminal", driverClientId: mode.driverClientId, isCurrentClientDriver, isDriverPresent, requiresHumanDecision: false, intent: null };
  }
  if (!isDriverPresent) {
    return { status: "paused-driver-absent", driverClientId: mode.driverClientId, isCurrentClientDriver, isDriverPresent, requiresHumanDecision: false, intent: null };
  }
  if (!isCurrentClientDriver) {
    return { status: "observer", driverClientId: mode.driverClientId, isCurrentClientDriver, isDriverPresent, requiresHumanDecision: false, intent: null };
  }

  const prompt = battle.pendingPrompt;
  if (prompt !== null) {
    if (prompt.run.side === "player") {
      return { status: "driver", driverClientId: mode.driverClientId, isCurrentClientDriver: true, isDriverPresent: true, requiresHumanDecision: true, intent: null };
    }
    return {
      status: "driver",
      driverClientId: mode.driverClientId, isCurrentClientDriver: true, isDriverPresent: true,
      requiresHumanDecision: false,
      intent: promptIntent(battle.board.battleId, prompt),
    };
  }

  const board = battle.board;
  const key = intentKeyPrefix(board);
  if (board.phase === "dawn") {
    if (battle.triggerDawnFired?.[board.activeSide] !== board.turnNumber) {
      return commandPlan(
        { id: "DEBUG_EDIT", edit: { kind: "SET_PHASE", phase: "dawn" }, sourceSurface: "auto-system" },
        `${key}:dawn:triggers`,
        "resolve-dawn-triggers",
        mode.driverClientId,
      );
    }
    return commandPlan(
      { id: "DEBUG_EDIT", edit: { kind: "SET_PHASE", phase: "day" }, sourceSurface: "auto-system" },
      `${key}:dawn:day`,
      "advance-dawn",
      mode.driverClientId,
    );
  }
  if (board.phase === "dreamwell") {
    if (board.sides[board.activeSide].dreamwellDrawnTurn !== board.turnNumber) {
      return commandPlan(
      { id: "DEBUG_EDIT", edit: { kind: "DRAW_DREAMWELL_CARD", side: board.activeSide, turnNumber: board.turnNumber }, sourceSurface: "auto-system" },
      `${key}:dreamwell:reveal`,
      "reveal-dreamwell",
      mode.driverClientId,
      );
    }
    return commandPlan(
      { id: "DEBUG_EDIT", edit: { kind: "SET_PHASE", phase: "dawn" }, sourceSurface: "auto-system" },
      `${key}:dreamwell:dawn`,
      "advance-dreamwell",
      mode.driverClientId,
    );
  }

  if (board.activeSide === "player") {
    if (board.phase === "day") {
      return { status: "driver", driverClientId: mode.driverClientId, isCurrentClientDriver: true, isDriverPresent: true, requiresHumanDecision: true, intent: null };
    }
    const aiDefenseAlreadyProcessed =
      battle.aiDefenseTurn?.activeSide === board.activeSide &&
      battle.aiDefenseTurn.turnNumber === board.turnNumber;
    if (board.phase === "dusk" && !aiDefenseAlreadyProcessed) {
      const defense = planDefenseWithDecision(
        forwardModelFromState(board, "enemy"),
        { scoreToWin: battle.init.scoreToWin },
      );
      return {
        status: "driver",
        driverClientId: mode.driverClientId, isCurrentClientDriver: true, isDriverPresent: true,
        requiresHumanDecision: false,
        intent: {
          kind: "battle-ai-defend",
          decision: defense.decision,
          intentKey: `${key}:defend`,
          reason: "enemy-defend-player-attack",
        },
      };
    }
    return handoffPlan(input.state, "advance-player-no-choice-phase");
  }

  if (board.phase === "day") {
    const action = planNextAction(forwardModelFromState(board, "enemy"), {
      deadlineMs: Number.POSITIVE_INFINITY,
      nowMs: 0,
      expansionBudget: TUTORIAL_AI_EXPANSION_BUDGET,
      beamWidth: AI_DIFFICULTY_V1.beamWidth,
      opponentMode: AI_DIFFICULTY_V1.opponentMode,
      sampleCap: AI_DIFFICULTY_V1.sampleCap,
      rngSeed: tutorialPlannerSeed(board.battleId, board.turnNumber),
    });
    const trace = buildTrace(action);
    if (action.kind === "PLAY_CARD" && action.self !== undefined) {
      const targets = action.targets?.targetBattleCardId === null || action.targets?.targetBattleCardId === undefined
        ? []
        : [action.targets.targetBattleCardId];
      return {
        status: "driver",
      driverClientId: mode.driverClientId, isCurrentClientDriver: true, isDriverPresent: true,
        requiresHumanDecision: false,
        intent: {
          kind: "battle-play-card",
          battleCardId: action.self.battleCardId,
          targetBattleCardIds: targets,
          aiChoices: [trace],
          intentKey: `${key}:enemy-play:${action.self.battleCardId}`,
          reason: "enemy-day-play",
        },
      };
    }
    if (action.kind === "MOVE_CARD") {
      const commands = actionToCommands(action, "enemy");
      return {
        status: "driver",
        driverClientId: mode.driverClientId, isCurrentClientDriver: true, isDriverPresent: true,
        requiresHumanDecision: false,
        intent: {
          kind: "battle-gesture",
          commands: commands.map((command, index) => index === 0 ? { ...command, aiChoices: [trace] } : command),
          intentKey: `${key}:enemy-move:${action.self?.battleCardId ?? "none"}:${action.toSlot ?? "none"}`,
          reason: "enemy-day-reposition",
        },
      };
    }
    return commandPlan(
      { id: "DEBUG_EDIT", edit: { kind: "SET_PHASE", phase: "dusk" }, sourceSurface: "auto-system", aiChoices: [trace] },
      `${key}:enemy-day-complete`,
      "enemy-day-complete",
      mode.driverClientId,
    );
  }

  if (board.phase === "dusk" && enemyHasChallenger(input.state)) {
    return { status: "driver", driverClientId: mode.driverClientId, isCurrentClientDriver: true, isDriverPresent: true, requiresHumanDecision: true, intent: null };
  }
  return handoffPlan(input.state, "advance-enemy-no-choice-phase");
}

function idlePlan(status: "not-tutorial"): TutorialBattleControllerPlan {
  return { status, driverClientId: null, isCurrentClientDriver: false, isDriverPresent: false, requiresHumanDecision: false, intent: null };
}

function commandPlan(command: BattleCommand, intentKey: string, reason: string, driverClientId: string | null): TutorialBattleControllerPlan {
  return { status: "driver", driverClientId, isCurrentClientDriver: true, isDriverPresent: true, requiresHumanDecision: false, intent: { kind: "battle-command", command, intentKey, reason } };
}

function handoffPlan(state: FoldState, reason: string): TutorialBattleControllerPlan {
  const battle = state.battle;
  if (battle === null) return idlePlan("not-tutorial");
  const mode = battleModeOf(battle);
  const flowEdit = planHandoff({
    state: battle.board,
    scoreToWin: battle.init.scoreToWin,
    turnLimit: battle.init.turnLimit,
    maxEnergyCap: battle.init.maxEnergyCap,
  }).flowEdit;
  return commandPlan(
    { id: "DEBUG_EDIT", edit: flowEdit, sourceSurface: "auto-system" },
    `${intentKeyPrefix(battle.board)}:handoff`,
    reason,
    mode.kind === "tutorial" ? mode.driverClientId : null,
  );
}

function promptIntent(battleId: string, prompt: PendingPrompt): TutorialAutomaticIntent {
  return {
    kind: "resolve-prompt",
    promptId: prompt.promptId,
    resolution: deterministicPromptResolution(prompt),
    intentKey: `tutorial-battle:${battleId}:prompt:${String(prompt.promptId)}`,
    reason: `enemy-${prompt.options.kind}-prompt`,
  };
}

function deterministicPromptResolution(prompt: PendingPrompt): PromptResolution {
  switch (prompt.options.kind) {
    case "pick-cards":
      return {
        kind: "pick-cards",
        chosenIds: [...prompt.options.candidateIds].sort().slice(0, prompt.options.count),
      };
    case "choice":
      return { kind: "choice", optionIndex: 0 };
    case "foresee":
      return {
        kind: "foresee",
        viewedCardIds: [...prompt.options.cardIds],
        orderedCardIds: [...prompt.options.cardIds],
        voidCardIds: [],
      };
  }
}

function enemyHasChallenger(state: FoldState): boolean {
  const board = state.battle?.board;
  if (board === undefined) return false;
  return Object.values(board.sides.enemy.frontRank).some((battleCardId) => battleCardId !== null);
}

function intentKeyPrefix(board: { battleId: string; activeSide: string; turnNumber: number; phase: string }): string {
  return `tutorial-battle:${board.battleId}:${board.activeSide}:${String(board.turnNumber)}:${board.phase}`;
}

function tutorialPlannerSeed(battleId: string, turnNumber: number): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < battleId.length; index += 1) {
    hash ^= battleId.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash ^ Math.imul(turnNumber + 1, 2654435761)) >>> 0;
}
