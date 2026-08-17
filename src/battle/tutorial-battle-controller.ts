import { actionToCommands } from "./ai/driver";
import { planBlockingWithDecision, type BlockingDecision } from "./ai/blocking";
import { forwardModelFromState } from "./ai/forward-model";
import { planNextAction } from "./ai/planner";
import { buildTrace } from "./ai/trace";
import type { BattleCommand } from "./debug/commands";
import { planHandoff } from "./engine/handoff";
import { isBackRankSlotId } from "./types";
import type {
  BattleAiChoiceTrace,
  BattlePhase,
  BattleSide,
} from "./types";
import {
  planTutorialAiActionOverride,
  type TutorialAiActionOverrideBlockReason,
} from "./tutorial-ai-action-overrides";
import type { TutorialBattleAiActionOverride } from "../types/tutorial";
import type { PromptResolution } from "../rules/battle/effect-runner-core";
import {
  battleModeOf,
  type BattleFoldState,
  type PendingPrompt,
} from "../rules/battle/fold";
import type { FoldState } from "../rules/fold-state";
import type { CardId } from "../types/card-identity";
import type { BattleCardId, ClientId, IntentKey } from "../types/identifiers";
import type { TutorialAiActionOverrideId } from "../types/identifiers";
import type { PresentationId } from "../types/identifiers";
import type { BattleId } from "../types/identifiers";
import type { DreamwellCardId } from "../types/identifiers";
import { parseBattleCardId } from "../types/identifiers";
import { parseIntentKey } from "../types/identifiers";
import { drawsDreamwellCardAtStartOfTurn } from "./state/turn-utils";

export type TutorialDriverStatus =
  "not-tutorial" | "driver" | "observer" | "paused-driver-absent" | "terminal";

export interface TutorialBattleControllerInput {
  /** The confirmed room fold only; optimistic state must never drive automation. */
  state: FoldState;
  clientId: ClientId;
  /** `null` means presence has not loaded and automation must pause safely. */
  connectedClientIds: readonly ClientId[] | null;
}

export interface TutorialAiActionOverrideMiss {
  overrideId: TutorialAiActionOverrideId;
  triggerKind: TutorialBattleAiActionOverride["trigger"]["kind"];
  triggerCardId: DreamwellCardId;
  actionKind: TutorialBattleAiActionOverride["action"]["kind"];
  actionCardId: CardId;
  reason: TutorialAiActionOverrideBlockReason;
}

export type TutorialAutomaticIntentReason =
  | NonNullable<BattleFoldState["tutorialPresentation"]>["kind"]
  | "resolve-dawn-triggers"
  | "reveal-dreamwell"
  | "advance-dawn"
  | "advance-dreamwell"
  | "advance-player-dusk"
  | "advance-player-no-choice-phase"
  | "advance-enemy-no-choice-phase"
  | "enemy-block-player-challenge"
  | "enemy-scripted-day-play"
  | "enemy-day-play"
  | "enemy-day-reposition"
  | "enemy-day-complete"
  | `enemy-${PendingPrompt["options"]["kind"]}-prompt`;

export type TutorialAutomaticIntent = (
  | {
      kind: "battle-command";
      command: BattleCommand;
      intentKey: IntentKey;
      reason: TutorialAutomaticIntentReason;
    }
  | {
      kind: "battle-play-card";
      battleCardId: BattleCardId;
      targetBattleCardIds: readonly BattleCardId[];
      aiChoices: readonly ReturnType<typeof buildTrace>[];
      characterDestination?: {
        side: "enemy";
        zone: "backRank";
        slotId: `B${number}`;
      };
      tutorialAiActionOverrideId?: TutorialAiActionOverrideId;
      intentKey: IntentKey;
      reason: TutorialAutomaticIntentReason;
    }
  | {
      kind: "battle-gesture";
      commands: readonly BattleCommand[];
      intentKey: IntentKey;
      reason: TutorialAutomaticIntentReason;
    }
  | {
      kind: "battle-ai-block";
      decision: BlockingDecision;
      intentKey: IntentKey;
      reason: TutorialAutomaticIntentReason;
    }
  | {
      kind: "complete-presentation";
      presentationId: PresentationId;
      intentKey: IntentKey;
      reason: TutorialAutomaticIntentReason;
    }
  | {
      kind: "resolve-prompt";
      promptId: number;
      resolution: PromptResolution;
      intentKey: IntentKey;
      reason: TutorialAutomaticIntentReason;
    }
) & { aiActionOverrideMiss?: TutorialAiActionOverrideMiss };

