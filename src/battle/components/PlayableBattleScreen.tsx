import "../battle.css";

import type {
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SiteState } from "../../types/quest";
import type { CardData } from "../../types/cards";
import type { UiVariant } from "../../runtime/runtime-config";
import {
  createBattleLogBaseFields,
  logEvent,
  logEventOnce,
} from "../../logging";
import { useQuest } from "../../state/quest-context";
import { PoolViewer } from "../../components/PoolViewer";
import {
  useActions,
  useAppend,
  useClientId,
  useConfirmedPromptId,
  useConnectedCount,
  useGameState,
} from "../../coop/hooks";
import {
  opponentCarriesDreamsign,
  resolveRunLayerCount,
} from "../integration/opponent-deck";
import {
  selectBattleCardLocation,
  selectBattlefieldSlotOccupant,
  selectFailureOverlayResult,
} from "../state/selectors";
import { drawsAtStartOfTurn } from "../state/turn-utils";
import { formatPhaseLabel, formatSideLabel } from "../ui/format";
import type {
  BattleCommandSourceSurface,
  BattleDeckCardDefinition,
  BattleDreamcallerSummary,
  BattleEnemyDescriptor,
  BattleFieldSlotAddress,
  BattlefieldSlotId,
  BattleHistory,
  BattleMutableState,
  BattlePhase,
  BattleSide,
  BrowseableZone,
} from "../types";
import type { QuestContent } from "../../data/quest-content";
import type { BattleCommand } from "../debug/commands";
import type { PromptResolution } from "../../rules/battle/effect-runner-core";
import { useBattleAi, type AiProposal } from "../ai/use-battle-ai";
import { aiMayRunHere } from "../ai/ai-may-run-here";
import { dreamwellEnergyEdits } from "../engine/energy";
import { planBasicAutomationCommands } from "../../rules/battle/basic-automation";
import { BattleActionBar } from "./BattleActionBar";
import { BattleContextMenu } from "./BattleContextMenu";
import { BattleDeckOrderPicker } from "./BattleDeckOrderPicker";
import { BattleDreamcallerPanel } from "./BattleDreamcallerPanel";
import { BattleFigmentCreator } from "./BattleFigmentCreator";
import { BattleForeseeOverlay } from "./BattleForeseeOverlay";
import { automaticBattleIntentKey } from "../automatic-intent-key";
import { BattleHandTray } from "./BattleHandTray";
import { BattleInspector } from "./BattleInspector";
import { BattleCardNoteEditor } from "./BattleCardNoteEditor";
import { BattleDreamwellHistoryDrawer } from "./BattleDreamwellHistoryDrawer";
import { BattleLogDrawer } from "./BattleLogDrawer";
import { BattleResultOverlay } from "./BattleResultOverlay";
import { BattleRewardSurface } from "./BattleRewardSurface";
import { BattleSideSummaryPopover } from "./BattleSideSummaryPopover";
import { BattleStatusBar } from "./BattleStatusBar";
import { BattleStatusStrip } from "./BattleStatusStrip";
import { BattleGameCard } from "./BattleGameCard";
import { BattleDreamwellDisplay } from "./BattleDreamwellDisplay";
import { BattleCardPickerOverlay } from "./BattleCardPickerOverlay";
import { BattleChoicePromptOverlay } from "./BattleChoicePromptOverlay";
import { dreamwellAutomationStatus } from "../../rules/battle/dreamwell-effects-table";
import { collectAutomationHashDrift } from "../../rules/battle/battle-card-effects-table";
import { BattlefieldGrid } from "./BattlefieldGrid";
import { BattleZoneBrowser } from "./BattleZoneBrowser";
import {
  createMoveCardToBattlefieldCommand,
  createMoveCardToDeckCommand,
  createMoveCardToStackCommand,
  createMoveCardToZoneCommand,
} from "./battle-ui-commands";
import { createBaseBattleDeckCardDefinition } from "../card-definition";
import { MobileBattleScreenAdapter } from "../../screens/cumulus_adapters/MobileBattleScreenAdapter";
import { useIsDesktop } from "../../cumulus/screens/use-is-desktop";

const DESKTOP_INSPECTOR_WIDTH = 1280;
// `BattleLogDrawer` renders from the append-only coop fold, so its
// `history` prop is supplied an empty undo/redo envelope.
const EMPTY_BATTLE_HISTORY: BattleHistory = { past: [], future: [] };
// Fires the automated-card hash-drift warning at most once per page session.
let automationHashDriftWarned = false;
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
export function PlayableBattleScreen({
  site,
  aiMode = false,
  basicAutomation = false,
  uiVariant = "legacy",
}: {
  site: SiteState;
  aiMode?: boolean;
  basicAutomation?: boolean;
  uiVariant?: UiVariant;
}) {
  const battle = useGameState().battle;
  if (battle === null) {
    return null; // BattleSiteRoute already shows the loading/reveal state.
  }
  return (
    <PlayableBattleScreenInner
      site={site}
      aiMode={aiMode}
      basicAutomation={basicAutomation}
      uiVariant={uiVariant}
    />
  );
}

