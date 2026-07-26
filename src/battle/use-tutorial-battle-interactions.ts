import { useCallback, useMemo, useState } from "react";
import { logEvent } from "../logging";
import { useActions, useClientId, useConfirmedPromptId, useGameState } from "../coop/hooks";
import type { PromptResolution } from "../rules/battle/effect-runner-core";
import type { MobileBattleInteractions } from "../cumulus/screens/MobileBattleScreen";
import type { TutorialBattleControllerPlan } from "./tutorial-battle-controller";

/** Player-only intent bridge for the automated tutorial battle. */
export function useTutorialBattleInteractions(
  controller: TutorialBattleControllerPlan,
): {
  readonly interactions: MobileBattleInteractions;
  readonly confirmedPromptId: number | null;
  readonly resolvePrompt: (resolution: PromptResolution) => void;
} {
  const state = useGameState();
  const actions = useActions();
  const clientId = useClientId();
  const confirmedPromptId = useConfirmedPromptId();
  const [pendingCard, setPendingCard] = useState<{
    readonly id: string;
    readonly source: "near-hand" | "battlefield";
  } | null>(null);
  const battle = state.battle;
  const board = battle?.board ?? null;
  const canDrive = controller.status === "driver" && board !== null && board.result === null;
  const canAct = canDrive && controller.requiresHumanDecision;
  const logIntent = useCallback((kind: string, detail: Record<string, unknown> = {}) => {
    if (board === null) return;
    logEvent("tutorial_battle_human_intent_requested", {
      battleId: board.battleId,
      clientId,
      kind,
      activeSide: board.activeSide,
      phase: board.phase,
      turnNumber: board.turnNumber,
      ...detail,
    });
  }, [board, clientId]);
  const resolvePrompt = useCallback((resolution: PromptResolution): void => {
    const prompt = state.battle?.pendingPrompt ?? null;
    if (!canAct || prompt === null || confirmedPromptId !== prompt.promptId) return;
    logIntent("resolve-prompt", { promptId: prompt.promptId, resolution });
    void actions.resolvePrompt(
      prompt.promptId,
      resolution,
      `tutorial-battle:${state.battle?.board.battleId}:human-prompt:${String(prompt.promptId)}`,
    ).catch(() => undefined);
  }, [actions, canAct, confirmedPromptId, logIntent, state.battle]);
  const interactions = useMemo<MobileBattleInteractions>(() => ({
    canInteract: canAct,
    nearSide: "player",
    pendingCardId: pendingCard?.id ?? null,
    pendingCardSource: pendingCard?.source ?? null,
    pendingCardOwner: pendingCard === null ? null : "player",
    onHandCardActivate: (battleCardId) => {
      if (!canAct || board === null || board.activeSide !== "player" || board.phase !== "day") return;
      logIntent("play-card", { battleCardId });
      void actions.battlePlayCard(
        battleCardId,
        [],
        `tutorial-battle:${board.battleId}:human-play:${String(board.turnNumber)}:${battleCardId}`,
      ).catch(() => undefined);
      setPendingCard(null);
    },
    onHandCardDrop: () => setPendingCard(null),
    onCardDragStart: (battleCardId, source) => {
      if (!canAct) return;
      if (source === "near-hand" && board?.activeSide === "player" && board.phase === "day") {
        setPendingCard({ id: battleCardId, source });
        return;
      }
      if (source === "battlefield" && board?.activeSide === "enemy" && board.phase === "dusk") {
        setPendingCard({ id: battleCardId, source });
      }
    },
    onCardDragEnd: () => setPendingCard(null),
    onSlotDrop: (target) => {
      const battleCardId = pendingCard?.id ?? null;
      if (!canAct || board === null || battleCardId === null) return;
      if (target.owner !== "player") return;
      logIntent("move-card", { battleCardId, target });
      void actions.battleCommand({
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId,
          destination: {
            side: "player",
            zone: target.rank === "back" ? "backRank" : "frontRank",
            slotId: target.slotId as `B${number}` | `F${number}`,
          },
        },
        sourceSurface: "tutorial-player",
      }, `tutorial-battle:${board.battleId}:human-move:${String(board.turnNumber)}:${battleCardId}:${target.slotId}`).catch(() => undefined);
      setPendingCard(null);
    },
    onZoneDrop: () => setPendingCard(null),
    onPreviousPhase: () => {},
    onNextPhase: () => {
      if (!canAct || board === null) return;
      const phase = board.activeSide === "enemy" && board.phase === "dusk" ? "night" : "dusk";
      logIntent(phase === "night" ? "done-blocking" : "end-turn");
      void actions.battleCommand({
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase },
        sourceSurface: "tutorial-player",
      }, `tutorial-battle:${board.battleId}:human-phase:${String(board.turnNumber)}:${board.activeSide}:${phase}`).catch(() => undefined);
    },
    onCardPickerSubmit: (chosenIds) => resolvePrompt({ kind: "pick-cards", chosenIds: [...chosenIds] }),
    onCardPickerSkip: () => resolvePrompt({ kind: "pick-cards", chosenIds: [] }),
    onChoicePromptChoose: (optionIndex) => resolvePrompt({ kind: "choice", optionIndex }),
  }), [actions, board, canAct, logIntent, pendingCard, resolvePrompt]);
  return { interactions, confirmedPromptId, resolvePrompt };
}