export interface TutorialBattleControllerPlan {
  status: TutorialDriverStatus;
  driverClientId: ClientId | null;
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
  const controllerClientId =
    input.state.playtestControl?.controllerClientId ?? null;
  const isDriverPresent =
    controllerClientId !== null &&
    (input.connectedClientIds?.includes(controllerClientId) ?? false);
  const isCurrentClientDriver = input.clientId === controllerClientId;
  const presentation = battle.tutorialPresentation ?? null;
  if (!isDriverPresent) {
    return {
      status:
        battle.board.result === null ? "paused-driver-absent" : "terminal",
      driverClientId: controllerClientId,
      isCurrentClientDriver,
      isDriverPresent,
      requiresHumanDecision: false,
      intent: null,
    };
  }
  if (
    battle.board.result !== null &&
    (presentation === null || !isCurrentClientDriver)
  ) {
    return {
      status: "terminal",
      driverClientId: controllerClientId,
      isCurrentClientDriver,
      isDriverPresent,
      requiresHumanDecision: false,
      intent: null,
    };
  }
  if (!isCurrentClientDriver) {
    return {
      status: "observer",
      driverClientId: controllerClientId,
      isCurrentClientDriver,
      isDriverPresent,
      requiresHumanDecision: false,
      intent: null,
    };
  }

  if (presentation !== null) {
    return {
      status: "driver",
      driverClientId: controllerClientId,
      isCurrentClientDriver: true,
      isDriverPresent: true,
      requiresHumanDecision: false,
      intent: {
        kind: "complete-presentation",
        presentationId: presentation.id,
        intentKey: parseIntentKey(
          `tutorial-battle:${battle.board.battleId}:presentation:${presentation.id}`,
        ),
        reason: presentation.kind,
      },
    };
  }
  if (battle.board.result !== null) {
    return {
      status: "terminal",
      driverClientId: controllerClientId,
      isCurrentClientDriver,
      isDriverPresent,
      requiresHumanDecision: false,
      intent: null,
    };
  }

  const prompt = battle.pendingPrompt;
  if (prompt !== null) {
    if (prompt.run.side === "player") {
      return {
        status: "driver",
        driverClientId: controllerClientId,
        isCurrentClientDriver: true,
        isDriverPresent: true,
        requiresHumanDecision: true,
        intent: null,
      };
    }
    return {
      status: "driver",
      driverClientId: controllerClientId,
      isCurrentClientDriver: true,
      isDriverPresent: true,
      requiresHumanDecision: false,
      intent: promptIntent(battle.board.battleId, prompt),
    };
  }

