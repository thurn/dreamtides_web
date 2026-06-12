import "../battle.css";

import type {
  MouseEvent as ReactMouseEvent,
  MouseEvent as ReactPointerMouseEvent,
  ReactNode,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SiteState } from "../../types/quest";
import type { CardData } from "../../types/cards";
import {
  createBattleLogBaseFields,
  logBattleCommandApplied,
  logEventOnce,
} from "../../logging";
import { useQuest } from "../../state/quest-context";
import { PoolViewer } from "../../components/PoolViewer";
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
  BattleDeckCardDefinition,
  BattleDreamcallerSummary,
  BattleEnemyDescriptor,
  BattleFieldSlotAddress,
  BattleMutableState,
  BattlePhase,
  BattleReducerState,
  BattleSide,
  BrowseableZone,
} from "../types";
import type { QuestContent } from "../../data/quest-content";
import type { BattleCommand, BattleDebugEdit } from "../debug/commands";
import { useBattleAi, type AiProposal } from "../ai/use-battle-ai";
import { aiMayRunHere } from "../ai/ai-may-run-here";
import { dreamwellEnergyEdits } from "../engine/energy";
import { planBasicAutomationCommands } from "../automation/basic-automation";
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
import { BattleDreamwellDisplay } from "./BattleDreamwellDisplay";
import { BattleCardPickerOverlay } from "./BattleCardPickerOverlay";
import { BattleChoicePromptOverlay } from "./BattleChoicePromptOverlay";
import { useDreamwellEffectRunner } from "../automation/use-dreamwell-effect-runner";
import { dreamwellAutomationStatus } from "../automation/dreamwell-effects-table";
import { BattlefieldGrid } from "./BattlefieldGrid";
import { BattleZoneBrowser } from "./BattleZoneBrowser";
import {
  createMoveCardToBattlefieldCommand,
  createMoveCardToDeckCommand,
  createMoveCardToStackCommand,
  createMoveCardToZoneCommand,
} from "./battle-ui-commands";
import { createBaseBattleDeckCardDefinition } from "../card-definition";

const DESKTOP_INSPECTOR_WIDTH = 1280;
const PHASE_CONTROL_SEQUENCE = ["dreamwell", "day", "dusk", "night", "challenge"] as const satisfies readonly BattlePhase[];
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
  kind: "battle-card";
  battleCardId: string;
  sourceSurface: BattleCommandSourceSurface;
} | {
  kind: "pool-card";
  definition: BattleDeckCardDefinition;
  sourceSurface: "pool-viewer";
} | null;
type HoverPreviewState = {
  battleCardId: string;
  x: number;
  y: number;
} | null;

export function PlayableBattleScreen({
  site,
  aiMode = false,
  basicAutomation = false,
}: {
  site: SiteState;
  aiMode?: boolean;
  basicAutomation?: boolean;
}) {
  const { battleState, reducerState } = useMultiplayerBattle();
  if (battleState === null || reducerState === null) {
    return null; // BattleSiteRoute already shows the loading state.
  }
  return (
    <PlayableBattleScreenInner site={site} aiMode={aiMode} basicAutomation={basicAutomation} />
  );
}

