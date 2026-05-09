import "../battle.css";

import type {
  MouseEvent as ReactMouseEvent,
  MouseEvent as ReactPointerMouseEvent,
  ReactNode,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SiteState } from "../../types/quest";
import {
  createBattleLogBaseFields,
  logBattleCommandApplied,
  logEventOnce,
} from "../../logging";
import { useQuest } from "../../state/quest-context";
import { useMultiplayerBattle } from "../../state/multiplayer-battle-context";
import { dispatchBattleReset } from "../../multiplayer/battle-service";
import type { SharedBattleState } from "../../multiplayer/battle-types";
import { completeBattleSiteVictory } from "../integration/battle-completion-bridge";
import { beginQuestFailureRoute } from "../integration/failure-route";
import { evaluateBattleResult } from "../engine/result";
import { emitBattleTransitionLogEvents } from "../state/reducer";
import { formatBattleCardId } from "../state/create-initial-state";
import {
  selectBattleCardLocation,
  selectBattlefieldSlotOccupant,
  selectCanEndTurn,
  selectCanTakeMainPhaseActions,
  selectFailureOverlayResult,
  selectIsOpponentHandCardHidden,
} from "../state/selectors";
import { useAiTurnDriver } from "../state/use-ai-turn-driver";
import { useAutoClearForcedResult } from "../state/use-auto-clear-forced-result";
import { formatPhaseLabel, formatSideLabel } from "../ui/format";
import type {
  BattleCardKind,
  BattleCommandSourceSurface,
  BattleFieldSlotAddress,
  BattleJudgmentResolution,
  BattleMutableState,
  BattleReducerState,
  BattleSelection,
  BattleSide,
  BrowseableZone,
} from "../types";
import type { BattleCommand } from "../debug/commands";
import { BattleActionBar } from "./BattleActionBar";
import { BattleCardHoverPreview } from "./BattleCardHoverPreview";
import { BattleContextMenu } from "./BattleContextMenu";
import { BattleDeckOrderPicker } from "./BattleDeckOrderPicker";
import { BattleDreamcallerPanel } from "./BattleDreamcallerPanel";
import { BattleFigmentCreator } from "./BattleFigmentCreator";
import { BattleForeseeOverlay } from "./BattleForeseeOverlay";
import { BattleHandTray } from "./BattleHandTray";
import { BattleInspector } from "./BattleInspector";
import { BattleCardNoteEditor } from "./BattleCardNoteEditor";
import { BattleLogDrawer } from "./BattleLogDrawer";
import { BattleJudgmentPauseOverlay } from "./BattleJudgmentPauseOverlay";
import { BattleResultOverlay } from "./BattleResultOverlay";
import { BattleRewardSurface } from "./BattleRewardSurface";
import { BattleSideSummaryPopover } from "./BattleSideSummaryPopover";
import { BattleStatusBar } from "./BattleStatusBar";
import { BattleStatusStrip } from "./BattleStatusStrip";
import { BattlefieldGrid, resolveBattlefieldSelectionAnchor } from "./BattlefieldGrid";
import { BattleZoneBrowser } from "./BattleZoneBrowser";

const DESKTOP_INSPECTOR_WIDTH = 1280;

type ZoneBrowserState = { side: BattleSide; zone: BrowseableZone } | null;
type RewardOverlayState = {
  rewardSource: string;
  selectedRewardIndex: number | null;
  locked: boolean;
} | null;
type ContextMenuState = {
  battleCardId: string;
  sourceSurface: BattleCommandSourceSurface;
  x: number;
  y: number;
} | null;
type ForeseeOverlayState = {
  count: number;
  side: BattleSide;
} | null;
type PendingDragState = {
  battleCardId: string;
  kind: BattleCardKind;
} | null;
type HoverPreviewState = {
  battleCardId: string;
  x: number;
  y: number;
} | null;
type JudgmentPauseState = {
  dissolvedCardNames: readonly string[];
  judgment: BattleJudgmentResolution;
  result: BattleMutableState["result"];
  scoreChanges: readonly {
    delta: number;
    side: BattleSide;
  }[];
  turnNumber: number;
} | null;

export function PlayableBattleScreen({ site }: { site: SiteState }) {
  const { battleState, reducerState } = useMultiplayerBattle();
  if (battleState === null || reducerState === null) {
    return null; // BattleSiteRoute already shows the loading state.
  }
  return <PlayableBattleScreenInner site={site} />;
}

