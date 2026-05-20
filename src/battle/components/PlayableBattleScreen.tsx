import "../battle.css";

import type {
  MouseEvent as ReactMouseEvent,
  MouseEvent as ReactPointerMouseEvent,
  ReactNode,
} from "react";
import { useEffect, useRef, useState } from "react";
import type { SiteState } from "../../types/quest";
import {
  createBattleLogBaseFields,
  logBattleCommandApplied,
  logEventOnce,
} from "../../logging";
import { useQuest } from "../../state/quest-context";
import { useMultiplayerBattle } from "../../state/multiplayer-battle-context";
import { dispatchBattleReset, dispatchClearBattleState } from "../../multiplayer/battle-service";
import type { SharedBattleState } from "../../multiplayer/battle-types";
import { completeBattleSiteVictory } from "../integration/battle-completion-bridge";
import { beginQuestFailureRoute } from "../integration/failure-route";
import { emitBattleTransitionLogEvents } from "../state/reducer";
import {
  selectBattleCardLocation,
  selectBattlefieldSlotOccupant,
  selectFailureOverlayResult,
} from "../state/selectors";
import { formatPhaseLabel, formatSideLabel } from "../ui/format";
import type {
  BattleCommandSourceSurface,
  BattleFieldSlotAddress,
  BattleMutableState,
  BattleReducerState,
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
import { BattleOpponentHandTray } from "./BattleOpponentHandTray";
import { BattleResultOverlay } from "./BattleResultOverlay";
import { BattleRewardSurface } from "./BattleRewardSurface";
import { BattleSideSummaryPopover } from "./BattleSideSummaryPopover";
import { BattleStatusBar } from "./BattleStatusBar";
import { BattleStatusStrip } from "./BattleStatusStrip";
import { BattleCardView, battleCardVisualFromInstance } from "./BattleCardView";
import { BattlefieldGrid } from "./BattlefieldGrid";
import { BattleZoneBrowser } from "./BattleZoneBrowser";
import {
  createMoveCardToBattlefieldCommand,
  createMoveCardToDeckCommand,
  createMoveCardToStackCommand,
  createMoveCardToZoneCommand,
} from "./battle-ui-commands";

const DESKTOP_INSPECTOR_WIDTH = 1280;

type ZoneBrowserState = { side: BattleSide; zone: BrowseableZone } | null;
type RewardOverlayState = {
  rewardSource: string;
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
  sourceSurface: BattleCommandSourceSurface;
} | null;
type HoverPreviewState = {
  battleCardId: string;
  x: number;
  y: number;
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
  const [isOpponentHandRevealed, setIsOpponentHandRevealed] = useState(false);
  const [openZoneBrowser, setOpenZoneBrowser] = useState<ZoneBrowserState>(null);
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
  const loggedCommandSerialRef = useRef(0);
  const canPlayerAct = true;
  const historyCount = reducerState.history.past.length;
  const futureCount = reducerState.history.future.length;
  const failureResult = selectFailureOverlayResult(reducerState.mutable.result);
  const showResultOverlay = reducerState.mutable.result !== null &&
    !isResultOverlayDismissed;
  const showReopenPill = reducerState.mutable.result !== null &&
    isResultOverlayDismissed;

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

  function handleCommand(command: BattleCommand): void {
    setPendingDrag(null);
    setHoverPreview(null);
    dispatch({ type: "APPLY_COMMAND", command });
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
    setIsOpponentHandRevealed(false);
  }, [battleInit.battleId]);

  useEffect(() => {
    if (!isDesktopInspectorLayout) {
      return;
    }
    setIsInspectorDrawerOpen(true);
  }, [isDesktopInspectorLayout]);

  function handleHandCardClick(_battleCardId: string): void {
    setContextMenu(null);
  }

  function handleHandCardDoubleClick(battleCardId: string): void {
    const side = selectBattleCardLocation(reducerState.mutable, battleCardId)?.side ?? "player";
    const command = createMoveCardToBattlefieldCommand(
      reducerState.mutable,
      battleCardId,
      side,
      "hand-tray",
    );
    if (command !== null) {
      handleCommand(command);
    }
  }

  function handleBattlefieldCardClick(_battleCardId: string): void {
    setContextMenu(null);
  }

  function handleBattlefieldSlotClick(_target: BattleFieldSlotAddress, _isOccupied: boolean): void {
    setContextMenu(null);
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
      reason: "forced_result",
      siteLabel: site.type,
      mutations,
      clearBattleStateForRoom: () => {
        void dispatchClearBattleState({
          database,
          roomId,
        }).catch((error: unknown) => {
          console.error("Failed to clear battle slot", error);
        });
      },
    });
  }

  function handleResetBattle(): void {
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
    setIsOpponentHandRevealed(false);
    setIsResultOverlayDismissed(false);
    setIsBattleLogOpen(false);

    void dispatchBattleReset({
      database,
      roomId,
      actorId: clientId,
    }).catch((error: unknown) => {
      console.error("Failed to reset battle", error);
    });
  }

  function handleContinueReward(): void {
    if (rewardOverlay === null || rewardOverlay.locked) {
      return;
    }
    setRewardOverlay((current) => current === null
      ? null
      : { ...current, locked: true });
    completeBattleSiteVictory({
      battleId: battleInit.battleId,
      siteId: battleInit.siteId,
      dreamscapeId: battleInit.dreamscapeId,
      completionLevelAtBattleStart: battleInit.completionLevelAtStart,
      atlasSnapshot: battleInit.atlasSnapshot,
      essenceReward: battleInit.essenceReward,
      omenReward: battleInit.omenReward,
      isMiniboss: battleInit.isMiniboss,
      isFinalBoss: battleInit.isFinalBoss,
      playerHasBanes:
        questState.deck.some((entry) => entry.isBane) ||
        questState.dreamsigns.some((dreamsign) => dreamsign.isBane),
      dreamscapeModifiers: questState.dreamscapeModifiers,
      mutations,
      clearBattleStateForRoom: () => {
        void dispatchClearBattleState({
          database,
          roomId,
        }).catch((error: unknown) => {
          console.error("Failed to clear battle slot", error);
        });
      },
      postVictoryHandoffDelayMs: 800,
    });
  }

  function handleSelectSummary(side: BattleSide): void {
    if (openSideSummary === side) {
      setOpenSideSummary(null);
      return;
    }
    setOpenSideSummary(side);
    setContextMenu(null);
  }

  function handleCardContextMenu(
    battleCardId: string,
    event: ReactMouseEvent<HTMLElement>,
    sourceSurface: BattleCommandSourceSurface,
  ): void {
    event.preventDefault();
    setContextMenu({
      battleCardId,
      sourceSurface,
      x: event.clientX,
      y: event.clientY,
    });
    setOpenSideSummary(null);
  }

  function handleCardDragStart(battleCardId: string): void {
    const location = selectBattleCardLocation(reducerState.mutable, battleCardId);
    const instance = reducerState.mutable.cardInstances[battleCardId];
    if (instance !== undefined) {
      setPendingDrag({
        battleCardId,
        sourceSurface: resolveDragSourceSurface(location),
      });
    }
    setContextMenu(null);
  }

  // Every card-movement gesture funnels through the single unrestricted move
  // (MOVE_CARD_TO_ZONE) — or SWAP_BATTLEFIELD_SLOTS for a battlefield-to-
  // battlefield swap. A move never changes energy, and any card can travel to
  // any zone or side. The drop SIDE always comes from the drop target, so
  // dropping on an enemy slot/zone moves the card cross-side.
  //
  // | Gesture                                                  | Destination                       | Command dispatched                          |
  // |----------------------------------------------------------|-----------------------------------|---------------------------------------------|
  // | Drop onto EMPTY battlefield slot                         | that slot                         | MOVE_CARD_TO_ZONE (destination = slot)      |
  // | Drop onto OCCUPIED slot, source IS a battlefield slot    | swap                              | SWAP_BATTLEFIELD_SLOTS                       |
  // | Drop onto OCCUPIED slot, source NOT a battlefield slot   | —                                 | no-op (physical restriction)                |
  // | Drop onto hand/void/banished zone button                 | that zone                         | MOVE_CARD_TO_ZONE ({ side, zone })          |
  // | Drop onto deck zone                                      | deck top                          | MOVE_CARD_TO_ZONE ({ side, zone:"deck"... })|
  // | Drop onto stack zone                                     | stack                             | MOVE_CARD_TO_ZONE ({ side, zone:"stack" })  |
  // | Double-click a hand card                                 | first open reserve, else deployed | MOVE_CARD_TO_ZONE via battlefield helper    |
  function handleSlotDrop(target: BattleFieldSlotAddress): void {
    if (pendingDrag === null) {
      return;
    }

    const draggedLocation = selectBattleCardLocation(reducerState.mutable, pendingDrag.battleCardId);
    const targetOccupant = selectBattlefieldSlotOccupant(reducerState.mutable, target);

    if (targetOccupant !== null) {
      const sourceIsBattlefield =
        draggedLocation?.zone === "reserve" || draggedLocation?.zone === "deployed";
      if (sourceIsBattlefield) {
        handleCommand({
          id: "DEBUG_EDIT",
          edit: {
            kind: "SWAP_BATTLEFIELD_SLOTS",
            source: {
              side: draggedLocation.side,
              zone: draggedLocation.zone,
              slotId: draggedLocation.slotId,
            },
            target,
          },
          sourceSurface: "battlefield",
        });
      }
      // Dropping a non-battlefield card onto an occupied slot is a no-op: a
      // physical card cannot share a slot, and only battlefield-to-battlefield
      // drags can swap.
      setPendingDrag(null);
      return;
    }

    handleCommand({
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: pendingDrag.battleCardId,
        destination: target,
      },
      sourceSurface: pendingDrag.sourceSurface,
    });
    setPendingDrag(null);
  }

  function handleZoneDrop(
    side: BattleSide,
    zone: BrowseableZone,
    sourceSurface: BattleCommandSourceSurface,
  ): void {
    if (pendingDrag === null) {
      return;
    }

    const command = zone === "deck"
      ? createMoveCardToDeckCommand(pendingDrag.battleCardId, side, "top", sourceSurface)
      : createMoveCardToZoneCommand(pendingDrag.battleCardId, side, zone, sourceSurface);
    handleCommand(command);
    setPendingDrag(null);
  }

  function handleStackDrop(): void {
    if (pendingDrag === null) {
      return;
    }
    const side = selectBattleCardLocation(reducerState.mutable, pendingDrag.battleCardId)?.side ?? "player";
    handleCommand(
      createMoveCardToStackCommand(pendingDrag.battleCardId, side, pendingDrag.sourceSurface),
    );
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
      data-battle-opponent-hand-revealed={isOpponentHandRevealed ? "true" : "false"}
    >
      {openZoneBrowser !== null ? (
        <BattleZoneBrowser
          browser={openZoneBrowser}
          isOpponentHandRevealed={isOpponentHandRevealed}
          state={reducerState.mutable}
          onClose={() => setOpenZoneBrowser(null)}
          onCommand={handleCommand}
          onOpenForesee={(side, count) => setOpenForeseeOverlay({ side, count })}
          onOpenReorderMultiple={(side) => setOpenDeckOrderPicker(side)}
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
          dreamcaller={openSideSummary === "player" ? battleInit.dreamcallerSummary : null}
          isActive={reducerState.mutable.activeSide === openSideSummary}
          isSelected={false}
          isPlayerInfoAvailable={battleInit.dreamcallerSummary !== null || battleInit.dreamsignSummaries.length > 0}
          onClose={() => {
            setOpenSideSummary(null);
          }}
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
            onSetPhase={(phase) => {
              handleCommand({
                id: "DEBUG_EDIT",
                edit: { kind: "SET_PHASE", phase },
                sourceSurface: "action-bar",
              });
            }}
          />
          <BattleLiveRegion
            activeSide={reducerState.mutable.activeSide}
            phase={reducerState.mutable.phase}
            result={reducerState.mutable.result}
            turnNumber={reducerState.mutable.turnNumber}
          />
          <div className="stage">
            {isOpponentHandRevealed ? (
              <div className="opponent-hand-zone">
                <BattleOpponentHandTray
                  canInteract={true}
                  currentEnergy={reducerState.mutable.sides.enemy.currentEnergy}
                  hand={reducerState.mutable.sides.enemy.hand}
                  isCardPlayable={undefined}
                  selectedCardId={null}
                  state={reducerState.mutable}
                  onCardClick={handleHandCardClick}
                  onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "opponent-hand-tray")}
                  onCardDragStart={handleCardDragStart}
                  onCardDragEnd={() => setPendingDrag(null)}
                  onCardHoverStart={handleBattlefieldCardHoverStart}
                  onCardHoverMove={handleBattlefieldCardHoverMove}
                  onCardHoverEnd={handleBattlefieldCardHoverEnd}
                />
              </div>
            ) : null}
            <div className="battlefield-zone-layout">
              <BattleStackZone
                state={reducerState.mutable}
                pendingDragCardId={pendingDrag?.battleCardId ?? null}
                onDrop={handleStackDrop}
                onCardClick={handleBattlefieldCardClick}
                onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                onCardDragStart={handleCardDragStart}
                onCardDragEnd={() => setPendingDrag(null)}
                onResolveToBanished={(battleCardId, side) => handleCommand(
                  createMoveCardToZoneCommand(battleCardId, side, "banished", "battlefield"),
                )}
                onResolveToVoid={(battleCardId, side) => handleCommand(
                  createMoveCardToZoneCommand(battleCardId, side, "void", "battlefield"),
                )}
              />
              <BattleStatusStrip
                side="player"
                sideState={reducerState.mutable.sides.player}
                state={reducerState.mutable}
                subtitle={battleInit.dreamcallerSummary?.title ?? ""}
                title={battleInit.dreamcallerSummary?.name ?? "Player"}
                isActive={reducerState.mutable.activeSide === "player"}
                isSummarySelected={openSideSummary === "player"}
                onOpenZone={(zone) => handleOpenZoneBrowser("player", zone)}
                onZoneDrop={handleZoneDrop}
                pendingDragCardId={pendingDrag?.battleCardId ?? null}
                pendingDragSourceSurface={pendingDrag?.sourceSurface ?? null}
                onSelectSummary={() => handleSelectSummary("player")}
              />
              <ScaledBattlefield>
                <div className="battlefield">
                  <BattlefieldGrid
                    side="enemy"
                    zone="reserve"
                    state={reducerState.mutable}
                    canInteract={true}
                    selectedCardId={null}
                    selectedSlot={null}
                    selectionAnchor={null}
                    handSelectionSide={null}
                    pendingDragCardId={pendingDrag?.battleCardId ?? null}
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
                    canInteract={true}
                    selectedCardId={null}
                    selectedSlot={null}
                    selectionAnchor={null}
                    handSelectionSide={null}
                    pendingDragCardId={pendingDrag?.battleCardId ?? null}
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
                    canInteract={true}
                    selectedCardId={null}
                    selectedSlot={null}
                    selectionAnchor={null}
                    handSelectionSide={null}
                    pendingDragCardId={pendingDrag?.battleCardId ?? null}
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
                    canInteract={true}
                    selectedCardId={null}
                    selectedSlot={null}
                    selectionAnchor={null}
                    handSelectionSide={null}
                    pendingDragCardId={pendingDrag?.battleCardId ?? null}
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
                side="enemy"
                sideState={reducerState.mutable.sides.enemy}
                state={reducerState.mutable}
                subtitle={battleInit.enemyDescriptor.subtitle}
                title={battleInit.enemyDescriptor.name}
                isActive={reducerState.mutable.activeSide === "enemy"}
                isSummarySelected={openSideSummary === "enemy"}
                onOpenZone={(zone) => handleOpenZoneBrowser("enemy", zone)}
                onZoneDrop={handleZoneDrop}
                pendingDragCardId={pendingDrag?.battleCardId ?? null}
                pendingDragSourceSurface={pendingDrag?.sourceSurface ?? null}
                onSelectSummary={() => handleSelectSummary("enemy")}
              />
            </div>
          </div>
          <div className="player-hand-zone">
            <BattleHandTray
              canInteract={true}
              compact={isOpponentHandRevealed}
              currentEnergy={reducerState.mutable.sides.player.currentEnergy}
              hand={reducerState.mutable.sides.player.hand}
              onHandCardAction={handleCommand}
              openingHandSize={battleInit.openingHandSize}
              playerDrawSkipsTurnOne={battleInit.playerDrawSkipsTurnOne}
              selectedCardId={null}
              state={reducerState.mutable}
              onCardClick={handleHandCardClick}
              onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "hand-tray")}
              onCardDoubleClick={handleHandCardDoubleClick}
              onCardDragStart={handleCardDragStart}
              onCardDragEnd={() => setPendingDrag(null)}
              onCardHoverStart={handleBattlefieldCardHoverStart}
              onCardHoverMove={handleBattlefieldCardHoverMove}
              onCardHoverEnd={handleBattlefieldCardHoverEnd}
              isCardPlayable={undefined}
            />
          </div>
          <BattleActionBar
            futureCount={futureCount}
            historyCount={historyCount}
            isBattleLogOpen={isBattleLogOpen}
            isDesktopInspectorLayout={isDesktopInspectorLayout}
            isInspectorDrawerOpen={isInspectorDrawerOpen}
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
          isOpponentHandRevealed={isOpponentHandRevealed}
          isOpen={isInspectorDrawerOpen}
          lastTransition={reducerState.lastTransition}
          state={reducerState.mutable}
          onClose={() => setIsInspectorDrawerOpen(false)}
          onOpen={() => setIsInspectorDrawerOpen(true)}
          onCommand={handleCommand}
          onOpenFigmentCreator={(side) => setOpenFigmentCreator(side)}
          onOpenForesee={(side, count) => setOpenForeseeOverlay({ side, count })}
          onOpenZone={handleOpenZoneBrowser}
          onResetBattle={handleResetBattle}
          onRedo={() => dispatch({ type: "REDO" })}
          onToggleOpponentHand={() => setIsOpponentHandRevealed((value) => !value)}
          onUndo={() => dispatch({ type: "UNDO" })}
        />
      </div>
      {contextMenu !== null ? (
        <BattleContextMenu
          key={`${contextMenu.battleCardId}:${contextMenu.sourceSurface}:${String(contextMenu.x)}:${String(contextMenu.y)}`}
          battleCardId={contextMenu.battleCardId}
          onOpenNoteEditor={(battleCardId) => setOpenNoteEditor(battleCardId)}
          sourceSurface={contextMenu.sourceSurface}
          state={reducerState.mutable}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCommand={handleCommand}
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
      {showResultOverlay ? (
        reducerState.mutable.result === "victory" && rewardOverlay !== null ? (
          <BattleRewardSurface
            battleId={battleInit.battleId}
            canCancel={!rewardOverlay.locked}
            enemyName={battleInit.enemyDescriptor.name}
            essenceReward={battleInit.essenceReward}
            omenReward={battleInit.omenReward}
            enemyScore={reducerState.mutable.sides.enemy.score}
            playerScore={reducerState.mutable.sides.player.score}
            rewardSource={rewardOverlay.rewardSource}
            turnNumber={reducerState.mutable.turnNumber}
            isLocked={rewardOverlay.locked}
            onCancel={() => setIsResultOverlayDismissed(true)}
            onContinue={handleContinueReward}
          />
        ) : (
          <BattleResultOverlay
            result={reducerState.mutable.result!}
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

function BattleStackZone({
  state,
  pendingDragCardId,
  onDrop,
  onCardClick,
  onCardContextMenu,
  onCardDragStart,
  onCardDragEnd,
  onResolveToBanished,
  onResolveToVoid,
}: {
  state: BattleMutableState;
  pendingDragCardId: string | null;
  onDrop: () => void;
  onCardClick: (battleCardId: string) => void;
  onCardContextMenu: (battleCardId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onCardDragStart: (battleCardId: string) => void;
  onCardDragEnd: () => void;
  onResolveToBanished: (battleCardId: string, side: BattleSide) => void;
  onResolveToVoid: (battleCardId: string, side: BattleSide) => void;
}) {
  return (
    <section
      data-battle-region="stack-zone"
      className={`battle-stack-zone ${pendingDragCardId !== null ? "drop-target" : ""}`}
      onDragOver={(event) => {
        if (pendingDragCardId !== null) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div className="battle-stack-zone-header">
        <span>Stack</span>
      </div>
      <div className="battle-stack-zone-cards">
        {(state.stack ?? []).map((entry) => {
          const instance = state.cardInstances[entry.battleCardId];
          if (instance === undefined) {
            return null;
          }
          return (
            <div key={entry.stackEntryId} className="battle-stack-entry">
              <BattleCardView
                battleCardId={entry.battleCardId}
                data={battleCardVisualFromInstance(instance)}
                reserved={false}
                selected={false}
                draggable
                onClick={(event) => {
                  event.stopPropagation();
                  onCardClick(entry.battleCardId);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onCardContextMenu(entry.battleCardId, event);
                }}
                onDragStart={() => onCardDragStart(entry.battleCardId)}
                onDragEnd={onCardDragEnd}
              />
              <div className="battle-stack-entry-actions">
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => onResolveToVoid(entry.battleCardId, entry.side)}
                >
                  Void
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => onResolveToBanished(entry.battleCardId, entry.side)}
                >
                  Banish
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
      const scale = computeBattlefieldScale({
        naturalHeight,
        naturalWidth,
        wrapHeight: wrap.clientHeight,
        wrapWidth: wrap.clientWidth,
      });
      if (scale === null) {
        return;
      }
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

export function computeBattlefieldScale({
  naturalHeight,
  naturalWidth,
  wrapHeight,
  wrapWidth,
}: {
  naturalHeight: number;
  naturalWidth: number;
  wrapHeight: number;
  wrapWidth: number;
}): number | null {
  if (naturalWidth <= 0 || naturalHeight <= 0 || wrapWidth <= 0 || wrapHeight <= 0) {
    return null;
  }

  return Math.min(1, wrapWidth / naturalWidth, wrapHeight / naturalHeight);
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

function resolveDragSourceSurface(
  location: ReturnType<typeof selectBattleCardLocation>,
): BattleCommandSourceSurface {
  if (location?.zone === "hand") {
    return location.side === "enemy" ? "opponent-hand-tray" : "hand-tray";
  }

  return "battlefield";
}