function PlayableBattleScreenInner({
  site,
  aiMode,
  basicAutomation,
}: {
  site: SiteState;
  aiMode: boolean;
  basicAutomation: boolean;
}) {
  const {
    battleState: maybeBattleState,
    reducerState: maybeReducerState,
    dispatch,
    database,
    roomId,
    clientId,
    connectedCount,
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

  const { state: questState, mutations, cardDatabase, questContent } = useQuest();
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
  const [isPoolViewerOpen, setIsPoolViewerOpen] = useState(false);
  const [openNoteEditor, setOpenNoteEditor] = useState<string | null>(null);
  const [openSideSummary, setOpenSideSummary] = useState<BattleSide | null>(null);
  const [isDreamcallerPanelOpen, setIsDreamcallerPanelOpen] = useState(false);
  // Initialize from the runtime flag (default ON; `?automation=0` forces off).
  // The gear toggle below is a manual override that flips this at runtime.
  const [isBasicAutomationEnabled, setIsBasicAutomationEnabled] = useState(basicAutomation);
  const [rewardOverlay, setRewardOverlay] = useState<RewardOverlayState>(null);
  const [isResultOverlayDismissed, setIsResultOverlayDismissed] = useState(false);
  const loggedCommandSerialRef = useRef(0);

  // Win/turn/energy caps for the AI planner, sourced from the battle init.
  // Wrapped in `useMemo` so the object is referentially stable across renders;
  // an inline literal would bust the hook's proposal memo every render.
  const aiCaps = useMemo(
    () => ({
      scoreToWin: battleInit.scoreToWin,
      turnLimit: battleInit.turnLimit,
      maxEnergyCap: battleInit.maxEnergyCap,
    }),
    [battleInit.scoreToWin, battleInit.turnLimit, battleInit.maxEnergyCap],
  );

  // The AI is a LOCAL actor and must run on exactly ONE client. In a shared
  // multiplayer room (two or more connected clients) it must NOT run here, or
  // both clients would drive the enemy and corrupt the shared state. The gate is
  // an ADDITIONAL condition on top of `aiMode`; single-player (one connected
  // client) leaves the AI fully enabled.
  const aiMayRun = aiMayRunHere({ connectedCount });

  // The AI approval loop. Inert unless `aiMode` is true AND this client may run
  // the AI: when disabled the hook holds no proposal and dispatches nothing. It
  // receives the SAME live `reducerState`/`dispatch` the rest of the screen
  // uses, so approved commands flow back as a new `reducerState` and the hook
  // re-plans.
  const { proposal, approve, reject } = useBattleAi({
    reducerState,
    dispatch,
    enabled: aiMode && aiMayRun,
    aiSide: "enemy",
    caps: aiCaps,
    basicAutomation: isBasicAutomationEnabled,
  });

  // While the AI holds an un-approved proposal, the human drives only via the
  // approve/reject icon controls in the phase cluster. Normal controls (phase
  // arrows, hand, battlefield) return once no proposal is held — on the human's
  // own turn, and during the AI's Dusk/Night/Challenge after its plays are done.
  const canPlayerAct = !(aiMode && proposal !== null);
  const historyCount = reducerState.history.past.length;
  const futureCount = reducerState.history.future.length;
  const failureResult = selectFailureOverlayResult(reducerState.mutable.result);
  const showResultOverlay = reducerState.mutable.result !== null &&
    !isResultOverlayDismissed;
  const showReopenPill = reducerState.mutable.result !== null &&
    isResultOverlayDismissed;
  const pendingDragCardId = pendingDrag === null
    ? null
    : pendingDrag.kind === "battle-card"
      ? pendingDrag.battleCardId
      : "__pool_viewer_card__";

  const handleCommand = useCallback((command: BattleCommand): void => {
    setPendingDrag(null);
    setHoverPreview(null);
    // With basic automation on, a single gesture can expand into several
    // commands (e.g. a play also spends energy; ending a turn resolves the
    // Challenge, ramps energy, and draws). The planner reads the live state and
    // returns the ordered command list; with automation off it is a passthrough.
    if (isBasicAutomationEnabled) {
      const plannedCommands = planBasicAutomationCommands(reducerState.mutable, command, {
        maxEnergyCap: battleInit.maxEnergyCap,
        scoreToWin: battleInit.scoreToWin,
        dreamwellDeck: battleInit.dreamwellDeck,
      });
      for (const planned of plannedCommands) {
        dispatch({ type: "APPLY_COMMAND", command: planned });
      }
      return;
    }
    dispatch({ type: "APPLY_COMMAND", command });
  }, [
    dispatch,
    isBasicAutomationEnabled,
    reducerState.mutable,
    battleInit.maxEnergyCap,
    battleInit.scoreToWin,
    battleInit.dreamwellDeck,
  ]);

  const dispatchAutomationEdit = useCallback((edit: BattleDebugEdit): void => {
    dispatch({
      type: "APPLY_COMMAND",
      command: { id: "DEBUG_EDIT", edit, sourceSurface: "auto-system" },
    });
  }, [dispatch]);

  const dreamwellRunner = useDreamwellEffectRunner({
    enabled: isBasicAutomationEnabled,
    state: reducerState.mutable,
    dreamwellDeck: battleInit.dreamwellDeck,
    dispatchEdit: dispatchAutomationEdit,
  });

  // Dreamwell-draw rail tool: on demand, reveal an additional Dreamwell card for
  // a side and (under basic automation) apply its energy. The shared draw index
  // advances, so this is the manual hook for effects such as Lily Lake ("Draw an
  // additional Dreamwell card").
  const runDreamwellDraw = useCallback((side: BattleSide): void => {
    handleCommand({
      id: "DEBUG_EDIT",
      edit: {
        kind: "DRAW_DREAMWELL_CARD",
        side,
        turnNumber: reducerState.mutable.turnNumber,
      },
      sourceSurface: "status-strip",
    });
  }, [handleCommand, reducerState.mutable.turnNumber]);

  // Dreamwell reveal: whenever the active side rests on its Dreamwell phase
  // without having drawn this turn's Dreamwell card yet, reveal it (rules §The
  // Dreamwell and Energy). This is core turn flow — it fires regardless of basic
  // automation so the card is always shown — while the energy it grants is
  // folded in by the automation expansion of `DRAW_DREAMWELL_CARD`.
  //
  // A ref keyed by the active (side, turn) ensures the reveal dispatches at most
  // once per Dreamwell phase, mirroring the AI defensive auto-block. The ref
  // guard (rather than reading `dreamwellDrawnTurn` back from state) is
  // essential: with automation on the reveal expands into several commands, and
  // a state-derived guard can re-enter before that batch commits, looping.
  const activeSide = reducerState.mutable.activeSide;
  const activePhase = reducerState.mutable.phase;
  const activeTurnNumber = reducerState.mutable.turnNumber;
  const battleResult = reducerState.mutable.result;
  const lastDreamwellRevealKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (battleResult !== null || activePhase !== "dreamwell") {
      return;
    }
    const revealKey = `${activeSide}:${String(activeTurnNumber)}`;
    if (lastDreamwellRevealKeyRef.current === revealKey) {
      return;
    }
    lastDreamwellRevealKeyRef.current = revealKey;
    handleCommand({
      id: "DEBUG_EDIT",
      edit: {
        kind: "DRAW_DREAMWELL_CARD",
        side: activeSide,
        turnNumber: activeTurnNumber,
      },
      sourceSurface: "auto-system",
    });
  }, [
    handleCommand,
    activeSide,
    activePhase,
    activeTurnNumber,
    battleResult,
  ]);

  // The Dreamwell card the active side is currently showing (the card at its
  // recorded draw index), rendered centered above the battlefield while the
  // Dreamwell phase is active.
  const activeDreamwellCardIndex =
    reducerState.mutable.sides[activeSide].dreamwellCardIndex;
  const dreamwellDisplayCard = useMemo(() => {
    if (activeDreamwellCardIndex === null) {
      return null;
    }
    const definition = battleInit.dreamwellDeck[activeDreamwellCardIndex];
    if (definition === undefined) {
      return null;
    }
    return {
      id: definition.id,
      name: definition.name,
      renderedText: definition.renderedText,
      energyAdded: definition.energyAdded,
      imageNumber: definition.imageNumber,
    };
  }, [activeDreamwellCardIndex, battleInit.dreamwellDeck]);
  // The Dreamwell card is hidden during the opening round (turn 1): no card is
  // surfaced until each side reaches its Dreamwell phase on a later turn.
  const isDreamwellDisplayVisible =
    activePhase === "dreamwell" && battleResult === null && activeTurnNumber > 1;

  useEffect(() => {
    if (reducerState.mutable !== battleState.reducer.mutable) {
      return;
    }

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
  }, [battleState.reducer.commandSerial, battleState.reducer.mutable, reducerState]);

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
      setIsPoolViewerOpen(false);
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
    setIsPoolViewerOpen(false);
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
    if (!canPlayerAct) {
      return;
    }
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
    setIsPoolViewerOpen(false);
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

  function handleOpenSummary(side: BattleSide): void {
    setOpenSideSummary(side);
    setContextMenu(null);
  }

  function handleCloseSummary(side: BattleSide): void {
    setOpenSideSummary((current) => current === side ? null : current);
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

  function handleCardDragStart(
    battleCardId: string,
    sourceSurface?: BattleCommandSourceSurface,
  ): void {
    if (!canPlayerAct) {
      return;
    }
    setHoverPreview(null);
    const location = selectBattleCardLocation(reducerState.mutable, battleCardId);
    const instance = reducerState.mutable.cardInstances[battleCardId];
    if (instance !== undefined) {
      setPendingDrag({
        kind: "battle-card",
        battleCardId,
        sourceSurface: sourceSurface ?? resolveDragSourceSurface(location),
      });
    }
    setContextMenu(null);
  }

  function handleCardDragEnd(): void {
    setPendingDrag(null);
  }

  function handlePoolCardDragStart(card: CardData): void {
    if (!canPlayerAct) {
      return;
    }
    setPendingDrag({
      kind: "pool-card",
      definition: createBaseBattleDeckCardDefinition(card),
      sourceSurface: "pool-viewer",
    });
    setContextMenu(null);
    setHoverPreview(null);
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
    if (!canPlayerAct) {
      return;
    }
    if (pendingDrag === null) {
      return;
    }

    const draggedLocation = pendingDrag.kind === "battle-card"
      ? selectBattleCardLocation(reducerState.mutable, pendingDrag.battleCardId)
      : null;
    const targetOccupant = selectBattlefieldSlotOccupant(reducerState.mutable, target);

    if (targetOccupant !== null) {
      const sourceIsBattlefield =
        pendingDrag.kind === "battle-card" &&
        (draggedLocation?.zone === "backRank" || draggedLocation?.zone === "frontRank");
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

    if (pendingDrag.kind === "pool-card") {
      handleCommand({
        id: "DEBUG_EDIT",
        edit: {
          kind: "CREATE_CARD_FROM_DEFINITION",
          definition: pendingDrag.definition,
          destination: target,
          createdAtMs: Date.now(),
        },
        sourceSurface: "pool-viewer",
      });
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
    if (!canPlayerAct) {
      return;
    }
    if (pendingDrag === null) {
      return;
    }

    if (pendingDrag.kind === "pool-card") {
      handleCommand({
        id: "DEBUG_EDIT",
        edit: {
          kind: "CREATE_CARD_FROM_DEFINITION",
          definition: pendingDrag.definition,
          destination: zone === "deck"
            ? { side, zone: "deck", position: "top" }
            : { side, zone },
          createdAtMs: Date.now(),
        },
        sourceSurface: "pool-viewer",
      });
      setPendingDrag(null);
      return;
    }

    const command = zone === "deck"
      ? createMoveCardToDeckCommand(pendingDrag.battleCardId, side, "top", sourceSurface)
      : createMoveCardToZoneCommand(pendingDrag.battleCardId, side, zone, sourceSurface);
    handleCommand(command);
    setPendingDrag(null);
  }

  function handleStackDrop(): void {
    if (!canPlayerAct) {
      return;
    }
    if (pendingDrag === null) {
      return;
    }

    if (pendingDrag.kind === "pool-card") {
      handleCommand({
        id: "DEBUG_EDIT",
        edit: {
          kind: "CREATE_CARD_FROM_DEFINITION",
          definition: pendingDrag.definition,
          destination: { side: "player", zone: "stack" },
          createdAtMs: Date.now(),
        },
        sourceSurface: "pool-viewer",
      });
      setPendingDrag(null);
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
    event: ReactPointerMouseEvent<HTMLElement>,
  ): void {
    if (pendingDrag !== null) {
      setHoverPreview(null);
      return;
    }
    setHoverPreview({
      battleCardId,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleBattlefieldCardHoverMove(
    battleCardId: string,
    event: ReactPointerMouseEvent<HTMLElement>,
  ): void {
    if (pendingDrag !== null) {
      setHoverPreview(null);
      return;
    }
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

  const enemyDreamcallerSummary = resolveEnemyDreamcallerSummary(
    battleInit.enemyDescriptor,
    questContent,
  );

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
          onCardDragStart={handleCardDragStart}
          onCardDragEnd={handleCardDragEnd}
          onCardHoverStart={handleBattlefieldCardHoverStart}
          onCardHoverMove={handleBattlefieldCardHoverMove}
          onCardHoverEnd={handleBattlefieldCardHoverEnd}
          onCardDropToBrowser={(sourceSurface) => handleZoneDrop(
            openZoneBrowser.side,
            openZoneBrowser.zone,
            sourceSurface,
          )}
          pendingDragSourceSurface={pendingDrag?.sourceSurface ?? null}
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
      {dreamwellRunner.activePrompt?.kind === "pick-cards" ? (
        <BattleCardPickerOverlay
          title={dreamwellRunner.activePrompt.label}
          candidateIds={dreamwellRunner.activePrompt.candidateIds}
          count={dreamwellRunner.activePrompt.count}
          optional={dreamwellRunner.activePrompt.optional}
          state={reducerState.mutable}
          onConfirm={(ids) => dreamwellRunner.resolvePrompt({ kind: "pick-cards", chosenIds: ids })}
          onSkip={() => dreamwellRunner.resolvePrompt({ kind: "pick-cards", chosenIds: [] })}
        />
      ) : null}
      {dreamwellRunner.activePrompt?.kind === "choice" ? (
        <BattleChoicePromptOverlay
          title={dreamwellRunner.activePrompt.label}
          options={dreamwellRunner.activePrompt.options}
          onChoose={(i) => dreamwellRunner.resolvePrompt({ kind: "choice", optionIndex: i })}
        />
      ) : null}
      {dreamwellRunner.activePrompt?.kind === "foresee" ? (
        <BattleForeseeOverlay
          initialCount={dreamwellRunner.activePrompt.count}
          side={dreamwellRunner.activePromptSide ?? activeSide}
          state={reducerState.mutable}
          onDispatch={(command) => dispatch({ type: "APPLY_COMMAND", command })}
          onClose={() => dreamwellRunner.resolvePrompt({ kind: "foresee" })}
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
      <PoolViewer
        cardDatabase={cardDatabase}
        draftState={questState.draftState}
        resolvedPackage={questState.resolvedPackage}
        isOpen={isPoolViewerOpen}
        onClose={() => setIsPoolViewerOpen(false)}
        onPoolCardDragEnd={handleCardDragEnd}
        onPoolCardDragStart={handlePoolCardDragStart}
        title="Battle Pool Viewer"
        variant="floating"
      />
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
          dreamcaller={openSideSummary === "player" ? battleInit.dreamcallerSummary : enemyDreamcallerSummary}
          isActive={reducerState.mutable.activeSide === openSideSummary}
          isSelected={false}
          onClose={() => {
            setOpenSideSummary(null);
          }}
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
            hasAiOpponent={aiMode}
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
          <BattleAiProposalBanner proposal={aiMode ? proposal : null} />
          <div className="stage">
            <BattleDreamwellDisplay
              card={dreamwellDisplayCard}
              side={activeSide}
              visible={isDreamwellDisplayVisible}
              automationStatus={dreamwellDisplayCard ? dreamwellAutomationStatus(dreamwellDisplayCard.id) : "none"}
            />
            {isOpponentHandRevealed ? (
              <div className="opponent-hand-zone">
                <BattleOpponentHandTray
                  canInteract={canPlayerAct}
                  currentEnergy={reducerState.mutable.sides.enemy.currentEnergy}
                  hand={reducerState.mutable.sides.enemy.hand}
                  isCardPlayable={undefined}
                  selectedCardId={null}
                  state={reducerState.mutable}
                  onCardClick={handleHandCardClick}
                  onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "opponent-hand-tray")}
                  onCardDragStart={handleCardDragStart}
                  onCardDragEnd={handleCardDragEnd}
                  onCardDropToHand={(sourceSurface) => handleZoneDrop("enemy", "hand", sourceSurface)}
                  onCardHoverStart={handleBattlefieldCardHoverStart}
                  onCardHoverMove={handleBattlefieldCardHoverMove}
                  onCardHoverEnd={handleBattlefieldCardHoverEnd}
                  pendingDragCardId={pendingDragCardId}
                  pendingDragSourceSurface={pendingDrag?.sourceSurface ?? null}
                />
              </div>
            ) : null}
            <div className="battlefield-zone-layout">
              <BattleStackZone
                state={reducerState.mutable}
                pendingDragCardId={pendingDragCardId}
                onDrop={handleStackDrop}
                onCardClick={handleBattlefieldCardClick}
                onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                onCardDragStart={handleCardDragStart}
                onCardDragEnd={handleCardDragEnd}
                onCardHoverStart={handleBattlefieldCardHoverStart}
                onCardHoverMove={handleBattlefieldCardHoverMove}
                onCardHoverEnd={handleBattlefieldCardHoverEnd}
                onResolveToBanished={(battleCardId, side) => handleCommand(
                  createMoveCardToZoneCommand(battleCardId, side, "banished", "battlefield"),
                )}
                onResolveToVoid={(battleCardId, side) => handleCommand(
                  createMoveCardToZoneCommand(battleCardId, side, "void", "battlefield"),
                )}
              />
              <div className="battle-side-zone-column player">
                <div className="battle-small-zone-row">
                  <BattleSmallZoneDropTarget
                    label="Banished"
                    side="player"
                    zone="banished"
                    count={reducerState.mutable.sides.player.banished.length}
                    pendingDrag={pendingDrag}
                    onDrop={(sourceSurface) => handleZoneDrop("player", "banished", sourceSurface)}
                    onOpen={() => handleOpenZoneBrowser("player", "banished")}
                  />
                  <BattleSmallZoneDropTarget
                    label="Void"
                    side="player"
                    zone="void"
                    count={reducerState.mutable.sides.player.void.length}
                    pendingDrag={pendingDrag}
                    onDrop={(sourceSurface) => handleZoneDrop("player", "void", sourceSurface)}
                    onOpen={() => handleOpenZoneBrowser("player", "void")}
                  />
                </div>
                <BattleStatusStrip
                  dreamcaller={battleInit.dreamcallerSummary}
                  side="player"
                  sideState={reducerState.mutable.sides.player}
                  subtitle={battleInit.dreamcallerSummary?.title ?? ""}
                  title={battleInit.dreamcallerSummary?.name ?? "Player"}
                  isActive={reducerState.mutable.activeSide === "player"}
                  isSummarySelected={openSideSummary === "player"}
                  onSetEnergy={(value) => handleCommand({
                    id: "DEBUG_EDIT",
                    edit: { kind: "SET_CURRENT_ENERGY", side: "player", value },
                    sourceSurface: "status-strip",
                  })}
                  onIncreaseMaxEnergyAndFill={() => handleCommand({
                    id: "DEBUG_EDIT",
                    edit: { kind: "INCREASE_MAX_ENERGY_AND_FILL", side: "player" },
                    sourceSurface: "status-strip",
                  })}
                  onSetScore={(value) => handleCommand({
                    id: "DEBUG_EDIT",
                    edit: { kind: "SET_SCORE", side: "player", value },
                    sourceSurface: "status-strip",
                  })}
                  onDrawCard={() => handleCommand({
                    id: "DEBUG_EDIT",
                    edit: { kind: "DRAW_CARD", side: "player" },
                    sourceSurface: "status-strip",
                  })}
                  onOpenSummary={() => handleOpenSummary("player")}
                  onCloseSummary={() => handleCloseSummary("player")}
                />
              </div>
              <ScaledBattlefield>
                <div className="battlefield">
                  <BattlefieldGrid
                    side="enemy"
                    zone="backRank"
                    state={reducerState.mutable}
                    canInteract={canPlayerAct}
                    selectedCardId={null}
                    selectedSlot={null}
                    selectionAnchor={null}
                    handSelectionSide={null}
                    pendingDragCardId={pendingDragCardId}
                    onCardClick={handleBattlefieldCardClick}
                    onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                    onCardDragStart={handleCardDragStart}
                    onCardDragEnd={handleCardDragEnd}
                    onCardHoverStart={handleBattlefieldCardHoverStart}
                    onCardHoverMove={handleBattlefieldCardHoverMove}
                    onCardHoverEnd={handleBattlefieldCardHoverEnd}
                    onSlotClick={handleBattlefieldSlotClick}
                    onSlotDrop={handleSlotDrop}
                  />
                  <BattlefieldGrid
                    side="enemy"
                    zone="frontRank"
                    state={reducerState.mutable}
                    canInteract={canPlayerAct}
                    selectedCardId={null}
                    selectedSlot={null}
                    selectionAnchor={null}
                    handSelectionSide={null}
                    pendingDragCardId={pendingDragCardId}
                    onCardClick={handleBattlefieldCardClick}
                    onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                    onCardDragStart={handleCardDragStart}
                    onCardDragEnd={handleCardDragEnd}
                    onCardHoverStart={handleBattlefieldCardHoverStart}
                    onCardHoverMove={handleBattlefieldCardHoverMove}
                    onCardHoverEnd={handleBattlefieldCardHoverEnd}
                    onSlotClick={handleBattlefieldSlotClick}
                    onSlotDrop={handleSlotDrop}
                  />
                  <div
                    data-battle-region="judgment-divider"
                    className={`judgment-divider ${reducerState.mutable.phase === "challenge" ? "active" : ""}`}
                  />
                  <BattlefieldGrid
                    side="player"
                    zone="frontRank"
                    state={reducerState.mutable}
                    canInteract={canPlayerAct}
                    selectedCardId={null}
                    selectedSlot={null}
                    selectionAnchor={null}
                    handSelectionSide={null}
                    pendingDragCardId={pendingDragCardId}
                    onCardClick={handleBattlefieldCardClick}
                    onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                    onCardDragStart={handleCardDragStart}
                    onCardDragEnd={handleCardDragEnd}
                    onCardHoverStart={handleBattlefieldCardHoverStart}
                    onCardHoverMove={handleBattlefieldCardHoverMove}
                    onCardHoverEnd={handleBattlefieldCardHoverEnd}
                    onSlotClick={handleBattlefieldSlotClick}
                    onSlotDrop={handleSlotDrop}
                  />
                  <BattlefieldGrid
                    side="player"
                    zone="backRank"
                    state={reducerState.mutable}
                    canInteract={canPlayerAct}
                    selectedCardId={null}
                    selectedSlot={null}
                    selectionAnchor={null}
                    handSelectionSide={null}
                    pendingDragCardId={pendingDragCardId}
                    onCardClick={handleBattlefieldCardClick}
                    onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                    onCardDragStart={handleCardDragStart}
                    onCardDragEnd={handleCardDragEnd}
                    onCardHoverStart={handleBattlefieldCardHoverStart}
                    onCardHoverMove={handleBattlefieldCardHoverMove}
                    onCardHoverEnd={handleBattlefieldCardHoverEnd}
                    onSlotClick={handleBattlefieldSlotClick}
                    onSlotDrop={handleSlotDrop}
                  />
                </div>
              </ScaledBattlefield>
              <div className="battle-side-zone-column enemy">
                <BattleStatusStrip
                  side="enemy"
                  dreamcaller={enemyDreamcallerSummary}
                  sideState={reducerState.mutable.sides.enemy}
                  subtitle={battleInit.enemyDescriptor.subtitle}
                  title={battleInit.enemyDescriptor.name}
                  isActive={reducerState.mutable.activeSide === "enemy"}
                  isSummarySelected={openSideSummary === "enemy"}
                  onSetEnergy={(value) => handleCommand({
                    id: "DEBUG_EDIT",
                    edit: { kind: "SET_CURRENT_ENERGY", side: "enemy", value },
                    sourceSurface: "status-strip",
                  })}
                  onIncreaseMaxEnergyAndFill={() => handleCommand({
                    id: "DEBUG_EDIT",
                    edit: { kind: "INCREASE_MAX_ENERGY_AND_FILL", side: "enemy" },
                    sourceSurface: "status-strip",
                  })}
                  onSetScore={(value) => handleCommand({
                    id: "DEBUG_EDIT",
                    edit: { kind: "SET_SCORE", side: "enemy", value },
                    sourceSurface: "status-strip",
                  })}
                  onDrawCard={() => handleCommand({
                    id: "DEBUG_EDIT",
                    edit: { kind: "DRAW_CARD", side: "enemy" },
                    sourceSurface: "status-strip",
                  })}
                  onOpenSummary={() => handleOpenSummary("enemy")}
                  onCloseSummary={() => handleCloseSummary("enemy")}
                />
                <div className="battle-small-zone-row">
                  <BattleSmallZoneDropTarget
                    label="Void"
                    side="enemy"
                    zone="void"
                    count={reducerState.mutable.sides.enemy.void.length}
                    pendingDrag={pendingDrag}
                    onDrop={(sourceSurface) => handleZoneDrop("enemy", "void", sourceSurface)}
                    onOpen={() => handleOpenZoneBrowser("enemy", "void")}
                  />
                  <BattleSmallZoneDropTarget
                    label="Banished"
                    side="enemy"
                    zone="banished"
                    count={reducerState.mutable.sides.enemy.banished.length}
                    pendingDrag={pendingDrag}
                    onDrop={(sourceSurface) => handleZoneDrop("enemy", "banished", sourceSurface)}
                    onOpen={() => handleOpenZoneBrowser("enemy", "banished")}
                  />
                </div>
                <BattlePhaseFloatControls
                  state={reducerState.mutable}
                  proposal={aiMode ? proposal : null}
                  onApprove={approve}
                  onReject={reject}
                  onSetBattleFlow={(target) => {
                    handleCommand({
                      id: "DEBUG_EDIT",
                      edit: {
                        kind: "SET_BATTLE_FLOW",
                        phase: target.phase,
                        activeSide: target.activeSide,
                        turnNumber: target.turnNumber,
                      },
                      sourceSurface: "phase-controls",
                    });
                    // In AI mode, the human advancing the turn into the enemy's
                    // turn IS the enemy's start-of-turn handoff. With basic
                    // automation off the handoff is a passthrough, so this block
                    // gives the enemy what the automated handoff otherwise would:
                    // its Dreamwell reveal and energy plus its start-of-turn draw.
                    // Without it the enemy is frozen at zero energy and the
                    // planner, unable to afford any development, passes every turn.
                    // A forward player→enemy handoff keeps the turn number (see
                    // `advanceBattleTurnPair`); the backward variant decrements it,
                    // so the equality check excludes rewinds. When automation is on
                    // it owns every start-of-turn reveal, energy, and draw (for
                    // both sides), so this shortcut stands down to avoid duplicates.
                    const isAiEnemyHandoff =
                      aiMode &&
                      !isBasicAutomationEnabled &&
                      reducerState.mutable.activeSide === "player" &&
                      target.activeSide === "enemy" &&
                      target.turnNumber === reducerState.mutable.turnNumber;
                    if (isAiEnemyHandoff) {
                      // Read the card about to be drawn (the deck index has not
                      // advanced yet) so its energy can be applied alongside the
                      // reveal even though automation is off.
                      const dreamwellCard =
                        battleInit.dreamwellDeck[reducerState.mutable.dreamwellDeckIndex];
                      handleCommand({
                        id: "DEBUG_EDIT",
                        edit: {
                          kind: "DRAW_DREAMWELL_CARD",
                          side: "enemy",
                          turnNumber: target.turnNumber,
                        },
                        sourceSurface: "phase-controls",
                      });
                      for (const edit of dreamwellEnergyEdits(
                        "enemy",
                        reducerState.mutable.sides.enemy.maxEnergy,
                        dreamwellCard?.energyAdded ?? 0,
                      )) {
                        handleCommand({
                          id: "DEBUG_EDIT",
                          edit,
                          sourceSurface: "phase-controls",
                        });
                      }
                      // Mirror the handoff draw rule: the very first turn of the
                      // game (turn 1) skips the draw; every later turn draws.
                      if (target.turnNumber > 1) {
                        handleCommand({
                          id: "DEBUG_EDIT",
                          edit: { kind: "DRAW_CARD", side: "enemy" },
                          sourceSurface: "phase-controls",
                        });
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>
          <div className={isOpponentHandRevealed ? "player-hand-zone compact" : "player-hand-zone"}>
            <BattleHandTray
              canInteract={canPlayerAct}
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
              onCardDragEnd={handleCardDragEnd}
              onCardDropToHand={(sourceSurface) => handleZoneDrop("player", "hand", sourceSurface)}
              pendingDragCardId={pendingDragCardId}
              pendingDragSourceSurface={pendingDrag?.sourceSurface ?? null}
              isCardPlayable={undefined}
            />
          </div>
          <BattleActionBar
            futureCount={futureCount}
            historyCount={historyCount}
            isBasicAutomationEnabled={isBasicAutomationEnabled}
            isBattleLogOpen={isBattleLogOpen}
            isDesktopInspectorLayout={isDesktopInspectorLayout}
            isInspectorDrawerOpen={isInspectorDrawerOpen}
            onOpenForesee={(_side, _count) => undefined}
            onRedo={() => dispatch({ type: "REDO" })}
            onToggleBasicAutomation={() => setIsBasicAutomationEnabled((value) => !value)}
            onToggleBattleLog={() => setIsBattleLogOpen((value) => !value)}
            onToggleInspector={() => setIsInspectorDrawerOpen((value) => !value)}
            onUndo={() => dispatch({ type: "UNDO" })}
          />
        </div>
        <BattleInspector
          aiMode={aiMode}
          aiProposal={proposal}
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
          onDreamwellDraw={(side) => runDreamwellDraw(side)}
          onErode={(side, count) => handleCommand({
            id: "DEBUG_EDIT",
            edit: { kind: "ERODE", side, count },
            sourceSurface: "inspector",
          })}
          onOpenFigmentCreator={(side) => setOpenFigmentCreator(side)}
          onOpenPoolViewer={() => setIsPoolViewerOpen(true)}
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
      {hoverPreview !== null && pendingDrag === null
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

function BattleSmallZoneDropTarget({
  label,
  side,
  zone,
  count,
  pendingDrag,
  onDrop,
  onOpen,
}: {
  label: string;
  side: BattleSide;
  zone: "void" | "banished";
  count: number;
  pendingDrag: PendingDragState;
  onDrop: (sourceSurface: BattleCommandSourceSurface) => void;
  onOpen: () => void;
}) {
  const isDropTarget = pendingDrag !== null;

  return (
    <button
      type="button"
      data-battle-region={`${side}-${zone}-zone`}
      data-battle-zone-open={`${side}:${zone}`}
      data-battle-zone-count={String(count)}
      data-battle-zone-drop-target={isDropTarget ? `${side}:${zone}` : undefined}
      className={`battle-small-zone ${side} ${zone} ${isDropTarget ? "drop-target" : ""}`}
      onClick={onOpen}
      onDragOver={(event) => {
        if (isDropTarget) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (pendingDrag === null) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDrop(pendingDrag.sourceSurface);
      }}
    >
      <span className="battle-small-zone-label">{label}</span>
      <span className="battle-small-zone-count">{String(count)}</span>
    </button>
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
  onCardHoverStart,
  onCardHoverMove,
  onCardHoverEnd,
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
  onCardHoverStart: (battleCardId: string, event: ReactPointerMouseEvent<HTMLDivElement>) => void;
  onCardHoverMove: (battleCardId: string, event: ReactPointerMouseEvent<HTMLDivElement>) => void;
  onCardHoverEnd: () => void;
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
                onMouseEnter={(event) => onCardHoverStart(entry.battleCardId, event)}
                onMouseMove={(event) => onCardHoverMove(entry.battleCardId, event)}
                onMouseLeave={onCardHoverEnd}
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

/**
 * A slim banner across the top of the battle stage describing the AI's held
 * proposal in plain language (the same description carried on {@link AiProposal}).
 * It surfaces what the AI wants to do while the human decides whether to approve
 * or reject via the phase-control icons. Renders nothing when no proposal is
 * held (the human's own turn, AI mode off, or the battle is over).
 */
function BattleAiProposalBanner({ proposal }: { proposal: AiProposal | null }) {
  if (proposal === null) {
    return null;
  }

  return (
    <div
      className="battle-ai-proposal-banner"
      data-battle-ai-proposal={proposal.kind}
      aria-live="polite"
    >
      <span className="battle-ai-proposal-banner-label">AI proposes</span>
      <span
        className="battle-ai-proposal-banner-description"
        data-battle-ai-proposal-description
      >
        {proposal.description}
      </span>
    </div>
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

type BattleFlowTarget = {
  phase: BattlePhase;
  activeSide: BattleSide;
  turnNumber: number;
  preview: string;
};

function BattlePhaseFloatControls({
  state,
  proposal,
  onApprove,
  onReject,
  onSetBattleFlow,
}: {
  state: BattleMutableState;
  proposal: AiProposal | null;
  onApprove: () => void;
  onReject: () => void;
  onSetBattleFlow: (target: BattleFlowTarget) => void;
}) {
  // While the AI holds a proposal, the phase cluster becomes its approve/reject
  // controls: a check approves; a cross rejects a card-play action (phase- and
  // turn-ending proposals cannot be rejected).
  if (proposal !== null) {
    const approveLabel = proposal.kind === "action"
      ? "Approve AI play"
      : "Approve — pass phase";
    return (
      <div
        className="phase-float-actions phase-float-actions--proposal"
        aria-label="AI proposal controls"
      >
        <button
          type="button"
          className="phase-float-button approve"
          data-battle-ai-proposal-approve
          aria-label={approveLabel}
          title={`${approveLabel} (${proposal.description})`}
          onClick={onApprove}
        >
          <i className="bx bx-check" aria-hidden="true" />
        </button>
        {proposal.kind === "action" ? (
          <button
            type="button"
            className="phase-float-button reject"
            data-battle-ai-proposal-reject
            aria-label="Reject AI play"
            title="Reject AI play"
            onClick={onReject}
          >
            <i className="bx bx-x" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  }

  const previousTarget = computePhaseControlTarget(state, "previous");
  const nextTarget = computePhaseControlTarget(state, "next");
  const nextMajorTarget = computePhaseControlTarget(state, "next-major");

  return (
    <div className="phase-float-actions" aria-label="Phase controls">
      <button
        type="button"
        className="phase-float-button"
        data-battle-phase-control="previous"
        data-preview={previousTarget.preview}
        aria-label={previousTarget.preview}
        title={previousTarget.preview}
        onClick={() => onSetBattleFlow(previousTarget)}
      >
        <i className="bx bx-arrow-left" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="phase-float-button"
        data-battle-phase-control="next"
        data-preview={nextTarget.preview}
        aria-label={nextTarget.preview}
        title={nextTarget.preview}
        onClick={() => onSetBattleFlow(nextTarget)}
      >
        <i className="bx bx-arrow-right" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="phase-float-button"
        data-battle-phase-control="next-major"
        data-preview={nextMajorTarget.preview}
        aria-label={nextMajorTarget.preview}
        title={nextMajorTarget.preview}
        onClick={() => onSetBattleFlow(nextMajorTarget)}
      >
        <i className="bx bx-skip-next" aria-hidden="true" />
      </button>
    </div>
  );
}

function computePhaseControlTarget(
  state: BattleMutableState,
  control: "previous" | "next" | "next-major",
): BattleFlowTarget {
  const currentPhase = normalizePhaseForControls(state.phase);
  const currentIndex = PHASE_CONTROL_SEQUENCE.indexOf(currentPhase);
  const { didWrap, nextIndex } = (() => {
    if (control === "previous") {
      const index = currentIndex - 1;
      return { didWrap: index < 0, nextIndex: index };
    }
    if (control === "next") {
      const index = currentIndex + 1;
      return { didWrap: index >= PHASE_CONTROL_SEQUENCE.length, nextIndex: index };
    }
    const nextDayOrNight = PHASE_CONTROL_SEQUENCE.findIndex(
      (phase, index) => index > currentIndex && (phase === "day" || phase === "night"),
    );
    if (nextDayOrNight >= 0) {
      return { didWrap: false, nextIndex: nextDayOrNight };
    }
    return {
      didWrap: true,
      nextIndex: PHASE_CONTROL_SEQUENCE.findIndex((phase) => phase === "day"),
    };
  })();
  const normalizedNextIndex = (nextIndex + PHASE_CONTROL_SEQUENCE.length) % PHASE_CONTROL_SEQUENCE.length;
  // A forward control that flips into the next turn always lands on that turn's
  // Dreamwell phase — the start-of-turn stop the player clicks through after
  // seeing the drawn Dreamwell card — even the skip control, so the Dreamwell
  // reveal is never bypassed on a turn change.
  const phase: BattlePhase =
    didWrap && control !== "previous"
      ? "dreamwell"
      : PHASE_CONTROL_SEQUENCE[normalizedNextIndex];
  const turnPair = didWrap
    ? control === "previous"
      ? decrementBattleTurnPair(state.activeSide, state.turnNumber)
      : advanceBattleTurnPair(state.activeSide, state.turnNumber)
    : { activeSide: state.activeSide, turnNumber: state.turnNumber };
  const action = control === "previous" ? "Return" : "Advance";

  return {
    phase,
    ...turnPair,
    preview: `${action} to ${formatPhaseLabel(phase)}`,
  };
}

function normalizePhaseForControls(phase: BattleMutableState["phase"]): (typeof PHASE_CONTROL_SEQUENCE)[number] {
  switch (phase) {
    // Draw and Dawn run as bookkeeping during the turn handoff and are never the
    // resting phase; the surfaced start-of-turn stop is Dreamwell.
    case "draw":
    case "dawn":
      return "dreamwell";
    case "ending":
      return "night";
    default:
      return phase;
  }
}

function advanceBattleTurnPair(
  activeSide: BattleSide,
  turnNumber: number,
): {
  activeSide: BattleSide;
  turnNumber: number;
} {
  if (activeSide === "player") {
    return { activeSide: "enemy", turnNumber };
  }
  return { activeSide: "player", turnNumber: turnNumber + 1 };
}

function decrementBattleTurnPair(
  activeSide: BattleSide,
  turnNumber: number,
): {
  activeSide: BattleSide;
  turnNumber: number;
} {
  if (activeSide === "enemy") {
    return { activeSide: "player", turnNumber };
  }
  return { activeSide: "enemy", turnNumber: Math.max(1, turnNumber - 1) };
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

function resolveEnemyDreamcallerSummary(
  enemyDescriptor: BattleEnemyDescriptor,
  questContent: QuestContent,
): BattleDreamcallerSummary {
  const sourceDreamcaller = findEnemySourceDreamcaller(enemyDescriptor, questContent);
  return {
    id: sourceDreamcaller?.id ?? enemyDescriptor.id,
    imageNumber: enemyDescriptor.imageNumber ?? sourceDreamcaller?.imageNumber ?? "001",
    name: enemyDescriptor.name,
    renderedText: enemyDescriptor.abilityText,
    title: enemyDescriptor.subtitle,
  };
}

function findEnemySourceDreamcaller(
  enemyDescriptor: BattleEnemyDescriptor,
  questContent: QuestContent,
) {
  const sourceId = parseEnemySourceDreamcallerId(enemyDescriptor.id);
  if (sourceId !== null) {
    const byId = questContent.dreamcallers.find((dreamcaller) => dreamcaller.id === sourceId);
    if (byId !== undefined) {
      return byId;
    }
  }

  const descriptorName = enemyDescriptor.name.toLocaleLowerCase();
  return questContent.dreamcallers.find((dreamcaller) => {
    const fullName = dreamcaller.name.toLocaleLowerCase();
    const shortName = fullName.split(",")[0] ?? fullName;
    return descriptorName === fullName ||
      descriptorName === shortName ||
      descriptorName.endsWith(` ${fullName}`) ||
      descriptorName.endsWith(` ${shortName}`);
  });
}

function parseEnemySourceDreamcallerId(enemyId: string): string | null {
  const prefix = "enemy:";
  if (!enemyId.startsWith(prefix)) {
    return null;
  }
  const sourceAndSeed = enemyId.slice(prefix.length);
  const seedSeparator = sourceAndSeed.lastIndexOf(":");
  if (seedSeparator <= 0) {
    return null;
  }
  return sourceAndSeed.slice(0, seedSeparator);
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

  return Math.min(wrapWidth / naturalWidth, wrapHeight / naturalHeight);
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