  const board = battle.board;
  const key = intentKeyPrefix(board);
  if (board.phase === "dawn") {
    if (battle.triggerDawnFired?.[board.activeSide] !== board.turnNumber) {
      return commandPlan(
        {
          id: "DEBUG_EDIT",
          edit: { kind: "SET_PHASE", phase: "dawn" },
          sourceSurface: "auto-system",
        },
        parseIntentKey(`${key}:dawn:triggers`),
        "resolve-dawn-triggers",
        controllerClientId,
      );
    }
    return commandPlan(
      {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase: "day" },
        sourceSurface: "auto-system",
      },
      parseIntentKey(`${key}:dawn:day`),
      "advance-dawn",
      controllerClientId,
    );
  }
  if (board.phase === "dreamwell") {
    if (
      drawsDreamwellCardAtStartOfTurn(board.turnNumber) &&
      board.sides[board.activeSide].dreamwellDrawnTurn !== board.turnNumber
    ) {
      return commandPlan(
        {
          id: "DEBUG_EDIT",
          edit: {
            kind: "DRAW_DREAMWELL_CARD",
            side: board.activeSide,
            turnNumber: board.turnNumber,
          },
          sourceSurface: "auto-system",
        },
        parseIntentKey(`${key}:dreamwell:reveal`),
        "reveal-dreamwell",
        controllerClientId,
      );
    }
    return commandPlan(
      {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase: "dawn" },
        sourceSurface: "auto-system",
      },
      parseIntentKey(`${key}:dreamwell:dawn`),
      "advance-dreamwell",
      controllerClientId,
    );
  }

  if (board.activeSide === "player") {
    if (board.phase === "day" || board.phase === "night") {
      return {
        status: "driver",
        driverClientId: controllerClientId,
        isCurrentClientDriver: true,
        isDriverPresent: true,
        requiresHumanDecision: true,
        intent: null,
      };
    }
    const aiBlockingAlreadyProcessed =
      battle.aiBlockingTurn?.activeSide === board.activeSide &&
      battle.aiBlockingTurn.turnNumber === board.turnNumber;
    if (board.phase === "dusk" && !aiBlockingAlreadyProcessed) {
      const blocking = planBlockingWithDecision(
        forwardModelFromState(board, "enemy"),
        { scoreToWin: battle.init.scoreToWin },
      );
      return {
        status: "driver",
        driverClientId: controllerClientId,
        isCurrentClientDriver: true,
        isDriverPresent: true,
        requiresHumanDecision: false,
        intent: {
          kind: "battle-ai-block",
          decision: blocking.decision,
          intentKey: parseIntentKey(`${key}:block`),
          reason: "enemy-block-player-challenge",
        },
      };
    }
    if (board.phase === "dusk") {
      return commandPlan(
        {
          id: "DEBUG_EDIT",
          edit: { kind: "SET_PHASE", phase: "night" },
          sourceSurface: "auto-system",
        },
        parseIntentKey(`${key}:night`),
        "advance-player-dusk",
        controllerClientId,
      );
    }
    return handoffPlan(input.state, "advance-player-no-choice-phase");
  }

  if (board.phase === "day") {
    const scriptedPlan = planTutorialAiActionOverride(battle);
    if (scriptedPlan.kind === "play-card") {
      const scripted = scriptedPlan.selection;
      const instance = board.cardInstances[scripted.battleCardId];
      if (instance === undefined) {
        throw new Error(
          `Tutorial AI override ${scripted.override.id} selected a missing battle card.`,
        );
      }
      const destination = scripted.characterDestination;
      const destinationSlotId = destination?.slotId ?? null;
      if (
        destination !== null &&
        (destination.side !== "enemy" ||
          destination.zone !== "backRank" ||
          destinationSlotId === null ||
          !isBackRankSlotId(destinationSlotId))
      ) {
        throw new Error(
          `Tutorial AI override ${scripted.override.id} selected an invalid enemy destination.`,
        );
      }
      const trace: BattleAiChoiceTrace = {
        stage:
          instance.definition.battleCardKind === "character"
            ? "character"
            : "nonCharacter",
        choice: "PLAY_CARD",
        battleCardId: scripted.battleCardId,
        cardName: instance.definition.name,
        sourceHandIndex: scripted.sourceHandIndex,
        sourceSlotId: null,
        targetSlotId: destinationSlotId,
        heuristicScoreBefore: null,
        heuristicScoreAfter: null,
        rationale: `Authored tutorial AI override ${scripted.override.id} matched Dreamwell card ${scripted.override.trigger.cardId}.`,
        targetBattleCardId: null,
      };
      return {
        status: "driver",
        driverClientId: controllerClientId,
        isCurrentClientDriver: true,
        isDriverPresent: true,
        requiresHumanDecision: false,
        intent: {
          kind: "battle-play-card",
          battleCardId: scripted.battleCardId,
          targetBattleCardIds: [],
          aiChoices: [trace],
          ...(destination === null
            ? {}
            : {
                characterDestination: {
                  side: "enemy",
                  zone: "backRank",
                  slotId: destinationSlotId as `B${number}`,
                },
              }),
          tutorialAiActionOverrideId: scripted.override.id,
          intentKey: parseIntentKey(
            `${key}:enemy-scripted-play:${scripted.override.id}`,
          ),
          reason: "enemy-scripted-day-play",
        },
      };
    }
    const aiActionOverrideMiss =
      scriptedPlan.kind === "blocked"
        ? {
            overrideId: scriptedPlan.override.id,
            triggerKind: scriptedPlan.override.trigger.kind,
            triggerCardId: scriptedPlan.override.trigger.cardId,
            actionKind: scriptedPlan.override.action.kind,
            actionCardId: scriptedPlan.override.action.cardId,
            reason: scriptedPlan.reason,
          }
        : undefined;
    const aiConfiguration = battle.init.aiConfiguration;
    const action = planNextAction(forwardModelFromState(board, "enemy"), {
      deadlineMs: Number.POSITIVE_INFINITY,
      nowMs: 0,
      expansionBudget: aiConfiguration.tutorialExpansionBudget,
      beamWidth: aiConfiguration.beamWidth,
      opponentMode: aiConfiguration.opponentMode,
      sampleCap: aiConfiguration.sampleCount,
      maxSearchDepth: aiConfiguration.searchDepth,
      scoreToWin: battle.init.scoreToWin,
      evaluation: aiConfiguration.evaluation,
      opponentModel: aiConfiguration.opponentModel,
      aiPresetId: aiConfiguration.id,
      rngSeed: tutorialPlannerSeed(board.battleId, board.turnNumber),
    });
    const trace = buildTrace(action);
    if (action.kind === "PLAY_CARD" && action.self !== undefined) {
      const targets =
        action.targets?.targetBattleCardId === null ||
        action.targets?.targetBattleCardId === undefined
          ? []
          : [action.targets.targetBattleCardId];
      const plannedSlot = action.toSlot;
      const characterDestination =
        plannedSlot !== undefined && isBackRankSlotId(plannedSlot)
          ? {
              side: "enemy" as const,
              zone: "backRank" as const,
              slotId: plannedSlot,
            }
          : undefined;
      return {
        status: "driver",
        driverClientId: controllerClientId,
        isCurrentClientDriver: true,
        isDriverPresent: true,
        requiresHumanDecision: false,
        intent: {
          kind: "battle-play-card",
          battleCardId: action.self.battleCardId,
          targetBattleCardIds: targets,
          aiChoices: [trace],
          ...(characterDestination === undefined
            ? {}
            : { characterDestination }),
          ...(aiActionOverrideMiss === undefined
            ? {}
            : { aiActionOverrideMiss }),
          intentKey: parseIntentKey(
            `${key}:enemy-play:${action.self.battleCardId}`,
          ),
          reason: "enemy-day-play",
        },
      };
    }
    if (action.kind === "MOVE_CARD") {
      const commands = actionToCommands(action, "enemy");
      return {
        status: "driver",
        driverClientId: controllerClientId,
        isCurrentClientDriver: true,
        isDriverPresent: true,
        requiresHumanDecision: false,
        intent: {
          kind: "battle-gesture",
          commands: commands.map((command, index) =>
            index === 0 ? { ...command, aiChoices: [trace] } : command,
          ),
          ...(aiActionOverrideMiss === undefined
            ? {}
            : { aiActionOverrideMiss }),
          intentKey: parseIntentKey(
            `${key}:enemy-move:${action.self?.battleCardId ?? parseBattleCardId("none")}:${action.toSlot ?? "none"}`,
          ),
          reason: "enemy-day-reposition",
        },
      };
    }
    return commandPlan(
      {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase: "dusk" },
        sourceSurface: "auto-system",
        aiChoices: [trace],
      },
      parseIntentKey(`${key}:enemy-day-complete`),
      "enemy-day-complete",
      controllerClientId,
      aiActionOverrideMiss,
    );
  }

  if (board.phase === "dusk" && enemyHasChallenger(input.state)) {
    return {
      status: "driver",
      driverClientId: controllerClientId,
      isCurrentClientDriver: true,
      isDriverPresent: true,
      requiresHumanDecision: true,
      intent: null,
    };
  }
  return handoffPlan(input.state, "advance-enemy-no-choice-phase");
}

