import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logEvent } from "../logging";
import {
  useActions,
  useClientId,
  useConfirmedGameState,
  useConfirmedHead,
  useConfirmedPromptId,
  useEventOutcomes,
  useGameState,
} from "../coop/hooks";
import type { PromptResolution } from "../rules/battle/effect-runner-core";
import type {
  MobileBattleDropResolution,
  MobileBattleInteractions,
  MobileBattleSlotTarget,
} from "../cumulus/screens/MobileBattleScreen";
import type { TutorialBattleControllerPlan } from "./tutorial-battle-controller";
import { selectBattleCardLocation, selectBattlefieldSlotOccupant } from "./state/selectors";
import {
  selectStarterCardLegalTargetIds,
  starterCardRequiresTarget,
} from "./starter-card-targets";
import { planTutorialCharacterReposition } from "../rules/battle/tutorial-reposition";

const MOVEMENT_STATUS_DURATION_MS = 4_000;

interface PendingMovementOutcome {
  readonly kind: "move-card" | "swap-battlefield-slots";
  readonly attemptId: string;
  readonly battleCardId: string;
  readonly definitionId: string | null;
  readonly source: {
    readonly side: "player";
    readonly zone: "backRank" | "frontRank";
    readonly slotId: string;
  };
  readonly target: MobileBattleSlotTarget;
}

interface MovementFoldReceipt extends PendingMovementOutcome {
  readonly seq: number;
  readonly outcome: "applied" | "bounced";
}

function eventMatchesPendingMovement(
  payload: unknown,
  pending: PendingMovementOutcome,
): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as {
    readonly battleCardId?: unknown;
    readonly destination?: {
      readonly side?: unknown;
      readonly zone?: unknown;
      readonly slotId?: unknown;
    };
  };
  const expectedZone =
    pending.target.rank === "back" ? "backRank" : "frontRank";
  return candidate.battleCardId === pending.battleCardId &&
    candidate.destination?.side === "player" &&
    candidate.destination.zone === expectedZone &&
    candidate.destination.slotId === pending.target.slotId;
}

