import { useCallback, useMemo, useState } from "react";
import { logEvent } from "../logging";
import { useActions, useClientId, useConfirmedPromptId, useGameState } from "../coop/hooks";
import type { PromptResolution } from "../rules/battle/effect-runner-core";
import type { MobileBattleInteractions } from "../cumulus/screens/MobileBattleScreen";
import type { TutorialBattleControllerPlan } from "./tutorial-battle-controller";
import { selectBattleCardLocation, selectBattlefieldSlotOccupant } from "./state/selectors";
import {
  selectStarterCardLegalTargetIds,
  starterCardRequiresTarget,
} from "./starter-card-targets";

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
  const [targetingCardId, setTargetingCardId] = useState<string | null>(null);
  const battle = state.battle;
  const board = battle?.board ?? null;
  const canDrive = controller.status === "driver" && board !== null && board.result === null;
  const canAct = canDrive && controller.requiresHumanDecision;
  const eligibleSlotTargets = useMemo(() => {
    if (
      !canAct ||
      board === null ||
      pendingCard?.source !== "battlefield"
    ) {
      return [];
    }
    const instance = board.cardInstances[pendingCard.id];
    const source = selectBattleCardLocation(board, pendingCard.id);
    if (
      instance?.controller !== "player" ||
      instance.definition.battleCardKind !== "character" ||
      source?.side !== "player" ||
      (source.zone !== "backRank" && source.zone !== "frontRank")
    ) {
      return [];
    }
    const canUseBackRank =
      board.activeSide === "player" && board.phase === "day";
    const canUseFrontRank =
      (
        (board.activeSide === "player" && board.phase === "day") ||
        (board.activeSide === "enemy" && board.phase === "dusk")
      ) &&
      !instance.status.isExhausted;
    return [
      ...(canUseBackRank
        ? Object.keys(board.sides.player.backRank).map((slotId) => ({
            owner: "player" as const,
            rank: "back" as const,
            slotId,
          }))
        : []),
      ...(canUseFrontRank
        ? Object.keys(board.sides.player.frontRank).map((slotId) => ({
            owner: "player" as const,
            rank: "front" as const,
            slotId,
          }))
        : []),
    ];
  }, [board, canAct, pendingCard]);
  const targetableCardIds = useMemo(() => {
    if (board === null || targetingCardId === null) return [];
    return selectStarterCardLegalTargetIds(board, targetingCardId);
  }, [board, targetingCardId]);
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
    eligibleSlotTargets,
    targetSelectionCardId: targetingCardId,
    targetSelectionPrompt: targetingCardId === null ? null : "Select a highlighted legal target.",
    targetableCardIds,
    onHandCardActivate: (battleCardId) => {
      if (!canAct || board === null || board.activeSide !== "player" || board.phase !== "day") return;
      const definitionId = board.cardInstances[battleCardId]?.definition.cardId;
      if (definitionId !== undefined && starterCardRequiresTarget(definitionId)) {
        const legalTargetIds =
          selectStarterCardLegalTargetIds(board, battleCardId);
        if (legalTargetIds.length === 0) {
          logIntent("target-selection-unavailable", {
            battleCardId,
            definitionId,
            legalTargetCount: 0,
          });
          return;
        }
        setTargetingCardId(battleCardId);
        logIntent("target-selection-opened", {
          battleCardId,
          definitionId,
          legalTargetCount: legalTargetIds.length,
        });
        return;
      }
      logIntent("play-card", { battleCardId });
      void actions.battlePlayCard(
        battleCardId,
        [],
        `tutorial-battle:${board.battleId}:human-play:${String(board.turnNumber)}:${battleCardId}`,
      ).catch(() => undefined);
      setPendingCard(null);
    },
    onBattlefieldCardActivate: (targetBattleCardId) => {
      if (!canAct || board === null || targetingCardId === null) return;
      const source = board.cardInstances[targetingCardId];
      const target = board.cardInstances[targetBattleCardId];
      const location = target === undefined ? null : selectBattleCardLocation(board, targetBattleCardId);
      const onBattlefield = location?.zone === "frontRank" || location?.zone === "backRank";
      const legal = source !== undefined && target !== undefined &&
        onBattlefield &&
        selectStarterCardLegalTargetIds(board, targetingCardId)
          .includes(targetBattleCardId);
      if (!legal) {
        logIntent("target-selection-rejected", { battleCardId: targetingCardId, targetBattleCardId });
        return;
      }
      logIntent("target-selected", { battleCardId: targetingCardId, targetBattleCardId });
      void actions.battlePlayCard(targetingCardId, [targetBattleCardId], `tutorial-battle:${board.battleId}:human-play:${String(board.turnNumber)}:${targetingCardId}:${targetBattleCardId}`).catch(() => undefined);
      setTargetingCardId(null);
    },
    onTargetSelectionCancel: () => setTargetingCardId(null),
    onHandCardDrop: (target) => {
      const battleCardId =
        pendingCard?.source === "near-hand" ? pendingCard.id : null;
      if (!canAct || board === null || battleCardId === null) return;
      const instance = board.cardInstances[battleCardId];
      const location = selectBattleCardLocation(board, battleCardId);
      if (
        instance?.controller !== "player" ||
        location?.side !== "player" ||
        location.zone !== "hand" ||
        board.activeSide !== "player" ||
        board.phase !== "day"
      ) {
        setPendingCard(null);
        return;
      }
      const definitionId = instance.definition.cardId;
      if (starterCardRequiresTarget(definitionId)) {
        const legalTargetIds =
          selectStarterCardLegalTargetIds(board, battleCardId);
        if (legalTargetIds.length === 0) {
          logIntent("target-selection-unavailable", {
            battleCardId,
            definitionId,
            input: "drag",
            legalTargetCount: 0,
          });
          setPendingCard(null);
          return;
        }
        setTargetingCardId(battleCardId);
        logIntent("target-selection-opened", {
          battleCardId,
          definitionId,
          input: "drag",
          legalTargetCount: legalTargetIds.length,
          preferredSlot: target ?? null,
        });
        setPendingCard(null);
        return;
      }
      logIntent("play-card", {
        battleCardId,
        input: "drag",
        preferredSlot: target ?? null,
      });
      void actions.battlePlayCard(
        battleCardId,
        [],
        `tutorial-battle:${board.battleId}:human-play:${String(board.turnNumber)}:${battleCardId}`,
      ).catch(() => undefined);
      setPendingCard(null);
    },
    onCardDragStart: (battleCardId, source) => {
      if (!canAct || board === null) return;
      const instance = board.cardInstances[battleCardId];
      const location = selectBattleCardLocation(board, battleCardId);
      if (
        source === "near-hand" &&
        instance?.controller === "player" &&
        location?.side === "player" &&
        location.zone === "hand" &&
        board.activeSide === "player" &&
        board.phase === "day"
      ) {
        setPendingCard({ id: battleCardId, source });
        return;
      }
      if (source !== "battlefield") return;
      const isPlayerCharacterOnBattlefield = instance?.controller === "player" &&
        instance.definition.battleCardKind === "character" &&
        (location?.zone === "frontRank" || location?.zone === "backRank");
      const legalPhase = (board.activeSide === "player" && board.phase === "day") ||
        (board.activeSide === "enemy" && board.phase === "dusk");
      if (!isPlayerCharacterOnBattlefield || !legalPhase) return;
      setPendingCard({ id: battleCardId, source });
    },
    onCardDragEnd: () => setPendingCard(null),
    onSlotDrop: (target) => {
      const battleCardId = pendingCard?.id ?? null;
      if (!canAct || board === null || battleCardId === null) return;
      if (target.owner !== "player") return;
      const source = selectBattleCardLocation(board, battleCardId);
      const sourceInstance = board.cardInstances[battleCardId];
      const targetOccupant = selectBattlefieldSlotOccupant(board, {
        side: "player",
        zone: target.rank === "back" ? "backRank" : "frontRank",
        slotId: target.slotId as `B${number}` | `F${number}`,
      });
      const legalPhase = (board.activeSide === "player" && board.phase === "day") ||
        (board.activeSide === "enemy" && board.phase === "dusk" && target.rank === "front");
      if (
        source === null || sourceInstance?.controller !== "player" ||
        sourceInstance.definition.battleCardKind !== "character" ||
        (source.zone !== "backRank" && source.zone !== "frontRank") || !legalPhase
      ) return;
      if (targetOccupant !== null) {
        logIntent("swap-battlefield-slots", { battleCardId, target });
        void actions.battleCommand({
          id: "DEBUG_EDIT",
          edit: {
            kind: "SWAP_BATTLEFIELD_SLOTS",
            source: { side: "player", zone: source.zone, slotId: source.slotId },
            target: { side: "player", zone: target.rank === "back" ? "backRank" : "frontRank", slotId: target.slotId as `B${number}` | `F${number}` },
          },
          sourceSurface: "tutorial-player",
        }, `tutorial-battle:${board.battleId}:human-swap:${String(board.turnNumber)}:${battleCardId}:${target.slotId}`).catch(() => undefined);
        setPendingCard(null);
        return;
      }
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
  }), [actions, board, canAct, eligibleSlotTargets, logIntent, pendingCard, resolvePrompt, targetableCardIds, targetingCardId]);
  return { interactions, confirmedPromptId, resolvePrompt };
}