function idlePlan(status: "not-tutorial"): TutorialBattleControllerPlan {
  return {
    status,
    driverClientId: null,
    isCurrentClientDriver: false,
    isDriverPresent: false,
    requiresHumanDecision: false,
    intent: null,
  };
}

function commandPlan(
  command: BattleCommand,
  intentKey: IntentKey,
  reason: TutorialAutomaticIntentReason,
  driverClientId: ClientId | null,
  aiActionOverrideMiss?: TutorialAiActionOverrideMiss,
): TutorialBattleControllerPlan {
  return {
    status: "driver",
    driverClientId,
    isCurrentClientDriver: true,
    isDriverPresent: true,
    requiresHumanDecision: false,
    intent: {
      kind: "battle-command",
      command,
      intentKey,
      reason,
      ...(aiActionOverrideMiss === undefined ? {} : { aiActionOverrideMiss }),
    },
  };
}

function handoffPlan(
  state: FoldState,
  reason: TutorialAutomaticIntentReason,
): TutorialBattleControllerPlan {
  const battle = state.battle;
  if (battle === null) return idlePlan("not-tutorial");
  const flowEdit = planHandoff({
    state: battle.board,
    scoreToWin: battle.init.scoreToWin,
    turnLimit: battle.init.turnLimit,
    maxEnergyCap: battle.init.maxEnergyCap,
  }).flowEdit;
  return commandPlan(
    { id: "DEBUG_EDIT", edit: flowEdit, sourceSurface: "auto-system" },
    parseIntentKey(`${intentKeyPrefix(battle.board)}:handoff`),
    reason,
    state.playtestControl?.controllerClientId ?? null,
  );
}