function PlayableBattleScreenInner({
  site,
  aiMode,
  basicAutomation,
  uiVariant,
}: {
  site: SiteState;
  aiMode: boolean;
  basicAutomation: boolean;
  uiVariant: UiVariant;
}) {
  const gameState = useGameState();
  const battle = gameState.battle;
  if (battle === null) {
    throw new Error(
      "PlayableBattleScreenInner reached without a non-null battle fold state. The wrapper component should have short-circuited.",
    );
  }
  const board = battle.board;
  const battleInit = battle.init;
  const pendingPrompt = battle.pendingPrompt;
  if (battleInit.battleId !== board.battleId) {
    throw new Error(
      `PlayableBattleScreen battleInit/board battleId mismatch: ${battleInit.battleId} vs ${board.battleId}`,
    );
  }

  const actions = useActions();
  const connectedCount = useConnectedCount();
  const append = useAppend();
  const clientId = useClientId();
  const confirmedPromptId = useConfirmedPromptId();

  const { state: questState, cardDatabase, questContent } = useQuest();
  const isDesktopInspectorLayout = useIsDesktopInspectorLayout();
  const isCumulusDesktopLayout = useIsDesktop();
  const [isInspectorDrawerOpen, setIsInspectorDrawerOpen] = useState(readIsDesktopInspectorLayout());
  const [isBattleLogOpen, setIsBattleLogOpen] = useState(false);
  const [isDreamwellHistoryOpen, setIsDreamwellHistoryOpen] = useState(false);
  const [isOpponentHandRevealed, setIsOpponentHandRevealed] = useState(false);
  // Debug "hide player hand" mode: hides your own hand and renders the enemy
  // hand full size (with hover-to-enlarge) in its place, to simulate the local
  // view of a multiplayer game where you see only the opponent's hand.
  const [isPlayerHandHidden, setIsPlayerHandHidden] = useState(false);
  const [openZoneBrowser, setOpenZoneBrowser] = useState<ZoneBrowserState>(null);
  const [pendingDrag, setPendingDrag] = useState<PendingDragState>(null);
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
  // the AI: when disabled the hook holds no proposal and submits nothing. It
  // receives the SAME live `board` and append-backed submitters the rest of the
  // screen uses, so approved commands flow back as a new `board` and the hook
  // re-plans.
  const submitAiCommand = useCallback(
    (command: BattleCommand): void => {
      void append({
        type: "BATTLE_COMMAND",
        payload: { command },
        actor: `ai:${clientId}`,
      });
    },
    [append, clientId],
  );
  const submitAiGesture = useCallback(
    (commands: readonly BattleCommand[]): void => {
      void append({
        type: "BATTLE_GESTURE",
        payload: { commands: [...commands] },
        actor: `ai:${clientId}`,
      });
    },
    [append, clientId],
  );
  const { proposal, thinking: aiThinking, approve, reject } = useBattleAi({
    board,
    submitCommand: submitAiCommand,
    submitGesture: submitAiGesture,
    enabled: aiMode && aiMayRun,
    aiSide: "enemy",
    caps: aiCaps,
    basicAutomation: isBasicAutomationEnabled,
  });

  // While the AI holds an un-approved proposal — or is still computing one — the
  // human drives only via the approve/reject icon controls in the phase cluster.
  // Locking during `aiThinking` keeps the human from acting in the brief window
  // while the planner (which now runs asynchronously, off the render path) is
  // still deciding. Normal controls (phase arrows, hand, battlefield) return once
  // no proposal is held and the AI is idle — on the human's own turn, and during
  // the AI's Dusk/Night/Challenge after its plays are done.
  const canPlayerAct = !(aiMode && (proposal !== null || aiThinking));
  const failureResult = selectFailureOverlayResult(board.result);
  const showResultOverlay = board.result !== null &&
    !isResultOverlayDismissed;
  const showReopenPill = board.result !== null &&
    isResultOverlayDismissed;
  const pendingDragCardId = pendingDrag === null
    ? null
    : pendingDrag.kind === "battle-card"
      ? pendingDrag.battleCardId
      : "__pool_viewer_card__";

  // Resolves the single open prompt from the fold. Gated on
  // `useConfirmedPromptId()` so a resolve never targets a promptId that only
  // exists as an optimistic echo — the RESOLVE_PROMPT action refuses this
  // server-side too (see `useActions`'s guard), but disabling the control here
  // avoids a round-trip rejection.
  const resolvePendingPrompt = useCallback(
    (resolution: PromptResolution): void => {
      if (pendingPrompt === null || confirmedPromptId !== pendingPrompt.promptId) {
        return;
      }
      void actions.resolvePrompt(pendingPrompt.promptId, resolution);
    },
    [actions, pendingPrompt, confirmedPromptId],
  );

  const handleCommand = useCallback((command: BattleCommand): void => {
    setPendingDrag(null);
    const intentKey = automaticBattleIntentKey(
      battleInit.battleId,
      board,
      command,
    );
    // With basic automation on, a single gesture can expand into several
    // commands (e.g. a play also spends energy; ending a turn resolves the
    // Challenge, ramps energy, and draws). The planner reads the live state and
    // returns the ordered command list; with automation off it is a passthrough.
    if (isBasicAutomationEnabled) {
      const plannedCommands = planBasicAutomationCommands(
        board,
        command,
        {
          maxEnergyCap: battleInit.maxEnergyCap,
          scoreToWin: battleInit.scoreToWin,
          dreamwellDeck: battleInit.dreamwellDeck,
        },
      );
      // Submit the expansion as ONE all-or-nothing event so an applied partner
      // event landing mid-gesture cannot bounce the tail (a card in play with
      // its cost unspent, a handoff with the incoming draw skipped). A single
      // planned command is a plain BATTLE_COMMAND.
      if (plannedCommands.length > 1) {
        void actions.battleGesture(plannedCommands, intentKey);
      } else if (plannedCommands.length === 1) {
        void actions.battleCommand(plannedCommands[0], intentKey);
      }
      return;
    }
    void actions.battleCommand(command, intentKey);
  }, [
    actions,
    isBasicAutomationEnabled,
    board,
    battleInit.maxEnergyCap,
    battleInit.scoreToWin,
    battleInit.dreamwellDeck,
    battleInit.battleId,
  ]);

  const handleOpenForesee = useCallback((side: BattleSide, count: number): void => {
    handleCommand({
      id: "DEBUG_EDIT",
      edit: { kind: "REVEAL_DECK_TOP", side, count },
      sourceSurface: "foresee-overlay",
    });
    setOpenForeseeOverlay({ side, count });
  }, [handleCommand]);

  // Deck-aware companion to the reducer's `battle_proto_dreamwell_card_drawn`:
  // logs which card a reveal is about to draw, with the detail the reducer cannot
  // see (`order`, name, `energyAdded`). Read just before dispatch so
  // `dreamwellDeckIndex` is the pre-draw position the card is taken from, and
  // `sourceSurface` distinguishes the core per-turn reveal (`auto-system`) from a
  // manual extra draw such as Lily Lake (`status-strip`). Pairing this with the
  // reducer event by (side, turn) shows the intended order vs. the actual applied
  // index, exposing any over-advance of the shared deck index.
  const logDreamwellReveal = useCallback(
    (side: BattleSide, turnNumber: number, sourceSurface: BattleCommandSourceSurface): void => {
      const drawIndex = board.dreamwellDeckIndex;
      const card = battleInit.dreamwellDeck[drawIndex];
      logEvent("battle_proto_dreamwell_card_revealed", {
        ...createBattleLogBaseFields(board, {
          sourceSurface,
          selectedCardId: null,
        }),
        side,
        drawTurnNumber: turnNumber,
        dreamwellDeckIndex: drawIndex,
        dreamwellCardId: card?.id ?? null,
        dreamwellCardName: card?.name ?? null,
        cardOrder: card?.order ?? null,
        energyAdded: card?.energyAdded ?? null,
      });
    },
    [board, battleInit.dreamwellDeck],
  );

  // Dreamwell-draw rail tool: on demand, reveal an additional Dreamwell card for
  // a side and (under basic automation) apply its energy. The shared draw index
  // advances, so this is the manual hook for effects such as Lily Lake ("Draw an
  // additional Dreamwell card"). `additional: true` opts out of the per-turn
  // reveal's idempotency guard so a deliberate extra draw always consumes the
  // next card even though the side already drew its mandatory card this turn.
  const runDreamwellDraw = useCallback((side: BattleSide): void => {
    logDreamwellReveal(side, board.turnNumber, "status-strip");
    handleCommand({
      id: "DEBUG_EDIT",
      edit: {
        kind: "DRAW_DREAMWELL_CARD",
        side,
        turnNumber: board.turnNumber,
        additional: true,
      },
      sourceSurface: "status-strip",
    });
  }, [handleCommand, logDreamwellReveal, board.turnNumber]);

  const handleSetBattleFlow = useCallback((target: BattleFlowTarget): void => {
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
    // In AI mode, the human advancing the turn into the enemy's turn IS the
    // enemy's start-of-turn handoff. With basic automation off the handoff is a
    // passthrough, so this block gives the enemy what the automated handoff
    // otherwise would: its Dreamwell reveal and energy plus its start-of-turn
    // draw. A forward player→enemy handoff keeps the turn number (see
    // `advanceBattleTurnPair`); the backward variant decrements it, so the
    // equality check excludes rewinds. When automation is on it owns every
    // start-of-turn reveal, energy, and draw (for both sides), so this shortcut
    // stands down to avoid duplicates.
    const isAiEnemyHandoff =
      aiMode &&
      !isBasicAutomationEnabled &&
      board.activeSide === "player" &&
      target.activeSide === "enemy" &&
      target.turnNumber === board.turnNumber;
    if (!isAiEnemyHandoff) {
      return;
    }

    // Read the card about to be drawn (the deck index has not advanced yet) so
    // its energy can be applied alongside the reveal even though automation is
    // off.
    const dreamwellCard = battleInit.dreamwellDeck[board.dreamwellDeckIndex];
    logDreamwellReveal("enemy", target.turnNumber, "phase-controls");
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
      board.sides.enemy.maxEnergy,
      dreamwellCard?.energyAdded ?? 0,
    )) {
      handleCommand({
        id: "DEBUG_EDIT",
        edit,
        sourceSurface: "phase-controls",
      });
    }
    // Mirror the handoff draw rule (see `drawsAtStartOfTurn`): only the first
    // player's first turn skips the draw. A player→enemy handoff keeps
    // turnNumber at 1, so the enemy (second player) still draws on its first
    // turn.
    if (drawsAtStartOfTurn("enemy", target.turnNumber)) {
      handleCommand({
        id: "DEBUG_EDIT",
        edit: { kind: "DRAW_CARD", side: "enemy" },
        sourceSurface: "phase-controls",
      });
    }
  }, [
    aiMode,
    battleInit.dreamwellDeck,
    board.activeSide,
    board.dreamwellDeckIndex,
    board.sides.enemy.maxEnergy,
    board.turnNumber,
    handleCommand,
    isBasicAutomationEnabled,
    logDreamwellReveal,
  ]);

  // Dreamwell reveal: whenever the active side rests on its Dreamwell phase
  // without having drawn this turn's Dreamwell card yet, reveal it (rules §The
  // Dreamwell and Energy). This is core turn flow — it fires regardless of basic
  // automation so the card is always shown — while the energy it grants is
  // folded in by the automation expansion of `DRAW_DREAMWELL_CARD`.
  //
  // Every connected client may observe this durable condition. The automatic
  // battle intent key identifies the battle, side, and turn, so the room log
  // commits one reveal and reconciles every observer to that winning event.
  const activeSide = board.activeSide;
  const activePhase = board.phase;
  const activeTurnNumber = board.turnNumber;
  const battleResult = board.result;
  useEffect(() => {
    if (battleResult !== null || activePhase !== "dreamwell") {
      return;
    }
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

  // Round 1 surfaces no Dreamwell card (see `isDreamwellDisplayVisible` below),
  // so the player should not have to click through an empty Dreamwell phase.
  // Once round 1's reveal has committed — `dreamwellDrawnTurn` reaches this turn,
  // so its energy is already applied — auto-advance to the Day phase for the
  // locally-driven side. Skipped on the AI's own turn (the AI driver advances
  // itself) and when automation is off (the operator is stepping manually).
  // The event-log intent key owns the once-per-(battle, side, turn) transition.
  const activeDreamwellDrawnTurn =
    board.sides[activeSide].dreamwellDrawnTurn;
  useEffect(() => {
    if (battleResult !== null || activePhase !== "dreamwell") {
      return;
    }
    if (activeTurnNumber > 1 || !isBasicAutomationEnabled) {
      return;
    }
    if (aiMode && activeSide === "enemy") {
      return;
    }
    // Wait for this turn's Dreamwell reveal to land so its energy is applied
    // before the phase advances.
    if (activeDreamwellDrawnTurn !== activeTurnNumber) {
      return;
    }
    handleCommand({
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "day" },
      sourceSurface: "auto-system",
    });
  }, [
    handleCommand,
    aiMode,
    isBasicAutomationEnabled,
    activeSide,
    activePhase,
    activeTurnNumber,
    battleResult,
    activeDreamwellDrawnTurn,
  ]);

  // The Dreamwell card the active side is currently showing (the card at its
  // recorded draw index), rendered centered above the battlefield while the
  // Dreamwell phase is active.
  const activeDreamwellCardIndex =
    board.sides[activeSide].dreamwellCardIndex;
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
      art: definition.art,
    };
  }, [activeDreamwellCardIndex, battleInit.dreamwellDeck]);
  // The Dreamwell card is hidden during the opening round (turn 1): no card is
  // surfaced until each side reaches its Dreamwell phase on a later turn.
  //
  // `dreamwellCardIndex` persists across turns — between this side's reveals it
  // still points at the card it drew last turn. The Dreamwell phase begins
  // before this turn's `DRAW_DREAMWELL_CARD` reveal has committed, so surfacing
  // the card the instant the phase opens would flash the previous turn's card
  // until the draw lands. Gate on the draw having committed for this turn
  // (`dreamwellDrawnTurn === activeTurnNumber`) so the card appears only once it
  // is this turn's card; the brief pre-draw moment shows no card rather than a
  // stale one.
  const isDreamwellDisplayVisible =
    activePhase === "dreamwell" &&
    battleResult === null &&
    activeTurnNumber > 1 &&
    activeDreamwellDrawnTurn === activeTurnNumber;

  useEffect(() => {
    const baseFields = createBattleLogBaseFields(board, {
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
        enemyHand: board.sides.enemy.hand.map(
          (battleCardId) => board.cardInstances[battleCardId]?.definition.name ?? "Card",
        ),
        enemyHandSize: board.sides.enemy.hand.length,
        openingHandSize: battleInit.openingHandSize,
        playerHand: board.sides.player.hand.map(
          (battleCardId) => board.cardInstances[battleCardId]?.definition.name ?? "Card",
        ),
      },
    );
    // This effect is keyed by `battleId` (via `logEventOnce`), so it fires once
    // per battle — intentionally reading `board` only at that first commit
    // rather than tracking it as a reactive dependency.
  }, [battleInit.battleId, battleInit.battleEntryKey, battleInit.enemyDescriptor.name, battleInit.openingHandSize, battleInit.seed, battleInit.siteId]);

  useEffect(() => {
    if (board.result === null) {
      setRewardOverlay(null);
      setIsResultOverlayDismissed(false);
      return;
    }

    if (board.result === "victory" && rewardOverlay === null) {
      setRewardOverlay({
        rewardSource: "battle_result",
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
      setIsDreamwellHistoryOpen(false);
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
  }, [board.result, rewardOverlay]);

  useEffect(() => {
    setIsOpponentHandRevealed(false);
  }, [battleInit.battleId]);

  useEffect(() => {
    if (!isDesktopInspectorLayout) {
      return;
    }
    setIsInspectorDrawerOpen(true);
  }, [isDesktopInspectorLayout]);

  // Developer nudge: warn once per session if any automated card's live rules
  // text has drifted away from the script that automates it. This is purely a
  // console warning — it never throws or alters battle behavior — and is
  // defensive against a partially loaded catalog. The CI-gate test
  // `battle-card-effects-hash.test.ts` is the authoritative guard; this surfaces
  // the same drift to a developer running the app.
  useEffect(() => {
    if (automationHashDriftWarned) {
      return;
    }
    try {
      const cardsById = new Map<string, string>();
      const namesById = new Map<string, string>();
      for (const card of cardDatabase.values()) {
        cardsById.set(card.id, card.renderedText);
        namesById.set(card.id, card.name);
      }
      const drift = collectAutomationHashDrift(cardsById);
      if (drift.length === 0) {
        return;
      }
      automationHashDriftWarned = true;
      const annotated = drift.map((entry) => ({
        ...entry,
        name: namesById.get(entry.id) ?? null,
        // actual === null means the registered card is absent from the catalog,
        // which reads differently from a hash mismatch.
        reason: entry.actual === null ? "missing-from-catalog" : "text-drift",
      }));
      logEventOnce("battle_proto_automation_hash_drift", "battle_proto_automation_hash_drift", {
        drift: annotated,
      });
      const details = annotated
        .map(({ id, name, reason }) => `  - ${id} (${name ?? "missing from catalog"}) [${reason}]`)
        .join("\n");
      console.warn(
        `Automated battle-card rules text drifted from its script for the ` +
          `following card(s). Re-check each card's automation script in ` +
          `battle-card-effects-table.ts and update its stored textHash:\n${details}`,
      );
    } catch {
      // Catalog unavailable or malformed; skip the developer nudge silently.
    }
  }, [cardDatabase]);

  function handleHandCardClick(_battleCardId: string): void {
    setContextMenu(null);
  }

  function handleHandCardDoubleClick(battleCardId: string): void {
    if (!canPlayerAct) {
      return;
    }
    const side = selectBattleCardLocation(board, battleCardId)?.side ?? "player";
    const command = createMoveCardToBattlefieldCommand(
      board,
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

  // The reducer's `applyDefeat` (END_BATTLE "defeat") already freezes the
  // `failureSummary` from the terminal board and routes the quest slice to the
  // `questFailed` screen — the whole legacy `beginQuestFailureRoute` bridge
  // (building the summary client-side, dispatching `setFailureSummary`,
  // clearing the shared battle slot) collapses to a single event.
  function handleFailureReset(): void {
    if (failureResult === null) {
      return;
    }
    void actions.endBattle("defeat");
  }

  // Debug-only "Reset battle" control. The coop battle fold is append-only, so
  // this dismisses the transient local overlays and selection state. It is a
  // pure client-side reset with no effect on the shared battle log.
  function handleResetBattle(): void {
    setPendingDrag(null);
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
  }

  // The reducer's `applyVictory` (END_BATTLE "victory") already performs the
  // completion-level bump, screen route, modifier decrement, and dreamscape
  // clear — the legacy `completeBattleSiteVictory` bridge collapses to one
  // event.
  function handleContinueReward(): void {
    if (rewardOverlay === null || rewardOverlay.locked) {
      return;
    }
    setRewardOverlay((current) => current === null
      ? null
      : { ...current, locked: true });
    void actions.endBattle("victory");
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
    const location = selectBattleCardLocation(board, battleCardId);
    const instance = board.cardInstances[battleCardId];
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
      ? selectBattleCardLocation(board, pendingDrag.battleCardId)
      : null;
    const targetOccupant = selectBattlefieldSlotOccupant(board, target);

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

    const side = selectBattleCardLocation(board, pendingDrag.battleCardId)?.side ?? "player";
    handleCommand(
      createMoveCardToStackCommand(pendingDrag.battleCardId, side, pendingDrag.sourceSurface),
    );
    setPendingDrag(null);
  }

  const enemyDreamcallerSummary = resolveEnemyDreamcallerSummary(
    battleInit.enemyDescriptor,
    questContent,
  );

  // The opponent's Dreamcaller ability comes online from the run midpoint on —
  // the same gate that grants its dreamsign. Before that point it lies dormant,
  // so the enemy side summary labels the ability as inactive.
  const enemyDreamcallerAbilityActive = opponentCarriesDreamsign(
    battleInit.completionLevelAtStart,
    resolveRunLayerCount(battleInit.atlasSnapshot.layers),
  );

  const showCumulusMobileLayout = uiVariant === "cumulus" && !isCumulusDesktopLayout;
  useEffect(() => {
    if (!showCumulusMobileLayout) {
      return;
    }
    logEventOnce(
      `battle_mobile_surface_opened:${battleInit.battleId}`,
      "battle_mobile_surface_opened",
      {
        battleId: battleInit.battleId,
        enemyHandSize: board.sides.enemy.hand.length,
        playerHandSize: board.sides.player.hand.length,
        uiVariant: "cumulus",
      },
    );
  }, [
    battleInit.battleId,
    board.sides.enemy.hand.length,
    board.sides.player.hand.length,
    showCumulusMobileLayout,
  ]);

  if (showCumulusMobileLayout) {
    return (
      <MobileBattleScreenAdapter
        init={battleInit}
        board={board}
        enemyDreamcaller={enemyDreamcallerSummary}
        interactions={{
          canInteract: canPlayerAct,
          pendingCardId: pendingDragCardId,
          onHandCardActivate: handleHandCardDoubleClick,
          onCardDragStart: (battleCardId, source) => {
            handleCardDragStart(
              battleCardId,
              source === "player-hand" ? "hand-tray" : "battlefield",
            );
          },
          onCardDragEnd: handleCardDragEnd,
          onSlotDrop: ({ owner, rank, slotId }) => {
            handleSlotDrop({
              side: owner,
              zone: rank === "back" ? "backRank" : "frontRank",
              slotId: slotId as BattlefieldSlotId,
            });
          },
          onZoneDrop: ({ owner, zone }) => {
            handleZoneDrop(
              owner,
              zone,
              pendingDrag?.sourceSurface ?? "battlefield",
            );
          },
          onPreviousPhase: () => {
            handleSetBattleFlow(computePhaseControlTarget(board, "previous"));
          },
          onNextPhase: () => {
            handleSetBattleFlow(computePhaseControlTarget(board, "next"));
          },
        }}
      />
    );
  }

  return (
    <div
      className="battle-shell"
      data-battle-inspector-open={isInspectorDrawerOpen ? "true" : "false"}
      data-battle-opponent-hand-revealed={isOpponentHandRevealed ? "true" : "false"}
      data-battle-player-hand-hidden={isPlayerHandHidden ? "true" : "false"}
    >
      {openZoneBrowser !== null ? (
        <BattleZoneBrowser
          browser={openZoneBrowser}
          isOpponentHandRevealed={isOpponentHandRevealed}
          state={board}
          onClose={() => setOpenZoneBrowser(null)}
          onCommand={handleCommand}
          onOpenForesee={handleOpenForesee}
          onOpenReorderMultiple={(side) => setOpenDeckOrderPicker(side)}
          onCardContextMenu={handleCardContextMenu}
          onCardDragStart={handleCardDragStart}
          onCardDragEnd={handleCardDragEnd}
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
          state={board}
          onClose={() => setOpenForeseeOverlay(null)}
          onDispatch={handleCommand}
        />
      ) : null}
      {/* The single open prompt from the fold — ▸Materialized, Dreamwell script,
          and Support runs alike all park at `battle.pendingPrompt`; the driver
          (not the client) owns which one is open. The resolve controls are
          disabled until `useConfirmedPromptId()` confirms the opening event, so
          a resolve never targets a promptId that only exists optimistically. */}
      {pendingPrompt !== null && pendingPrompt.options.kind === "pick-cards" ? (
        <BattleCardPickerOverlay
          title={pendingPrompt.options.label}
          candidateIds={pendingPrompt.options.candidateIds}
          count={pendingPrompt.options.count}
          optional={pendingPrompt.options.optional}
          highlightCardIds={pendingPrompt.options.highlightCardIds}
          state={board}
          onConfirm={(ids) => resolvePendingPrompt({ kind: "pick-cards", chosenIds: ids })}
          onSkip={() => resolvePendingPrompt({ kind: "pick-cards", chosenIds: [] })}
        />
      ) : null}
      {pendingPrompt !== null && pendingPrompt.options.kind === "choice" ? (
        <BattleChoicePromptOverlay
          title={pendingPrompt.options.label}
          options={pendingPrompt.options.options}
          onChoose={(i) => resolvePendingPrompt({ kind: "choice", optionIndex: i })}
        />
      ) : null}
      {pendingPrompt !== null &&
      pendingPrompt.options.kind === "foresee" &&
      openForeseeOverlay === null ? (
        <BattleForeseeOverlay
          initialCount={pendingPrompt.options.count}
          side={pendingPrompt.run.side}
          state={board}
          onDispatch={handleCommand}
          onClose={() => resolvePendingPrompt({ kind: "foresee" })}
        />
      ) : null}
      {openDeckOrderPicker !== null ? (
        <BattleDeckOrderPicker
          initialOrder={board.sides[openDeckOrderPicker].deck}
          scopeLabel="full"
          side={openDeckOrderPicker}
          state={board}
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
          state={board}
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
          state={board}
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
          state={board}
          title={openSideSummary === "player"
            ? battleInit.dreamcallerSummary?.name ?? "Player"
            : battleInit.enemyDescriptor.name}
          subtitle={openSideSummary === "player"
            ? battleInit.dreamcallerSummary?.title ?? ""
            : battleInit.enemyDescriptor.subtitle}
          dreamcaller={openSideSummary === "player" ? battleInit.dreamcallerSummary : enemyDreamcallerSummary}
          dreamsigns={openSideSummary === "player"
            ? battleInit.dreamsignSummaries
            : battleInit.enemyDescriptor.dreamsigns}
          dreamcallerAbilityInactive={
            openSideSummary === "enemy" && !enemyDreamcallerAbilityActive
          }
          isActive={board.activeSide === openSideSummary}
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
            activeSide={board.activeSide}
            battleId={battleInit.battleId}
            enemyName={battleInit.enemyDescriptor.name}
            enemyScore={board.sides.enemy.score}
            futureCount={0}
            hasAiOpponent={aiMode}
            historyCount={0}
            phase={board.phase}
            playerScore={board.sides.player.score}
            result={board.result}
            roundNumber={board.turnNumber}
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
            activeSide={board.activeSide}
            phase={board.phase}
            result={board.result}
            turnNumber={board.turnNumber}
          />
          <BattleAiProposalBanner
            proposal={aiMode ? proposal : null}
            thinking={aiMode && aiThinking}
          />
          {isOpponentHandRevealed ? (
            <div className={isPlayerHandHidden ? "opponent-hand-zone" : "opponent-hand-zone compact"}>
              <BattleHandTray
                canInteract={canPlayerAct}
                side="opponent"
                compact={!isPlayerHandHidden}
                isBasicAutomationEnabled={isBasicAutomationEnabled}
                currentEnergy={board.sides.enemy.currentEnergy}
                hand={board.sides.enemy.hand}
                onHandCardAction={handleCommand}
                openingHandSize={battleInit.openingHandSize}
                playerDrawSkipsTurnOne={battleInit.playerDrawSkipsTurnOne}
                selectedCardId={null}
                state={board}
                onCardClick={handleHandCardClick}
                onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "opponent-hand-tray")}
                onCardDoubleClick={handleHandCardDoubleClick}
                onCardDragStart={handleCardDragStart}
                onCardDragEnd={handleCardDragEnd}
                onCardDropToHand={(sourceSurface) => handleZoneDrop("enemy", "hand", sourceSurface)}
                pendingDragCardId={pendingDragCardId}
                pendingDragSourceSurface={pendingDrag?.sourceSurface ?? null}
                isCardPlayable={undefined}
              />
            </div>
          ) : null}
          <div className="stage">
            <BattleDreamwellDisplay
              card={dreamwellDisplayCard}
              side={activeSide}
              visible={isDreamwellDisplayVisible}
              automationStatus={dreamwellDisplayCard ? dreamwellAutomationStatus(dreamwellDisplayCard.id) : "none"}
              automationEnabled={isBasicAutomationEnabled}
            />
            <div className="battlefield-zone-layout">
              <BattleStackZone
                state={board}
                pendingDragCardId={pendingDragCardId}
                onDrop={handleStackDrop}
                onCardClick={handleBattlefieldCardClick}
                onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                onCardDragStart={handleCardDragStart}
                onCardDragEnd={handleCardDragEnd}
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
                    count={board.sides.player.banished.length}
                    pendingDrag={pendingDrag}
                    onDrop={(sourceSurface) => handleZoneDrop("player", "banished", sourceSurface)}
                    onOpen={() => handleOpenZoneBrowser("player", "banished")}
                  />
                  <BattleSmallZoneDropTarget
                    label="Void"
                    side="player"
                    zone="void"
                    count={board.sides.player.void.length}
                    pendingDrag={pendingDrag}
                    onDrop={(sourceSurface) => handleZoneDrop("player", "void", sourceSurface)}
                    onOpen={() => handleOpenZoneBrowser("player", "void")}
                  />
                </div>
                <BattleStatusStrip
                  dreamcaller={battleInit.dreamcallerSummary}
                  side="player"
                  sideState={board.sides.player}
                  subtitle={battleInit.dreamcallerSummary?.title ?? ""}
                  title={battleInit.dreamcallerSummary?.name ?? "Player"}
                  isActive={board.activeSide === "player"}
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
                    state={board}
                    canInteract={canPlayerAct}
                    isBasicAutomationEnabled={isBasicAutomationEnabled}
                    selectedCardId={null}
                    selectedSlot={null}
                    selectionAnchor={null}
                    handSelectionSide={null}
                    pendingDragCardId={pendingDragCardId}
                    onCardClick={handleBattlefieldCardClick}
                    onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                    onCardDragStart={handleCardDragStart}
                    onCardDragEnd={handleCardDragEnd}
                    onSlotClick={handleBattlefieldSlotClick}
                    onSlotDrop={handleSlotDrop}
                  />
                  <BattlefieldGrid
                    side="enemy"
                    zone="frontRank"
                    state={board}
                    canInteract={canPlayerAct}
                    isBasicAutomationEnabled={isBasicAutomationEnabled}
                    selectedCardId={null}
                    selectedSlot={null}
                    selectionAnchor={null}
                    handSelectionSide={null}
                    pendingDragCardId={pendingDragCardId}
                    onCardClick={handleBattlefieldCardClick}
                    onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                    onCardDragStart={handleCardDragStart}
                    onCardDragEnd={handleCardDragEnd}
                    onSlotClick={handleBattlefieldSlotClick}
                    onSlotDrop={handleSlotDrop}
                  />
                  <div
                    data-battle-region="judgment-divider"
                    className={`judgment-divider ${board.phase === "challenge" ? "active" : ""}`}
                  />
                  <BattlefieldGrid
                    side="player"
                    zone="frontRank"
                    state={board}
                    canInteract={canPlayerAct}
                    isBasicAutomationEnabled={isBasicAutomationEnabled}
                    selectedCardId={null}
                    selectedSlot={null}
                    selectionAnchor={null}
                    handSelectionSide={null}
                    pendingDragCardId={pendingDragCardId}
                    onCardClick={handleBattlefieldCardClick}
                    onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                    onCardDragStart={handleCardDragStart}
                    onCardDragEnd={handleCardDragEnd}
                    onSlotClick={handleBattlefieldSlotClick}
                    onSlotDrop={handleSlotDrop}
                  />
                  <BattlefieldGrid
                    side="player"
                    zone="backRank"
                    state={board}
                    canInteract={canPlayerAct}
                    isBasicAutomationEnabled={isBasicAutomationEnabled}
                    selectedCardId={null}
                    selectedSlot={null}
                    selectionAnchor={null}
                    handSelectionSide={null}
                    pendingDragCardId={pendingDragCardId}
                    onCardClick={handleBattlefieldCardClick}
                    onCardContextMenu={(battleCardId, event) => handleCardContextMenu(battleCardId, event, "battlefield")}
                    onCardDragStart={handleCardDragStart}
                    onCardDragEnd={handleCardDragEnd}
                    onSlotClick={handleBattlefieldSlotClick}
                    onSlotDrop={handleSlotDrop}
                  />
                </div>
              </ScaledBattlefield>
              <div className="battle-side-zone-column enemy">
                <BattleStatusStrip
                  side="enemy"
                  dreamcaller={enemyDreamcallerSummary}
                  sideState={board.sides.enemy}
                  subtitle={battleInit.enemyDescriptor.subtitle}
                  title={battleInit.enemyDescriptor.name}
                  isActive={board.activeSide === "enemy"}
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
                    count={board.sides.enemy.void.length}
                    pendingDrag={pendingDrag}
                    onDrop={(sourceSurface) => handleZoneDrop("enemy", "void", sourceSurface)}
                    onOpen={() => handleOpenZoneBrowser("enemy", "void")}
                  />
                  <BattleSmallZoneDropTarget
                    label="Banished"
                    side="enemy"
                    zone="banished"
                    count={board.sides.enemy.banished.length}
                    pendingDrag={pendingDrag}
                    onDrop={(sourceSurface) => handleZoneDrop("enemy", "banished", sourceSurface)}
                    onOpen={() => handleOpenZoneBrowser("enemy", "banished")}
                  />
                </div>
                <BattlePhaseFloatControls
                  state={board}
                  proposal={aiMode ? proposal : null}
                  onApprove={approve}
                  onReject={reject}
                  onSetBattleFlow={handleSetBattleFlow}
                />
              </div>
            </div>
          </div>
          {isPlayerHandHidden ? null : (
            <div className={isOpponentHandRevealed ? "player-hand-zone compact" : "player-hand-zone"}>
              <BattleHandTray
                canInteract={canPlayerAct}
                compact={isOpponentHandRevealed}
                isBasicAutomationEnabled={isBasicAutomationEnabled}
                currentEnergy={board.sides.player.currentEnergy}
                hand={board.sides.player.hand}
                onHandCardAction={handleCommand}
                openingHandSize={battleInit.openingHandSize}
                playerDrawSkipsTurnOne={battleInit.playerDrawSkipsTurnOne}
                selectedCardId={null}
                state={board}
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
          )}
          <BattleActionBar
            dreamsigns={battleInit.dreamsignSummaries}
            isBasicAutomationEnabled={isBasicAutomationEnabled}
            isBattleLogOpen={isBattleLogOpen}
            isDesktopInspectorLayout={isDesktopInspectorLayout}
            isInspectorDrawerOpen={isInspectorDrawerOpen}
            onOpenForesee={(_side, _count) => undefined}
            onToggleBasicAutomation={() => setIsBasicAutomationEnabled((value) => !value)}
            onToggleBattleLog={() => {
              setIsBattleLogOpen((value) => !value);
              setIsDreamwellHistoryOpen(false);
            }}
            onToggleDreamwellHistory={() => {
              setIsDreamwellHistoryOpen((value) => !value);
              setIsBattleLogOpen(false);
            }}
            onToggleInspector={() => setIsInspectorDrawerOpen((value) => !value)}
          />
        </div>
        <BattleInspector
          aiMode={aiMode}
          aiProposal={proposal}
          battleInit={battleInit}
          canPlayerAct={canPlayerAct}
          isDesktopLayout={isDesktopInspectorLayout}
          isOpponentHandRevealed={isOpponentHandRevealed}
          isPlayerHandHidden={isPlayerHandHidden}
          isOpen={isInspectorDrawerOpen}
          lastTransition={null}
          state={board}
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
          onOpenForesee={handleOpenForesee}
          onOpenZone={handleOpenZoneBrowser}
          onResetBattle={handleResetBattle}
          onToggleOpponentHand={() => setIsOpponentHandRevealed((value) => !value)}
          onTogglePlayerHand={() => setIsPlayerHandHidden((value) => !value)}
        />
      </div>
      {contextMenu !== null ? (
        <BattleContextMenu
          key={`${contextMenu.battleCardId}:${contextMenu.sourceSurface}:${String(contextMenu.x)}:${String(contextMenu.y)}`}
          battleCardId={contextMenu.battleCardId}
          onOpenNoteEditor={(battleCardId) => setOpenNoteEditor(battleCardId)}
          sourceSurface={contextMenu.sourceSurface}
          state={board}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCommand={handleCommand}
        />
      ) : null}
      <BattleLogDrawer
        battleInit={battleInit}
        futureCount={0}
        history={EMPTY_BATTLE_HISTORY}
        isOpen={isBattleLogOpen}
        lastTransition={null}
        onClose={() => setIsBattleLogOpen(false)}
      />
      <BattleDreamwellHistoryDrawer
        dreamwellDeck={battleInit.dreamwellDeck}
        dreamwellDeckIndex={board.dreamwellDeckIndex}
        isOpen={isDreamwellHistoryOpen}
        onClose={() => setIsDreamwellHistoryOpen(false)}
      />
      {showResultOverlay ? (
        board.result === "victory" && rewardOverlay !== null ? (
          <BattleRewardSurface
            battleId={battleInit.battleId}
            canCancel={!rewardOverlay.locked}
            enemyName={battleInit.enemyDescriptor.name}
            essenceReward={battleInit.essenceReward}
            enemyScore={board.sides.enemy.score}
            playerScore={board.sides.player.score}
            rewardSource={rewardOverlay.rewardSource}
            turnNumber={board.turnNumber}
            isLocked={rewardOverlay.locked}
            onCancel={() => setIsResultOverlayDismissed(true)}
            onContinue={handleContinueReward}
          />
        ) : (
          <BattleResultOverlay
            result={board.result!}
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
          {board.result} — reopen
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
              <BattleGameCard
                instance={instance}
                reserved={false}
                selected={false}
                draggable
                onActivate={() => onCardClick(entry.battleCardId)}
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

/**
 * A slim banner across the top of the battle stage describing the AI's held
 * proposal in plain language (the same description carried on {@link AiProposal}).
 * It surfaces what the AI wants to do while the human decides whether to approve
 * or reject via the phase-control icons. While the planner is still computing the
 * next move (`thinking`) it shows a "thinking" placeholder so the locked controls
 * are explained. Renders nothing when the AI is idle with no proposal (the
 * human's own turn, AI mode off, or the battle is over).
 */
function BattleAiProposalBanner({
  proposal,
  thinking,
}: {
  proposal: AiProposal | null;
  thinking: boolean;
}) {
  if (proposal === null) {
    if (!thinking) {
      return null;
    }
    return (
      <div
        className="battle-ai-proposal-banner thinking"
        data-battle-ai-proposal="thinking"
        aria-live="polite"
      >
        <span className="battle-ai-proposal-banner-label">AI</span>
        <span
          className="battle-ai-proposal-banner-description"
          data-battle-ai-proposal-description
        >
          Thinking…
        </span>
      </div>
    );
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
    // Reuse the two-column phase-control grid so the approve button lands at
    // the exact position and size of the "next" phase-advance button (the
    // second/rightmost cell), with reject in the first cell. Both stay purple to
    // match the phase buttons.
    return (
      <div className="phase-float-actions" aria-label="AI proposal controls">
        {proposal.kind === "action" ? (
          <button
            type="button"
            className="phase-float-button reject"
            style={{ gridColumn: 1 }}
            data-battle-ai-proposal-reject
            aria-label="Reject AI play"
            title="Reject AI play"
            onClick={onReject}
          >
            <i className="bx bx-x" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="phase-float-button approve"
          style={{ gridColumn: 2 }}
          data-battle-ai-proposal-approve
          aria-label={approveLabel}
          title={`${approveLabel} (${proposal.description})`}
          onClick={onApprove}
        >
          <i className="bx bx-check" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const previousTarget = computePhaseControlTarget(state, "previous");
  const nextTarget = computePhaseControlTarget(state, "next");

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
    </div>
  );
}

function computePhaseControlTarget(
  state: BattleMutableState,
  control: "previous" | "next",
): BattleFlowTarget {
  const currentPhase = normalizePhaseForControls(state.phase);
  const currentIndex = PHASE_CONTROL_SEQUENCE.indexOf(currentPhase);
  const { didWrap, nextIndex } = (() => {
    if (control === "previous") {
      const index = currentIndex - 1;
      return { didWrap: index < 0, nextIndex: index };
    }
    const index = currentIndex + 1;
    return { didWrap: index >= PHASE_CONTROL_SEQUENCE.length, nextIndex: index };
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
    ...(sourceDreamcaller?.portraitFocus === undefined
      ? {}
      : { portraitFocus: sourceDreamcaller.portraitFocus }),
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