/** Player-only intent bridge for the automated tutorial battle. */
export function useTutorialBattleInteractions(
  controller: TutorialBattleControllerPlan,
): {
  readonly interactions: MobileBattleInteractions;
  readonly confirmedPromptId: number | null;
  readonly movementStatusMessage: string | null;
  readonly dismissMovementStatus: () => void;
  readonly resolvePrompt: (resolution: PromptResolution) => void;
} {
  const state = useGameState();
  const confirmedState = useConfirmedGameState();
  const confirmedHead = useConfirmedHead();
  const actions = useActions();
  const clientId = useClientId();
  const confirmedPromptId = useConfirmedPromptId();
  const [pendingCard, setPendingCard] = useState<
    | {
        readonly id: string;
        readonly source: "near-hand";
      }
    | {
        readonly id: string;
        readonly source: "battlefield";
        readonly attemptId: string;
        readonly sourceTarget: MobileBattleSlotTarget;
      }
    | null
  >(null);
  const [targetingCardId, setTargetingCardId] = useState<string | null>(null);
  const [movementStatusMessage, setMovementStatusMessage] =
    useState<string | null>(null);
  const movementAttemptSequence = useRef(0);
  const pendingMovementOutcomes = useRef<PendingMovementOutcome[]>([]);
  const [movementFoldReceipt, setMovementFoldReceipt] =
    useState<MovementFoldReceipt | null>(null);
  const battle = state.battle;
  const board = battle?.board ?? null;
  const canDrive = controller.status === "driver" && board !== null && board.result === null;
  const canAct = canDrive && controller.requiresHumanDecision;
  useEventOutcomes((event, seq, outcome) => {
    if (
      event.type !== "BATTLE_REPOSITION_CHARACTER" ||
      event.actor !== clientId
    ) {
      return;
    }
    const pendingIndex = pendingMovementOutcomes.current.findIndex(
      (pending) => eventMatchesPendingMovement(event.payload, pending),
    );
    if (pendingIndex < 0) return;
    const [pending] = pendingMovementOutcomes.current.splice(pendingIndex, 1);
    if (pending === undefined) return;
    logEvent("tutorial_battle_human_move_event_outcome", {
      battleId: board?.battleId ?? null,
      clientId,
      ...pending,
      committedSeq: seq,
      outcome,
    });
    setMovementFoldReceipt({ ...pending, seq, outcome });
  });
  useEffect(() => {
    if (
      movementFoldReceipt === null ||
      confirmedHead === null ||
      confirmedHead < movementFoldReceipt.seq
    ) {
      return;
    }
    const confirmedBoard = confirmedState.battle?.board ?? null;
    const foldedLocation =
      confirmedBoard === null
        ? null
        : selectBattleCardLocation(
            confirmedBoard,
            movementFoldReceipt.battleCardId,
          );
    const expectedZone =
      movementFoldReceipt.target.rank === "back" ? "backRank" : "frontRank";
    const foldedAtTarget =
      foldedLocation?.side === movementFoldReceipt.target.owner &&
      foldedLocation.zone === expectedZone &&
      foldedLocation.slotId === movementFoldReceipt.target.slotId;
    logEvent("tutorial_battle_human_move_folded", {
      battleId: confirmedBoard?.battleId ?? null,
      clientId,
      ...movementFoldReceipt,
      committedSeq: movementFoldReceipt.seq,
      confirmedHead,
      foldedLocation,
      foldedAtTarget,
      rejectionReason:
        movementFoldReceipt.outcome === "bounced"
          ? "event-bounced"
          : foldedAtTarget
            ? null
            : "folded-location-mismatch",
    });
    setMovementFoldReceipt(null);
  }, [clientId, confirmedHead, confirmedState, movementFoldReceipt]);
  const dismissMovementStatus = useCallback(
    () => setMovementStatusMessage(null),
    [],
  );
  useEffect(() => {
    if (movementStatusMessage === null) return;
    const timeout = window.setTimeout(
      dismissMovementStatus,
      MOVEMENT_STATUS_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [dismissMovementStatus, movementStatusMessage]);
  const isSlotDropEligible = useCallback((target: MobileBattleSlotTarget) => {
    if (
      !canAct ||
      board === null ||
      pendingCard?.source !== "battlefield"
    ) {
      return false;
    }
    return planTutorialCharacterReposition(
      board,
      pendingCard.id,
      {
        side: target.owner,
        zone: target.rank === "back" ? "backRank" : "frontRank",
        slotId: target.slotId as `B${number}` | `F${number}`,
      },
    ) !== null;
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
  const submitUnavailableTargetAttempt = useCallback((
    battleCardId: string,
    definitionId: string,
    input: "click" | "drag",
  ): void => {
    if (board === null) return;
    logIntent("target-selection-unavailable", {
      battleCardId,
      definitionId,
      input,
      legalTargetCount: 0,
    });
    void actions.battlePlayCard(
      battleCardId,
      [],
      `tutorial-battle:${board.battleId}:no-valid-targets:${battleCardId}`,
    ).catch(() => undefined);
  }, [actions, board, logIntent]);
  const submitMovement = useCallback((
    kind: "move-card" | "swap-battlefield-slots",
    attemptId: string,
    battleCardId: string,
    source: {
      readonly side: "player";
      readonly zone: "backRank" | "frontRank";
      readonly slotId: string;
    },
    target: MobileBattleSlotTarget,
  ): void => {
    if (board === null) return;
    const definitionId =
      board.cardInstances[battleCardId]?.definition.cardId ?? null;
    const detail = {
      attemptId,
      battleCardId,
      definitionId,
      source,
      target,
    };
    const pendingOutcome: PendingMovementOutcome = {
      kind,
      ...detail,
    };
    pendingMovementOutcomes.current.push(pendingOutcome);
    setMovementStatusMessage(null);
    logIntent(kind, detail);
    void actions.battleRepositionCharacter(battleCardId, {
      side: "player",
      zone: target.rank === "back" ? "backRank" : "frontRank",
      slotId: target.slotId,
    }).then((committedSeq) => {
      logEvent("tutorial_battle_human_move_submitted", {
        battleId: board.battleId,
        clientId,
        activeSide: board.activeSide,
        phase: board.phase,
        turnNumber: board.turnNumber,
        kind,
        ...detail,
        committedSeq,
      });
    }).catch((error: unknown) => {
      pendingMovementOutcomes.current =
        pendingMovementOutcomes.current.filter(
          (pending) => pending.attemptId !== attemptId,
        );
      const message = "Movement failed to send. Try again.";
      setMovementStatusMessage(message);
      logEvent("tutorial_battle_human_move_submission_failed", {
        battleId: board.battleId,
        clientId,
        activeSide: board.activeSide,
        phase: board.phase,
        turnNumber: board.turnNumber,
        kind,
        ...detail,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, [actions, board, clientId, logIntent]);
  const reportMovementRejection = useCallback((
    reason:
      | "battlefield-unavailable"
      | "invalid-release-point"
      | "no-eligible-slot"
      | "ineligible-slot"
      | "source-slot",
    clientX: number,
    clientY: number,
  ): void => {
    if (board === null) return;
    const battleCardId = pendingCard?.source === "battlefield"
      ? pendingCard.id
      : null;
    const instance =
      battleCardId === null ? undefined : board.cardInstances[battleCardId];
    const source =
      battleCardId === null
        ? null
        : selectBattleCardLocation(board, battleCardId);
    const message =
      (reason === "no-eligible-slot" || reason === "ineligible-slot") &&
      instance?.status.isExhausted === true &&
      board.activeSide === "enemy" &&
      board.phase === "dusk"
        ? "This character is exhausted and cannot move to the front rank."
        : "No legal battlefield cell is available for this movement.";
    const attemptId =
      pendingCard?.source === "battlefield"
        ? pendingCard.attemptId
        : [
            clientId,
            board.battleId,
            "movement",
            "untracked",
          ].join(":");
    setMovementStatusMessage(message);
    logEvent("tutorial_battle_human_move_rejected", {
      battleId: board.battleId,
      clientId,
      activeSide: board.activeSide,
      phase: board.phase,
      turnNumber: board.turnNumber,
      attemptId,
      battleCardId,
      definitionId: instance?.definition.cardId ?? null,
      source,
      reason,
      releasePoint: { clientX, clientY },
      sourceTarget:
        pendingCard?.source === "battlefield"
          ? pendingCard.sourceTarget
          : null,
      message,
    });
  }, [board, clientId, pendingCard]);
  const logMovementDropResolution = useCallback((
    resolution: MobileBattleDropResolution,
  ): void => {
    if (
      board === null ||
      pendingCard?.source !== "battlefield"
    ) {
      return;
    }
    logEvent("tutorial_battle_human_drop_resolved", {
      battleId: board.battleId,
      clientId,
      activeSide: board.activeSide,
      phase: board.phase,
      turnNumber: board.turnNumber,
      attemptId: pendingCard.attemptId,
      battleCardId: pendingCard.id,
      definitionId:
        board.cardInstances[pendingCard.id]?.definition.cardId ?? null,
      source: pendingCard.sourceTarget,
      releasePoint: resolution.releasePoint,
      placementPoint: resolution.placementPoint,
      candidates: resolution.candidates,
      chosenTarget: resolution.chosenTarget,
      strategy: resolution.strategy,
    });
  }, [board, clientId, pendingCard]);
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
    isSlotDropEligible,
    sourceSlotTarget:
      pendingCard?.source === "battlefield"
        ? pendingCard.sourceTarget
        : null,
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
          submitUnavailableTargetAttempt(
            battleCardId,
            definitionId,
            "click",
          );
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
          submitUnavailableTargetAttempt(
            battleCardId,
            definitionId,
            "drag",
          );
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
        characterDestination: target ?? null,
      });
      void actions.battlePlayCard(
        battleCardId,
        [],
        `tutorial-battle:${board.battleId}:human-play:${String(board.turnNumber)}:${battleCardId}`,
        undefined,
        undefined,
        target === undefined
          ? undefined
          : {
              side: "player",
              zone: "backRank",
              slotId: target.slotId,
            },
      ).catch(() => undefined);
      setPendingCard(null);
    },
    onCardDragStart: (battleCardId, source) => {
      if (!canAct || board === null) return;
      setMovementStatusMessage(null);
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
      movementAttemptSequence.current += 1;
      const attemptId = [
        clientId,
        board.battleId,
        "movement",
        String(movementAttemptSequence.current),
      ].join(":");
      setPendingCard({
        id: battleCardId,
        source,
        attemptId,
        sourceTarget: {
          owner: "player",
          rank: location.zone === "backRank" ? "back" : "front",
          slotId: location.slotId,
        },
      });
    },
    onCardDragEnd: () => setPendingCard(null),
    onBattlefieldDropRejected: ({ reason, clientX, clientY }) => {
      reportMovementRejection(reason, clientX, clientY);
    },
    onBattlefieldDropResolved: (resolution) => {
      logMovementDropResolution(resolution);
    },
    onSlotDrop: (target) => {
      const battleCardId = pendingCard?.id ?? null;
      if (!canAct || board === null || battleCardId === null) return;
      const movementAttemptId =
        pendingCard?.source === "battlefield"
          ? pendingCard.attemptId
          : `${clientId}:${board.battleId}:movement:untracked`;
      if (target.owner !== "player") return;
      const source = selectBattleCardLocation(board, battleCardId);
      const targetOccupant = selectBattlefieldSlotOccupant(board, {
        side: "player",
        zone: target.rank === "back" ? "backRank" : "frontRank",
        slotId: target.slotId as `B${number}` | `F${number}`,
      });
      if (
        source === null ||
        (source.zone !== "backRank" && source.zone !== "frontRank") ||
        !isSlotDropEligible(target)
      ) return;
      if (targetOccupant !== null) {
        submitMovement(
          "swap-battlefield-slots",
          movementAttemptId,
          battleCardId,
          {
            side: "player",
            zone: source.zone,
            slotId: source.slotId,
          },
          target,
        );
        setPendingCard(null);
        return;
      }
      submitMovement(
        "move-card",
        movementAttemptId,
        battleCardId,
        {
          side: "player",
          zone: source.zone,
          slotId: source.slotId,
        },
        target,
      );
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
  }), [actions, board, canAct, clientId, isSlotDropEligible, logIntent, logMovementDropResolution, pendingCard, reportMovementRejection, resolvePrompt, submitMovement, submitUnavailableTargetAttempt, targetableCardIds, targetingCardId]);
  return {
    interactions,
    confirmedPromptId,
    movementStatusMessage,
    dismissMovementStatus,
    resolvePrompt,
  };
}