function promptIntent(
  battleId: BattleId,
  prompt: PendingPrompt,
): TutorialAutomaticIntent {
  return {
    kind: "resolve-prompt",
    promptId: prompt.promptId,
    resolution: deterministicPromptResolution(prompt),
    intentKey: parseIntentKey(
      `tutorial-battle:${battleId}:prompt:${String(prompt.promptId)}`,
    ),
    reason: `enemy-${prompt.options.kind}-prompt`,
  };
}

function deterministicPromptResolution(
  prompt: PendingPrompt,
): PromptResolution {
  switch (prompt.options.kind) {
    case "pick-cards":
      return {
        kind: "pick-cards",
        chosenIds: [...prompt.options.candidateIds]
          .sort()
          .slice(0, prompt.options.count),
      };
    case "choice":
      return { kind: "choice", optionIndex: 0 };
    case "foresee":
      return {
        kind: "foresee",
        viewedCardIds: [...prompt.options.cardIds.map(parseBattleCardId)],
        orderedCardIds: [...prompt.options.cardIds.map(parseBattleCardId)],
        voidCardIds: [],
      };
  }
}

function enemyHasChallenger(state: FoldState): boolean {
  const board = state.battle?.board;
  if (board === undefined) return false;
  return Object.values(board.sides.enemy.frontRank).some(
    (battleCardId) => battleCardId !== null,
  );
}

type TutorialBattleIntentKeyPrefix =
  `tutorial-battle:${BattleId}:${BattleSide}:${number}:${BattlePhase}`;

function intentKeyPrefix(board: {
  battleId: BattleId;
  activeSide: BattleSide;
  turnNumber: number;
  phase: BattlePhase;
}): TutorialBattleIntentKeyPrefix {
  return `tutorial-battle:${board.battleId}:${board.activeSide}:${board.turnNumber}:${board.phase}`;
}

function tutorialPlannerSeed(battleId: BattleId, turnNumber: number): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < battleId.length; index += 1) {
    hash ^= battleId.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash ^ Math.imul(turnNumber + 1, 2654435761)) >>> 0;
}