function PlayableBattleScreenInner({ site }: { site: SiteState }) {
  const {
    battleState: maybeBattleState,
    reducerState: maybeReducerState,
    dispatch,
    database,
    roomId,
    clientId,
  } = useMultiplayerBattle();
  if (maybeBattleState === null || maybeReducerState === null) {
    throw new Error(
      "PlayableBattleScreenInner reached without a non-null battleState. The wrapper component should have short-circuited.",
    );
  }
  const battleState: SharedBattleState = maybeBattleState;
  const reducerState: BattleReducerState = maybeReducerState;
  const battleInit = battleState.init;
  const initialState = battleState.reducer.mutable;
  if (battleInit.battleId !== initialState.battleId) {
    throw new Error(
      `PlayableBattleScreen battleInit/initialState battleId mismatch: ${battleInit.battleId} vs ${initialState.battleId}`,
    );
  }

  const { state: questState, mutations, cardDatabase } = useQuest();
  const isDesktopInspectorLayout = useIsDesktopInspectorLayout();
  const [isInspectorDrawerOpen, setIsInspectorDrawerOpen] = useState(readIsDesktopInspectorLayout());
  const [isBattleLogOpen, setIsBattleLogOpen] = useState(false);
  const [openZoneBrowser, setOpenZoneBrowser] = useState<ZoneBrowserState>(null);
  const [selection, setSelection] = useState<BattleSelection>(null);
  const [pendingDrag, setPendingDrag] = useState<PendingDragState>(null);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [openForeseeOverlay, setOpenForeseeOverlay] = useState<ForeseeOverlayState>(null);
  const [openDeckOrderPicker, setOpenDeckOrderPicker] = useState<BattleSide | null>(null);
  const [openFigmentCreator, setOpenFigmentCreator] = useState<BattleSide | null>(null);
  const [openNoteEditor, setOpenNoteEditor] = useState<string | null>(null);
  const [openSideSummary, setOpenSideSummary] = useState<BattleSide | null>(null);
  const [isDreamcallerPanelOpen, setIsDreamcallerPanelOpen] = useState(false);
  const [rewardOverlay, setRewardOverlay] = useState<RewardOverlayState>(null);
  const [isResultOverlayDismissed, setIsResultOverlayDismissed] = useState(false);
  const [judgmentPause, setJudgmentPause] = useState<JudgmentPauseState>(null);
  const [turnBannerTurnNumber, setTurnBannerTurnNumber] = useState<number | null>(
    initialState.activeSide === "player" ? initialState.turnNumber : null,
  );
  const loggedCommandSerialRef = useRef(0);
  const judgmentPauseSerialRef = useRef(0);
  const isInteractionLocked = judgmentPause !== null;
  const canEndTurn = rewardOverlay === null && !isInteractionLocked && selectCanEndTurn(reducerState.mutable);
  const canPlayerAct = rewardOverlay === null && !isInteractionLocked &&
    selectCanTakeMainPhaseActions(reducerState.mutable, "player");
  const historyCount = reducerState.history.past.length;
  const futureCount = reducerState.history.future.length;
  const failureResult = selectFailureOverlayResult(reducerState.mutable.result);
  const showRewardOverlay = reducerState.mutable.result === "victory" && rewardOverlay !== null;
  const showResultOverlay = reducerState.mutable.result !== null &&
    !isResultOverlayDismissed &&
    !isInteractionLocked;
  const showReopenPill = reducerState.mutable.result !== null &&
    isResultOverlayDismissed &&
    !isInteractionLocked;
  useAutoClearForcedResult(reducerState, battleInit, dispatch);
  useAiTurnDriver(reducerState, dispatch, battleInit.enableAi);

  useEffect(() => {
    const serial = battleState.reducer.commandSerial;
    if (serial === loggedCommandSerialRef.current) {
      return;
    }
    loggedCommandSerialRef.current = serial;

    if (reducerState.lastTransition !== null) {
      emitBattleTransitionLogEvents(reducerState.lastTransition);
    }
    const lastEntry = reducerState.history.past[reducerState.history.past.length - 1];
    if (lastEntry !== undefined) {
      logBattleCommandApplied(lastEntry.metadata, reducerState.mutable);
    }
  }, [battleState.reducer.commandSerial, reducerState]);

  const inspectorSelection = (
    selection?.kind === "card" &&
    selectIsOpponentHandCardHidden(reducerState.mutable, selection.battleCardId)
  )
    ? null
    : selection;
  const battlefieldSelectionAnchor = useMemo(
    () => resolveBattlefieldSelectionAnchor(
      reducerState.mutable,
      inspectorSelection?.kind === "card" ? inspectorSelection.battleCardId : null,
      inspectorSelection?.kind === "slot" ? inspectorSelection.target : null,
    ),
    [inspectorSelection, reducerState.mutable],
  );
  const handSelectionSide: BattleSide | null = inspectorSelection?.kind === "card"
    ? selectBattleCardLocation(reducerState.mutable, inspectorSelection.battleCardId)?.zone === "hand"
      ? selectBattleCardLocation(reducerState.mutable, inspectorSelection.battleCardId)?.side ?? null
      : null
    : null;

  function canPlayHandCardWithoutOverride(battleCardId: string): boolean {
    const location = selectBattleCardLocation(reducerState.mutable, battleCardId);
    const card = reducerState.mutable.cardInstances[battleCardId];

    return location?.side === "player" &&
      location.zone === "hand" &&
      card !== undefined &&
      reducerState.mutable.sides.player.currentEnergy >= card.definition.energyCost;
  }

  function handleCommand(command: BattleCommand): void {
    const mintedCardId = peekMintedBattleCardId(command, reducerState.mutable);
    setPendingDrag(null);
    setHoverPreview(null);
    dispatch({ type: "APPLY_COMMAND", command });
    if (mintedCardId !== null) {
      setSelection({ kind: "card", battleCardId: mintedCardId });
      setIsInspectorDrawerOpen(true);
    }
  }

  useEffect(() => {
    const baseFields = createBattleLogBaseFields(reducerState.mutable, {
      sourceSurface: "auto-system",
      selectedCardId: null,
    });
    logEventOnce(`battle_proto_init:${battleInit.battleId}`, "battle_proto_init", {
      ...baseFields,
      battleEntryKey: battleInit.battleEntryKey,
      enemyName: battleInit.enemyDescriptor.name,
      seed: battleInit.seed,
      siteId: battleInit.siteId,
    });
    logEventOnce(
      `battle_proto_opening_hands:${battleInit.battleId}`,
      "battle_proto_opening_hands",
      {
        ...baseFields,
        enemyHand: initialState.sides.enemy.hand.map(
          (battleCardId) => initialState.cardInstances[battleCardId]?.definition.name ?? "Card",
        ),
        enemyHandSize: initialState.sides.enemy.hand.length,
        openingHandSize: battleInit.openingHandSize,
        playerHand: initialState.sides.player.hand.map(
          (battleCardId) => initialState.cardInstances[battleCardId]?.definition.name ?? "Card",
        ),
      },
    );
  }, [battleInit.battleId, battleInit.battleEntryKey, battleInit.enemyDescriptor.name, battleInit.openingHandSize, battleInit.seed, battleInit.siteId, initialState.cardInstances, initialState.sides.enemy.hand, initialState.sides.player.hand, reducerState.mutable]);

  useEffect(() => {
    if (reducerState.mutable.result === null) {
      setRewardOverlay(null);
      setIsResultOverlayDismissed(false);
      return;
    }

    if (reducerState.mutable.result === "victory" && rewardOverlay === null) {
      setRewardOverlay({
        rewardSource: reducerState.lastTransition?.metadata.commandId ?? "battle_result",
        selectedRewardIndex: null,
        locked: false,
      });
      setOpenZoneBrowser(null);
      setContextMenu(null);
      setOpenForeseeOverlay(null);
      setOpenDeckOrderPicker(null);
      setOpenFigmentCreator(null);
      setOpenNoteEditor(null);
      setOpenSideSummary(null);
      setIsDreamcallerPanelOpen(false);
      setIsBattleLogOpen(false);
      return;
    }

    setOpenZoneBrowser(null);
    setContextMenu(null);
    setOpenForeseeOverlay(null);
    setOpenDeckOrderPicker(null);
    setOpenFigmentCreator(null);
    setOpenNoteEditor(null);
    setOpenSideSummary(null);
    setIsDreamcallerPanelOpen(false);
  }, [reducerState.lastTransition, reducerState.mutable.result, rewardOverlay]);

  useEffect(() => {
    const serial = battleState.reducer.commandSerial;
    if (serial === judgmentPauseSerialRef.current) {
      return;
    }
    judgmentPauseSerialRef.current = serial;

    const nextJudgmentPause = readJudgmentPause(reducerState);
    if (nextJudgmentPause === null) {
      return;
    }

    setJudgmentPause(nextJudgmentPause);
    setOpenZoneBrowser(null);
    setContextMenu(null);
    setOpenForeseeOverlay(null);
    setOpenDeckOrderPicker(null);
    setOpenFigmentCreator(null);
    setOpenNoteEditor(null);
    setOpenSideSummary(null);
    setIsDreamcallerPanelOpen(false);
    setIsBattleLogOpen(false);
    setHoverPreview(null);
  }, [battleState.reducer.commandSerial, reducerState]);

  useEffect(() => {
    if (selection?.kind !== "card") {
      return;
    }
    if (
      selectBattleCardLocation(reducerState.mutable, selection.battleCardId) === null ||
      selectIsOpponentHandCardHidden(reducerState.mutable, selection.battleCardId)
    ) {
      setSelection(null);
      setHoverPreview((current) => current?.battleCardId === selection.battleCardId ? null : current);
    }
  }, [reducerState.mutable, selection]);

  useEffect(() => {
    if (!isDesktopInspectorLayout) {
      return;
    }
    setIsInspectorDrawerOpen(true);
  }, [isDesktopInspectorLayout]);

  useEffect(() => {
    if (reducerState.mutable.result !== null || reducerState.mutable.activeSide !== "player") {
      setTurnBannerTurnNumber(null);
      return;
    }

    setTurnBannerTurnNumber(reducerState.mutable.turnNumber);
    const timeoutId = window.setTimeout(() => {
      setTurnBannerTurnNumber((current) =>
        current === reducerState.mutable.turnNumber ? null : current
      );
    }, 1000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [reducerState.mutable.activeSide, reducerState.mutable.result, reducerState.mutable.turnNumber]);

  function handleHandCardClick(battleCardId: string): void {
    setSelection({ kind: "card", battleCardId });
    setIsInspectorDrawerOpen(true);
    setContextMenu(null);
  }

  function handleHandCardDoubleClick(battleCardId: string): void {
    if (!canPlayerAct || !canPlayHandCardWithoutOverride(battleCardId)) {
      return;
    }
    setSelection({ kind: "card", battleCardId });
    setIsInspectorDrawerOpen(true);
    handleCommand({
      id: "PLAY_CARD",
      battleCardId,
      sourceSurface: "hand-tray",
    });
  }

  function handleBattlefieldCardClick(battleCardId: string): void {
    setSelection({ kind: "card", battleCardId });
    setIsInspectorDrawerOpen(true);
    setContextMenu(null);
  }

  function handleBattlefieldSlotClick(target: BattleFieldSlotAddress, isOccupied: boolean): void {
    if (target.side === "player" && canPlayerAct && handleSelectedBattlefieldTargetClick(target, !isOccupied)) {
      return;
    }
    setSelection({ kind: "slot", target });
    setIsInspectorDrawerOpen(true);
    setContextMenu(null);
  }

  function handleSelectedBattlefieldTargetClick(
    target: BattleFieldSlotAddress,
    allowPlayCard: boolean,
  ): boolean {
    if (selection === null || selection.kind !== "card") {
      return false;
    }

    const location = selectBattleCardLocation(reducerState.mutable, selection.battleCardId);
    if (allowPlayCard && location?.zone === "hand" && location.side === target.side) {
      if (!canPlayHandCardWithoutOverride(selection.battleCardId)) {
        return false;
      }
      handleCommand({
        id: "PLAY_CARD",
        battleCardId: selection.battleCardId,
        target,
        sourceSurface: "battlefield",
      });
      return true;
    }

    if (location?.side === target.side && (location.zone === "reserve" || location.zone === "deployed")) {
      if (location.zone !== target.zone) {
        handleCommand({
          id: "MOVE_CARD",
          battleCardId: selection.battleCardId,
          target,
          sourceSurface: "battlefield",
        });
        return true;
      }

      if (location.slotId === target.slotId) {
        return false;
      }

      const targetOccupant = selectBattlefieldSlotOccupant(reducerState.mutable, target);
      if (targetOccupant !== null) {
        handleCommand({
          id: "DEBUG_EDIT",
          edit: {
            kind: "SWAP_BATTLEFIELD_SLOTS",
            source: {
              side: location.side,
              zone: location.zone,
              slotId: location.slotId,
            },
            target,
          },
          sourceSurface: "battlefield",
        });
        return true;
      }

      handleCommand({
        id: "MOVE_CARD",
        battleCardId: selection.battleCardId,
        target,
        sourceSurface: "battlefield",
      });
      return true;
    }

    return false;
  }

  function handleOpenZoneBrowser(side: BattleSide, zone: BrowseableZone): void {
    setOpenZoneBrowser({ side, zone });
    setContextMenu(null);
    setOpenSideSummary(null);
  }

  function handleFailureReset(): void {
    if (failureResult === null) {
      return;
    }
    const evaluation = evaluateBattleResult(reducerState.mutable, battleInit);
    beginQuestFailureRoute({
      battleInit: {
        battleId: battleInit.battleId,
        siteId: battleInit.siteId,
        dreamscapeId: battleInit.dreamscapeId,
      },
      mutableState: {
        turnNumber: reducerState.mutable.turnNumber,
        sides: reducerState.mutable.sides,
      },
      result: failureResult,
      reason: evaluation.reason ?? "forced_result",
      siteLabel: site.type,
      mutations,
    });
  }

  function handleResetBattle(): void {
    setSelection(null);
    setPendingDrag(null);
    setHoverPreview(null);
    setOpenZoneBrowser(null);
    setContextMenu(null);
    setOpenForeseeOverlay(null);
    setOpenDeckOrderPicker(null);
    setOpenFigmentCreator(null);
    setOpenNoteEditor(null);
    setOpenSideSummary(null);
    setIsDreamcallerPanelOpen(false);
    setRewardOverlay(null);
    setIsResultOverlayDismissed(false);
    setJudgmentPause(null);
    setIsBattleLogOpen(false);

    void dispatchBattleReset({
      database,
      roomId,
      actorId: clientId,
    }).catch((error: unknown) => {
      console.error("Failed to reset battle", error);
    });
  }

  function handleChooseReward(index: number): void {
    setRewardOverlay((current) => current === null
      ? null
      : { ...current, selectedRewardIndex: index });
  }

  function handleConfirmReward(selectedRewardIndex = rewardOverlay?.selectedRewardIndex ?? null): void {
    if (rewardOverlay === null || selectedRewardIndex === null || rewardOverlay.locked) {
      return;
    }
    const selectedRewardCard = battleInit.rewardOptions[selectedRewardIndex];
    if (selectedRewardCard === undefined) {
      return;
    }
    setRewardOverlay((current) => current === null
      ? null
      : { ...current, locked: true, selectedRewardIndex });
    completeBattleSiteVictory({
      battleId: battleInit.battleId,
      siteId: battleInit.siteId,
      dreamscapeId: battleInit.dreamscapeId,
      completionLevelAtBattleStart: battleInit.completionLevelAtStart,
      atlasSnapshot: battleInit.atlasSnapshot,
      selectedRewardCard,
      essenceReward: battleInit.essenceReward,
      isMiniboss: battleInit.isMiniboss,
      isFinalBoss: battleInit.isFinalBoss,
      playerHasBanes:
        questState.deck.some((entry) => entry.isBane) ||
        questState.dreamsigns.some((dreamsign) => dreamsign.isBane),
      mutations,
      postVictoryHandoffDelayMs: 800,
    });
  }

  function handleSelectSummary(side: BattleSide): void {
    if (openSideSummary === side) {
      setSelection(null);
      setOpenSideSummary(null);
      return;
    }
    setSelection({ kind: "side-summary", side });
    setOpenSideSummary(side);
    setContextMenu(null);
  }

  function handleCardContextMenu(
    battleCardId: string,
    event: ReactMouseEvent<HTMLDivElement>,
    sourceSurface: BattleCommandSourceSurface,
  ): void {
    event.preventDefault();
    setSelection({ kind: "card", battleCardId });
    setContextMenu({
      battleCardId,
      sourceSurface,
      x: event.clientX,
      y: event.clientY,
    });
    setOpenSideSummary(null);
    setIsInspectorDrawerOpen(true);
  }

  function handleCardDragStart(battleCardId: string): void {
    const location = selectBattleCardLocation(reducerState.mutable, battleCardId);
    const instance = reducerState.mutable.cardInstances[battleCardId];
    if (location?.side === "player" && location.zone === "hand" && !canPlayHandCardWithoutOverride(battleCardId)) {
      setSelection({ kind: "card", battleCardId });
      setIsInspectorDrawerOpen(true);
      setContextMenu(null);
      return;
    }
    if (instance !== undefined) {
      setPendingDrag({
        battleCardId,
        kind: instance.definition.battleCardKind,
      });
    }
    setSelection({ kind: "card", battleCardId });
    setContextMenu(null);
  }

  function handleSlotDrop(target: BattleFieldSlotAddress): void {
    if (pendingDrag?.kind === "event") {
      handleCommand({
        id: "PLAY_CARD",
        battleCardId: pendingDrag.battleCardId,
        sourceSurface: "battlefield",
      });
      setPendingDrag(null);
      return;
    }
    handleSelectedBattlefieldTargetClick(target, true);
    setPendingDrag(null);
  }

  function handleBattlefieldCardHoverStart(
    battleCardId: string,
    event: ReactPointerMouseEvent<HTMLDivElement>,
  ): void {
    setHoverPreview({
      battleCardId,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleBattlefieldCardHoverMove(
    battleCardId: string,
    event: ReactPointerMouseEvent<HTMLDivElement>,
  ): void {
    setHoverPreview((current) => current?.battleCardId === battleCardId
      ? {
        battleCardId,
        x: event.clientX,
        y: event.clientY,
      }
      : current);
  }

  function handleBattlefieldCardHoverEnd(): void {
    setHoverPreview(null);
  }

  return (
    <div
      className="battle-shell"
      data-battle-inspector-open={isInspectorDrawerOpen ? "true" : "false"}
    >
      {openZoneBrowser !== null ? (
        <BattleZoneBrowser
          browser={openZoneBrowser}
          state={reducerState.mutable}
          selectedBattleCardId={inspectorSelection?.kind === "card" ? inspectorSelection.battleCardId : null}
          onClose={() => setOpenZoneBrowser(null)}
          onCommand={handleCommand}
          onOpenForesee={(side, count) => setOpenForeseeOverlay({ side, count })}
          onOpenReorderMultiple={(side) => setOpenDeckOrderPicker(side)}
          onSelectBattleCard={(battleCardId) => {
            setSelection({ kind: "card", battleCardId });
            setIsInspectorDrawerOpen(true);
          }}
          onCardContextMenu={handleCardContextMenu}
        />
      ) : null}
      {openForeseeOverlay !== null ? (
        <BattleForeseeOverlay
          initialCount={openForeseeOverlay.count}
          side={openForeseeOverlay.side}
          state={reducerState.mutable}
          onClose={() => setOpenForeseeOverlay(null)}
          onDispatch={handleCommand}
        />
      ) : null}
      {openDeckOrderPicker !== null ? (
        <BattleDeckOrderPicker
          initialOrder={reducerState.mutable.sides[openDeckOrderPicker].deck}
          scopeLabel="full"
          side={openDeckOrderPicker}
          state={reducerState.mutable}
          onCancel={() => setOpenDeckOrderPicker(null)}
          onConfirm={(order) => {
            handleCommand({
              id: "DEBUG_EDIT",
              edit: {
                kind: "REORDER_DECK",
                order,
                side: openDeckOrderPicker,
              },
              sourceSurface: "deck-order-picker",
            });
            setOpenDeckOrderPicker(null);
          }}
        />
      ) : null}
      {openFigmentCreator !== null ? (
        <BattleFigmentCreator
          cardDatabase={cardDatabase}
          initialSide={openFigmentCreator}
          state={reducerState.mutable}
          onClose={() => setOpenFigmentCreator(null)}
          onSubmit={(edit) => handleCommand({
            id: "DEBUG_EDIT",
            edit,
            sourceSurface: "figment-creator",
          })}
        />
      ) : null}
      {openNoteEditor !== null ? (
        <BattleCardNoteEditor
          battleCardId={openNoteEditor}
          state={reducerState.mutable}
          onClose={() => setOpenNoteEditor(null)}
          onSubmit={(edit) => handleCommand({
            id: "DEBUG_EDIT",
            edit,
            sourceSurface: "note-editor",
          })}
        />
      ) : null}
      {openSideSummary !== null ? (
        <BattleSideSummaryPopover
          side={openSideSummary}
          state={reducerState.mutable}
          title={openSideSummary === "player"
            ? battleInit.dreamcallerSummary?.name ?? "Player"
            : battleInit.enemyDescriptor.name}
          subtitle={openSideSummary === "player"
            ? battleInit.dreamcallerSummary?.title ?? ""
            : battleInit.enemyDescriptor.subtitle}
          isActive={reducerState.mutable.activeSide === openSideSummary}
          isSelected={selection?.kind === "side-summary" && selection.side === openSideSummary}
          isPlayerInfoAvailable={battleInit.dreamcallerSummary !== null || battleInit.dreamsignSummaries.length > 0}
          onClose={() => {
            setOpenSideSummary(null);
            if (selection?.kind === "side-summary") {
              setSelection(null);
            }
          }}
          onCommand={handleCommand}
          onOpenFigmentCreator={(side) => setOpenFigmentCreator(side)}
          onOpenPlayerInfo={() => setIsDreamcallerPanelOpen(true)}
          onOpenZone={handleOpenZoneBrowser}
        />
      ) : null}
      {isDreamcallerPanelOpen ? (
        <BattleDreamcallerPanel
          dreamcaller={battleInit.dreamcallerSummary}
          dreamsigns={battleInit.dreamsignSummaries}
          onClose={() => setIsDreamcallerPanelOpen(false)}
        />
      ) : null}
      <div className="battle-app-shell">
        <div className="battle-main">
          {turnBannerTurnNumber !== null ? (
            <BattleTurnBanner turnNumber={turnBannerTurnNumber} />
          ) : null}
          <BattleStatusBar
            activeSide={reducerState.mutable.activeSide}
            battleId={battleInit.battleId}
            enemyName={battleInit.enemyDescriptor.name}
            enemyScore={reducerState.mutable.sides.enemy.score}
            futureCount={futureCount}
            hasAiOpponent
            historyCount={historyCount}
            phase={reducerState.mutable.phase}
            playerScore={reducerState.mutable.sides.player.score}
            result={reducerState.mutable.result}
            roundNumber={reducerState.mutable.turnNumber}
            siteType={site.type}
          />
          <BattleLiveRegion
            activeSide={reducerState.mutable.activeSide}
            phase={reducerState.mutable.phase}
            result={reducerState.mutable.result}
            turnNumber={reducerState.mutable.turnNumber}
          />
          <div className="stage">
            <BattleStatusStrip
              side="enemy"
              sideState={reducerState.mutable.sides.enemy}
              state={reducerState.mutable}
              subtitle={battleInit.enemyDescriptor.subtitle}
              title={battleInit.enemyDescriptor.name}
              isActive={reducerState.mutable.activeSide === "enemy"}
              isSummarySelected={openSideSummary === "enemy"}
              onOpenZone={(zone) => handleOpenZoneBrowser("enemy", zone)}
              onSelectSummary={() => handleSelectSummary("enemy")}
            />
            <ScaledBattlefield>
              <div
                className="battlefield"
                onDragOver={(event) => {
                  if (pendingDrag?.kind === "event") {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => {
                  if (pendingDrag?.kind !== "event") {
                    return;
                  }
                  event.preventDefault();
                  handleCommand({
                    id: "PLAY_CARD",
                    battleCardId: pendingDrag.battleCardId,
                    sourceSurface: "battlefield",
                  });
                  setPendingDrag(null);
                }}
              >
                <BattlefieldGrid
                  side="enemy"
                  zone="reserve"
                  state={reducerState.mutable}
                  canInteract
                  selectedCardId={inspectorSelection?.kind === "card" ? inspectorSelection.battleCardId : null}
                  selectedSlot={inspectorSelection?.kind === "slot" ? inspectorSelection.target : null}
                  selectionAnchor={battlefieldSelectionAnchor}
                  handSelectionSide={handSelectionSide}
                  pendingDragCardId={pendingDrag?.battleCardId ?? null}
                  pendingDragCardKind={pendingDrag?.kind ?? null}
                  onCardClick={handleBattlefieldCardClick}
                  onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                  onCardDragStart={handleCardDragStart}
                  onCardDragEnd={() => setPendingDrag(null)}
                  onCardHoverStart={handleBattlefieldCardHoverStart}
                  onCardHoverMove={handleBattlefieldCardHoverMove}
                  onCardHoverEnd={handleBattlefieldCardHoverEnd}
                  onSlotClick={handleBattlefieldSlotClick}
                  onSlotDrop={handleSlotDrop}
                />
                <BattlefieldGrid
                  side="enemy"
                  zone="deployed"
                  state={reducerState.mutable}
                  canInteract
                  selectedCardId={inspectorSelection?.kind === "card" ? inspectorSelection.battleCardId : null}
                  selectedSlot={inspectorSelection?.kind === "slot" ? inspectorSelection.target : null}
                  selectionAnchor={battlefieldSelectionAnchor}
                  handSelectionSide={handSelectionSide}
                  pendingDragCardId={pendingDrag?.battleCardId ?? null}
                  pendingDragCardKind={pendingDrag?.kind ?? null}
                  onCardClick={handleBattlefieldCardClick}
                  onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                  onCardDragStart={handleCardDragStart}
                  onCardDragEnd={() => setPendingDrag(null)}
                  onCardHoverStart={handleBattlefieldCardHoverStart}
                  onCardHoverMove={handleBattlefieldCardHoverMove}
                  onCardHoverEnd={handleBattlefieldCardHoverEnd}
                  onSlotClick={handleBattlefieldSlotClick}
                  onSlotDrop={handleSlotDrop}
                />
                <div
                  data-battle-region="judgment-divider"
                  className={`judgment-divider ${reducerState.mutable.phase === "judgment" ? "active" : ""}`}
                />
                <BattlefieldGrid
                  side="player"
                  zone="deployed"
                  state={reducerState.mutable}
                  canInteract={canPlayerAct}
                  selectedCardId={inspectorSelection?.kind === "card" ? inspectorSelection.battleCardId : null}
                  selectedSlot={inspectorSelection?.kind === "slot" ? inspectorSelection.target : null}
                  selectionAnchor={battlefieldSelectionAnchor}
                  handSelectionSide={handSelectionSide}
                  pendingDragCardId={pendingDrag?.battleCardId ?? null}
                  pendingDragCardKind={pendingDrag?.kind ?? null}
                  onCardClick={handleBattlefieldCardClick}
                  onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                  onCardDragStart={handleCardDragStart}
                  onCardDragEnd={() => setPendingDrag(null)}
                  onCardHoverStart={handleBattlefieldCardHoverStart}
                  onCardHoverMove={handleBattlefieldCardHoverMove}
                  onCardHoverEnd={handleBattlefieldCardHoverEnd}
                  onSlotClick={handleBattlefieldSlotClick}
                  onSlotDrop={handleSlotDrop}
                />
                <BattlefieldGrid
                  side="player"
                  zone="reserve"
                  state={reducerState.mutable}
                  canInteract={canPlayerAct}
                  selectedCardId={inspectorSelection?.kind === "card" ? inspectorSelection.battleCardId : null}
                  selectedSlot={inspectorSelection?.kind === "slot" ? inspectorSelection.target : null}
                  selectionAnchor={battlefieldSelectionAnchor}
                  handSelectionSide={handSelectionSide}
                  pendingDragCardId={pendingDrag?.battleCardId ?? null}
                  pendingDragCardKind={pendingDrag?.kind ?? null}
                  onCardClick={handleBattlefieldCardClick}
                  onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                  onCardDragStart={handleCardDragStart}
                  onCardDragEnd={() => setPendingDrag(null)}
                  onCardHoverStart={handleBattlefieldCardHoverStart}
                  onCardHoverMove={handleBattlefieldCardHoverMove}
                  onCardHoverEnd={handleBattlefieldCardHoverEnd}
                  onSlotClick={handleBattlefieldSlotClick}
                  onSlotDrop={handleSlotDrop}
                />
              </div>
            </ScaledBattlefield>
            <BattleStatusStrip
              side="player"
              sideState={reducerState.mutable.sides.player}
              state={reducerState.mutable}
              subtitle={battleInit.dreamcallerSummary?.title ?? ""}
              title={battleInit.dreamcallerSummary?.name ?? "Player"}
              isActive={reducerState.mutable.activeSide === "player"}
              isSummarySelected={openSideSummary === "player"}
              onOpenZone={(zone) => handleOpenZoneBrowser("player", zone)}
              onSelectSummary={() => handleSelectSummary("player")}
            />
          </div>
          <BattleHandTray
            canInteract={canPlayerAct}
            currentEnergy={reducerState.mutable.sides.player.currentEnergy}
            hand={reducerState.mutable.sides.player.hand}
            onHandCardAction={handleCommand}
            openingHandSize={battleInit.openingHandSize}
            playerDrawSkipsTurnOne={battleInit.playerDrawSkipsTurnOne}
            selectedCardId={inspectorSelection?.kind === "card" ? inspectorSelection.battleCardId : null}
            state={reducerState.mutable}
            onCardClick={handleHandCardClick}
            onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "hand-tray")}
            onCardDoubleClick={handleHandCardDoubleClick}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={() => setPendingDrag(null)}
          />
          <BattleActionBar
            canEndTurn={canEndTurn}
            futureCount={futureCount}
            historyCount={historyCount}
            isInteractionLocked={isInteractionLocked}
            isBattleLogOpen={isBattleLogOpen}
            isDesktopInspectorLayout={isDesktopInspectorLayout}
            isInspectorDrawerOpen={isInspectorDrawerOpen}
            state={reducerState.mutable}
            onCommand={handleCommand}
            onOpenForesee={(_side, _count) => undefined}
            onRedo={() => dispatch({ type: "REDO" })}
            onToggleBattleLog={() => setIsBattleLogOpen((value) => !value)}
            onToggleInspector={() => setIsInspectorDrawerOpen((value) => !value)}
            onUndo={() => dispatch({ type: "UNDO" })}
          />
        </div>
        <BattleInspector
          battleInit={battleInit}
          canPlayerAct={canPlayerAct}
          futureCount={futureCount}
          historyCount={historyCount}
          isDesktopLayout={isDesktopInspectorLayout}
          isOpen={isInspectorDrawerOpen}
          lastTransition={reducerState.lastTransition}
          selection={inspectorSelection}
          state={reducerState.mutable}
          onClearSelection={() => setSelection(null)}
          onClose={() => setIsInspectorDrawerOpen(false)}
          onOpen={() => setIsInspectorDrawerOpen(true)}
          onCommand={handleCommand}
          onOpenFigmentCreator={(side) => setOpenFigmentCreator(side)}
          onOpenForesee={(side, count) => setOpenForeseeOverlay({ side, count })}
          onOpenNoteEditor={(battleCardId) => setOpenNoteEditor(battleCardId)}
          onOpenZone={handleOpenZoneBrowser}
          onResetBattle={handleResetBattle}
          onRedo={() => dispatch({ type: "REDO" })}
          onSelectBattleCard={(battleCardId) => setSelection({ kind: "card", battleCardId })}
          onUndo={() => dispatch({ type: "UNDO" })}
        />
      </div>
      {contextMenu !== null ? (
        <BattleContextMenu
          battleCardId={contextMenu.battleCardId}
          onOpenNoteEditor={(battleCardId) => setOpenNoteEditor(battleCardId)}
          sourceSurface={contextMenu.sourceSurface}
          state={reducerState.mutable}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCommand={handleCommand}
          onInspect={(battleCardId) => {
            setSelection({ kind: "card", battleCardId });
            setIsInspectorDrawerOpen(true);
          }}
        />
      ) : null}
      {hoverPreview !== null
        ? (() => {
          const hoverCard = reducerState.mutable.cardInstances[hoverPreview.battleCardId];
          return hoverCard === undefined
            ? null
            : (
              <BattleCardHoverPreview
                card={hoverCard}
                pointer={{ x: hoverPreview.x, y: hoverPreview.y }}
              />
            );
        })()
        : null}
      <BattleLogDrawer
        battleInit={battleInit}
        futureCount={futureCount}
        history={reducerState.history}
        isOpen={isBattleLogOpen}
        lastTransition={reducerState.lastTransition}
        onClose={() => setIsBattleLogOpen(false)}
      />
      {judgmentPause !== null ? (
        <BattleJudgmentPauseOverlay
          dissolvedCardNames={judgmentPause.dissolvedCardNames}
          judgment={judgmentPause.judgment}
          result={judgmentPause.result}
          scoreChanges={judgmentPause.scoreChanges}
          turnNumber={judgmentPause.turnNumber}
          onContinue={() => setJudgmentPause(null)}
        />
      ) : null}
      {showResultOverlay ? (
        reducerState.mutable.result === "victory" && rewardOverlay !== null ? (
          <BattleRewardSurface
            battleId={battleInit.battleId}
            canCancel={!rewardOverlay.locked}
            enemyName={battleInit.enemyDescriptor.name}
            essenceReward={battleInit.essenceReward}
            enemyScore={reducerState.mutable.sides.enemy.score}
            playerScore={reducerState.mutable.sides.player.score}
            rewardCards={battleInit.rewardOptions}
            rewardSource={rewardOverlay.rewardSource}
            selectedRewardIndex={rewardOverlay.selectedRewardIndex}
            turnNumber={reducerState.mutable.turnNumber}
            onCancel={() => setIsResultOverlayDismissed(true)}
            onSelectReward={(index) => {
              handleChooseReward(index);
              handleConfirmReward(index);
            }}
          />
        ) : (
          <BattleResultOverlay
            result={reducerState.mutable.result!}
            rewardCards={showRewardOverlay ? battleInit.rewardOptions : undefined}
            selectedRewardIndex={rewardOverlay?.selectedRewardIndex ?? null}
            rewardLocked={rewardOverlay?.locked ?? false}
            onChooseReward={handleChooseReward}
            onConfirmReward={handleConfirmReward}
            onDismissInspect={() => setIsResultOverlayDismissed(true)}
            onReset={handleFailureReset}
          />
        )
      ) : null}
      {showReopenPill ? (
        <button
          type="button"
          data-battle-action="reopen-result"
          className="result-reopen-pill"
          onClick={() => setIsResultOverlayDismissed(false)}
        >
          {reducerState.mutable.result} — reopen
        </button>
      ) : null}
    </div>
  );
}

// In multiplayer the shared reducer slice does not carry `lastActivity`
// (per the V2 design spec), so the judgment-pause overlay fires whenever a
// new commandSerial yields a transition with a non-null `judgment`. This
// includes undoing or redoing into a snapshot whose `lastTransition`
// captured a judgment, by design.
function readJudgmentPause(
  reducerState: BattleReducerState,
): JudgmentPauseState {
  const lastTransition = reducerState.lastTransition;

  if (lastTransition === null || lastTransition.judgment === null) {
    return null;
  }

  return {
    dissolvedCardNames: readJudgmentDissolvedCardNames(reducerState),
    judgment: lastTransition.judgment,
    result: reducerState.mutable.result,
    scoreChanges: lastTransition.scoreChanges.map((change) => ({
      delta: change.delta,
      side: change.side,
    })),
    turnNumber: reducerState.mutable.turnNumber,
  };
}

function readJudgmentDissolvedCardNames(
  reducerState: BattleReducerState,
): readonly string[] {
  const lastEntry = reducerState.history.past[reducerState.history.past.length - 1];

  if (lastEntry === undefined) {
    return [];
  }

  const dissolvedCardIds: string[] = [];
  for (const slotId of ["D0", "D1", "D2", "D3"] as const) {
    const playerBefore = lastEntry.before.mutable.sides.player.deployed[slotId];
    if (playerBefore !== null && lastEntry.after.mutable.sides.player.deployed[slotId] === null) {
      dissolvedCardIds.push(playerBefore);
    }
    const enemyBefore = lastEntry.before.mutable.sides.enemy.deployed[slotId];
    if (enemyBefore !== null && lastEntry.after.mutable.sides.enemy.deployed[slotId] === null) {
      dissolvedCardIds.push(enemyBefore);
    }
  }

  return dissolvedCardIds.map(
    (battleCardId) => lastEntry.before.mutable.cardInstances[battleCardId]?.definition.name ?? battleCardId,
  );
}

function BattleLiveRegion({
  activeSide,
  phase,
  result,
  turnNumber,
}: {
  activeSide: BattleSide;
  phase: BattleMutableState["phase"];
  result: BattleMutableState["result"];
  turnNumber: number;
}) {
  const [announcement, setAnnouncement] = useState("");
  const lastAnnouncementRef = useRef<{
    activeSide: BattleSide;
    phase: BattleMutableState["phase"];
    result: BattleMutableState["result"];
    turnNumber: number;
  } | null>(null);

  useEffect(() => {
    const previous = lastAnnouncementRef.current;
    if (
      previous !== null &&
      previous.turnNumber === turnNumber &&
      previous.activeSide === activeSide &&
      previous.phase === phase &&
      previous.result === result
    ) {
      return;
    }
    lastAnnouncementRef.current = { activeSide, phase, result, turnNumber };
    if (result !== null) {
      setAnnouncement(`Battle ${result}`);
      return;
    }
    setAnnouncement(`${formatSideLabel(activeSide)} Turn ${String(turnNumber)} ${formatPhaseLabel(phase)}`);
  }, [activeSide, phase, result, turnNumber]);

  return (
    <div aria-atomic="true" aria-live="polite" className="sr-only">
      {announcement}
    </div>
  );
}

function BattleTurnBanner({ turnNumber }: { turnNumber: number }) {
  return (
    <div className="battle-turn-banner" aria-hidden="true">
      <span className="battle-turn-banner-label">Your Turn</span>
      <strong>Turn {String(turnNumber)}</strong>
    </div>
  );
}

function ScaledBattlefield({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function fit(): void {
      const wrap = wrapRef.current;
      const inner = innerRef.current;
      if (wrap === null || inner === null) {
        return;
      }
      inner.style.transform = "none";
      const naturalWidth = inner.scrollWidth;
      const naturalHeight = inner.scrollHeight;
      if (naturalWidth === 0 || naturalHeight === 0) {
        return;
      }
      const scale = Math.min(1, wrap.clientWidth / naturalWidth, wrap.clientHeight / naturalHeight);
      inner.style.transform = `scale(${String(scale)})`;
    }

    fit();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", fit);
      return () => {
        window.removeEventListener("resize", fit);
      };
    }

    const resizeObserver = new ResizeObserver(fit);
    if (wrapRef.current !== null) {
      resizeObserver.observe(wrapRef.current);
    }
    if (innerRef.current !== null) {
      resizeObserver.observe(innerRef.current);
    }
    window.addEventListener("resize", fit);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <div className="bf-wrap" ref={wrapRef}>
      <div className="bf-inner" ref={innerRef}>
        {children}
      </div>
    </div>
  );
}

function useIsDesktopInspectorLayout(): boolean {
  const [isDesktopLayout, setIsDesktopLayout] = useState(readIsDesktopInspectorLayout);

  useEffect(() => {
    function handleResize(): void {
      setIsDesktopLayout(readIsDesktopInspectorLayout());
    }
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return isDesktopLayout;
}

function readIsDesktopInspectorLayout(): boolean {
  return typeof window !== "undefined" && window.innerWidth >= DESKTOP_INSPECTOR_WIDTH;
}

function peekMintedBattleCardId(
  command: BattleCommand,
  state: BattleMutableState,
): string | null {
  if (command.id !== "DEBUG_EDIT") {
    return null;
  }
  if (command.edit.kind !== "CREATE_CARD_COPY" && command.edit.kind !== "CREATE_FIGMENT") {
    return null;
  }
  return formatBattleCardId(state.nextBattleCardOrdinal);
}
