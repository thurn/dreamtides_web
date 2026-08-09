import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SiteState } from "../../types/journey";
import type { CardData } from "../../types/cards";
import {
  createBattleLogBaseFields,
  logEvent,
  logEventOnce,
} from "../../logging";
import { useJourney } from "../../state/journey-context";
import { PoolViewerFloatingController } from "./PoolViewerFloatingController";
import {
  useActions,
  useClientId,
  useConfirmedPromptId,
  useConnectedCount,
  useGameState,
} from "../../coop/hooks";
import {
  selectBattleCardLocation,
  selectBattlefieldSlotOccupant,
  selectFailureOverlayResult,
} from "../state/selectors";
import type {
  BattleCommandSourceSurface,
  BattleDeckCardDefinition,
  BattleDreamAvatarSummary,
  BattleEnemyDescriptor,
  BattleFieldSlotAddress,
  BattlefieldSlotId,
  BattleHistory,
  BattleMutableState,
  BattlePhase,
  BattleSide,
  BrowseableZone,
} from "../types";
import type { JourneyContent } from "../../data/journey-content";
import type { BattleCommand } from "../debug/commands";
import type { PromptResolution } from "../../rules/battle/effect-runner-core";
import { useBattleAi } from "../ai/use-battle-ai";
import { aiMayRunHere, battleAiDriverEnabled } from "../ai/ai-may-run-here";
import { BattleContextMenu } from "./BattleContextMenu";
import { BattleDeckOrderPicker } from "./BattleDeckOrderPicker";
import { BattleFigmentCreator } from "./BattleFigmentCreator";
import { CumulusBattleForeseeOverlay } from "./CumulusBattleForeseeOverlay";
import { automaticBattleIntentKey } from "../automatic-intent-key";
import { BattleCardNoteEditor } from "./BattleCardNoteEditor";
import { BattleDreamwellHistoryDrawer } from "./BattleDreamwellHistoryDrawer";
import { BattleLogDrawer } from "./BattleLogDrawer";
import { collectAutomationHashDrift } from "../../rules/battle/battle-card-effects-table";
import { CumulusBattleZoneBrowser } from "./CumulusBattleZoneBrowser";
import {
  createPlayCardFromHandCommand,
  createPoolCardDropCommand,
  createMoveCardToDeckCommand,
  createMoveCardToZoneCommand,
} from "./battle-ui-commands";
import { resolveBattleInspectorIntent } from "./battle-inspector-intents";
import { createFillBattlefieldPreviewCommand } from "./battle-debug-preview";
import { createBaseBattleDeckCardDefinition } from "../card-definition";
import { MobileBattleScreenAdapter } from "../../screens/cumulus_adapters/MobileBattleScreenAdapter";
import type {
  MobileBattleFigmentMergeTarget,
  MobileBattleInspectorAction,
  MobileBattleSlotTarget,
} from "../../cumulus/screens/MobileBattleScreen";
import type { MobileBattleResultAction } from "../../cumulus/screens/BattleResultSurface";
import { useIsDesktop } from "../../cumulus/screens/use-is-desktop";
import {
  createBattlePromptOpenedLogFields,
  createBattlePromptResolutionLogFields,
  promptTextLogFields,
} from "./battle-prompt-logging";
import { BattleTutorialGuidance } from "../../cumulus/screens/BattleTutorialGuidance";
import { buildBattleTutorialGuidanceView } from "../../screens/cumulus_adapters/battle-tutorial-guidance-view-model";
import { useBattleTutorialGuidance } from "../use-battle-tutorial-guidance";
import { selectBattlefieldFigmentMergeTargets } from "../state/figments";

// `BattleLogDrawer` renders from the append-only coop fold, so its
// `history` prop is supplied an empty undo/redo envelope.
const EMPTY_BATTLE_HISTORY: BattleHistory = { past: [], future: [] };
// Fires the automated-card hash-drift warning at most once per page session.
let automationHashDriftWarned = false;
const PHASE_CONTROL_SEQUENCE = [
  "dreamwell",
  "day",
  "dusk",
  "night",
  "challenge",
] as const satisfies readonly BattlePhase[];
type ZoneBrowserState = { side: BattleSide; zone: BrowseableZone } | null;
type ContextMenuState = {
  battleCardId: string;
  presentation: "context-menu" | "sheet";
  sourceSurface: BattleCommandSourceSurface;
  x: number;
  y: number;
} | null;
type ForeseeOverlayState = {
  count: number;
  side: BattleSide;
} | null;
type PendingDragState =
  | {
      kind: "battle-card";
      battleCardId: string;
      sourceSurface: BattleCommandSourceSurface;
    }
  | {
      kind: "pool-card";
      definition: BattleDeckCardDefinition;
      sourceSurface: "pool-viewer";
    }
  | null;

function isDeveloperBattleSurface(source: BattleCommandSourceSurface): boolean {
  return (
    source === "inspector" ||
    source === "debug-menu" ||
    source === "debug-panel" ||
    source === "pool-viewer" ||
    source === "note-editor" ||
    source === "card-badges" ||
    source === "figment-creator" ||
    source === "deck-order-picker"
  );
}

function affectedBattleCardIds(command: BattleCommand): readonly string[] {
  if (command.id !== "DEBUG_EDIT") return [];
  const edit = command.edit;
  const ids = new Set<string>();
  if ("battleCardId" in edit) ids.add(edit.battleCardId);
  if ("sourceBattleCardId" in edit) ids.add(edit.sourceBattleCardId);
  if (edit.kind === "FORESEE") {
    for (const id of [
      ...edit.viewedCardIds,
      ...edit.orderedCardIds,
      ...edit.voidCardIds,
    ]) {
      ids.add(id);
    }
  } else if (edit.kind === "REORDER_DECK") {
    for (const id of edit.order) ids.add(id);
  }
  return [...ids];
}

function selectedBattleCardId(command: BattleCommand): string | null {
  return affectedBattleCardIds(command)[0] ?? null;
}

function canonicalCommandTargets(
  command: BattleCommand,
): Record<string, unknown> {
  if (command.id === "FORCE_RESULT") return { result: command.result };
  if (command.id !== "DEBUG_EDIT") return {};
  const edit = command.edit;
  return {
    ...("side" in edit ? { side: edit.side } : {}),
    ...("destination" in edit ? { destination: edit.destination } : {}),
    ...("source" in edit ? { source: edit.source } : {}),
    ...("target" in edit ? { target: edit.target } : {}),
    ...("phase" in edit ? { phase: edit.phase } : {}),
    ...("activeSide" in edit ? { activeSide: edit.activeSide } : {}),
    ...("viewer" in edit ? { viewer: edit.viewer } : {}),
  };
}

export function PlayableBattleScreen({
  site,
  aiMode = false,
}: {
  site: SiteState;
  aiMode?: boolean;
}) {
  const battle = useGameState().battle;
  if (battle === null) {
    return null; // BattleSiteRoute already shows the loading/reveal state.
  }
  void site;
  return (
    <PlayableBattleScreenInner key={battle.init.battleId} aiMode={aiMode} />
  );
}

function PlayableBattleScreenInner({ aiMode }: { aiMode: boolean }) {
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
  const clientId = useClientId();
  const confirmedPromptId = useConfirmedPromptId();
  const guidanceController = useBattleTutorialGuidance();
  const guidanceView = useMemo(
    () => buildBattleTutorialGuidanceView(battle),
    [battle],
  );
  const pendingPromptDreamwellCard = useMemo(
    () =>
      pendingPrompt?.run.scriptRef.table === "dreamwell"
        ? battleInit.dreamwellDeck.find(
            (card) => card.id === pendingPrompt.run.scriptRef.id,
          )
        : undefined,
    [battleInit.dreamwellDeck, pendingPrompt],
  );

  const { state: journeyState, cardDatabase, journeyContent } = useJourney();
  const isCumulusDesktopLayout = useIsDesktop();
  const [perspectiveSide, setPerspectiveSide] = useState<BattleSide>("player");
  const [isBattleLogOpen, setIsBattleLogOpen] = useState(false);
  const [isDreamwellHistoryOpen, setIsDreamwellHistoryOpen] = useState(false);
  const [isOpponentHandRevealed, setIsOpponentHandRevealed] = useState(false);
  // Debug "hide player hand" mode: hides your own hand and renders the enemy
  // hand full size (with hover-to-enlarge) in its place, to simulate the local
  // view of a multiplayer game where you see only the opponent's hand.
  const [isPlayerHandHidden, setIsPlayerHandHidden] = useState(false);
  const [openZoneBrowser, setOpenZoneBrowser] =
    useState<ZoneBrowserState>(null);
  const [pendingDrag, setPendingDrag] = useState<PendingDragState>(null);
  const pendingDragDropHandledRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [openForeseeOverlay, setOpenForeseeOverlay] =
    useState<ForeseeOverlayState>(null);
  const [openDeckOrderPicker, setOpenDeckOrderPicker] =
    useState<BattleSide | null>(null);
  const [openFigmentCreator, setOpenFigmentCreator] =
    useState<BattleSide | null>(null);
  const [lastFigmentTypeId, setLastFigmentTypeId] = useState<
    string | undefined
  >(undefined);
  const [isPoolViewerOpen, setIsPoolViewerOpen] = useState(false);
  const [openNoteEditor, setOpenNoteEditor] = useState<string | null>(null);
  const [isResultOverlayDismissed, setIsResultOverlayDismissed] =
    useState(false);

  useEffect(() => {
    if (pendingPrompt === null) return;
    logEventOnce(
      `battle_prompt_opened:${battleInit.battleId}:${String(pendingPrompt.promptId)}`,
      "battle_prompt_opened",
      {
        ...createBattleLogBaseFields(board, {
          sourceSurface: "battlefield",
          selectedCardId: null,
        }),
        ...createBattlePromptOpenedLogFields(board, pendingPrompt),
        perspectiveSide,
        promptSide: pendingPrompt.run.side,
      },
    );
  }, [battleInit.battleId, board, pendingPrompt, perspectiveSide]);

  const clearPerspectiveBoundPresentation = useCallback((): void => {
    setPendingDrag(null);
    pendingDragDropHandledRef.current = false;
    setContextMenu(null);
    setOpenForeseeOverlay(null);
    setOpenDeckOrderPicker(null);
    setOpenFigmentCreator(null);
    setOpenZoneBrowser(null);
    setIsPoolViewerOpen(false);
    setOpenNoteEditor(null);
    setIsBattleLogOpen(false);
    setIsDreamwellHistoryOpen(false);
    setIsOpponentHandRevealed(false);
    setIsPlayerHandHidden(false);
  }, []);

  useEffect(() => {
    setPerspectiveSide("player");
    clearPerspectiveBoundPresentation();
  }, [battleInit.battleId, clearPerspectiveBoundPresentation]);

  const handlePerspectiveToggle = useCallback((): void => {
    const nextSide: BattleSide =
      perspectiveSide === "player" ? "enemy" : "player";
    clearPerspectiveBoundPresentation();
    logEvent("battle_perspective_changed", {
      ...createBattleLogBaseFields(board, {
        sourceSurface: "battlefield",
        selectedCardId: null,
      }),
      clientId,
      previousPerspectiveSide: perspectiveSide,
      perspectiveSide: nextSide,
      aiDriverPaused: aiMode && nextSide === "enemy",
    });
    setPerspectiveSide(nextSide);
  }, [
    aiMode,
    board,
    clearPerspectiveBoundPresentation,
    clientId,
    perspectiveSide,
  ]);

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
  const aiDriverEnabled = battleAiDriverEnabled({
    aiMode,
    mayRunHere: aiMayRun,
    perspectiveSide,
  });

  // The AI approval loop. Inert unless `aiMode` is true AND this client may run
  // the AI: when disabled the hook holds no proposal and submits nothing. It
  // receives the SAME live `board` and append-backed submitters the rest of the
  // screen uses, so approved commands flow back as a new `board` and the hook
  // re-plans.
  const submitAiCommand = useCallback(
    (command: BattleCommand): void => {
      void actions.battleCommand(command, undefined, `ai:${clientId}`);
    },
    [actions, clientId],
  );
  const submitAiGesture = useCallback(
    (commands: readonly BattleCommand[]): void => {
      void actions.battleGesture(commands, undefined, `ai:${clientId}`);
    },
    [actions, clientId],
  );
  const submitAiPlayCard = useCallback(
    (
      battleCardId: string,
      targetBattleCardIds: readonly string[],
      trace: import("../types").BattleAiChoiceTrace | null,
      characterDestination?: import("../types").BattleFieldSlotAddress,
    ): void => {
      void actions.battlePlayCard(
        battleCardId,
        targetBattleCardIds,
        `battle-play:${board.battleId}:${String(board.turnNumber)}:${battleCardId}`,
        `ai:${clientId}`,
        trace === null ? undefined : [trace],
        characterDestination === undefined
          ? undefined
          : {
              side: characterDestination.side,
              zone: "backRank",
              slotId: characterDestination.slotId,
            },
      );
    },
    [actions, board.battleId, board.turnNumber, clientId],
  );
  const {
    proposal,
    thinking: aiThinking,
    approve,
    reject,
  } = useBattleAi({
    board,
    submitCommand: submitAiCommand,
    submitGesture: submitAiGesture,
    submitPlayCard: submitAiPlayCard,
    enabled: aiDriverEnabled,
    aiSide: "enemy",
    caps: aiCaps,
    basicAutomation: true,
    aiConfiguration: battleInit.aiConfiguration,
  });

  const aiBlockingTurn = battle.aiBlockingTurn;
  useEffect(() => {
    if (
      !aiDriverEnabled ||
      board.result !== null ||
      board.activeSide === "enemy" ||
      board.phase !== "dusk"
    ) {
      return;
    }
    if (
      aiBlockingTurn?.activeSide === board.activeSide &&
      aiBlockingTurn.turnNumber === board.turnNumber
    ) {
      return;
    }
    void actions.battleAiBlock("enemy", `ai:${clientId}`);
  }, [
    actions,
    aiBlockingTurn,
    aiDriverEnabled,
    board.activeSide,
    board.phase,
    board.result,
    board.turnNumber,
    clientId,
  ]);

  // While the AI holds an un-approved proposal — or is still computing one — the
  // human drives only via the approve/reject icon controls in the phase cluster.
  // Locking during `aiThinking` keeps the human from acting in the brief window
  // while the planner (which now runs asynchronously, off the render path) is
  // still deciding. Normal controls (phase arrows, hand, battlefield) return once
  // no proposal is held and the AI is idle — on the human's own turn, and during
  // the AI's Dusk/Night/Challenge after its plays are done.
  const canPlayerAct =
    battle.tutorialPresentation == null &&
    !(aiDriverEnabled && (proposal !== null || aiThinking));
  const failureResult = selectFailureOverlayResult(board.result);
  const pendingDragCardId =
    pendingDrag === null
      ? null
      : pendingDrag.kind === "battle-card"
        ? pendingDrag.battleCardId
        : "__pool_viewer_card__";
  const pendingDragLocation =
    pendingDrag?.kind === "battle-card"
      ? selectBattleCardLocation(board, pendingDrag.battleCardId)
      : null;
  const pendingCardSource =
    pendingDragLocation?.zone === "hand" &&
    pendingDrag?.sourceSurface === "hand-tray"
      ? "near-hand"
      : pendingDrag?.kind === "battle-card"
        ? "battlefield"
        : null;
  const pendingCardOwner = pendingDragLocation?.side ?? null;
  const figmentMergeTargets: readonly MobileBattleFigmentMergeTarget[] =
    pendingDrag?.kind === "battle-card"
      ? selectBattlefieldFigmentMergeTargets(
          board,
          pendingDrag.battleCardId,
        ).map((candidate) => ({
          sourceBattleCardId: pendingDrag.battleCardId,
          destinationBattleCardId: candidate.destinationBattleCardId,
          target: {
            owner: candidate.location.side,
            rank: candidate.location.zone === "backRank" ? "back" : "front",
            slotId: candidate.location.slotId,
          },
          figmentLabel:
            board.cardInstances[pendingDrag.battleCardId]?.definition.name ??
            "Figment",
          status:
            candidate.assessment.kind === "eligible"
              ? "eligible"
              : "blocked-exhaustion",
          addedSpark:
            candidate.assessment.kind === "eligible"
              ? candidate.assessment.addedSpark
              : 0,
          requiresConfirmation:
            candidate.assessment.kind === "eligible" &&
            candidate.assessment.requiresConfirmation,
        }))
      : [];

  // Resolves the single open prompt from the fold. Gated on
  // `useConfirmedPromptId()` so a resolve never targets a promptId that only
  // exists as an optimistic echo — the RESOLVE_PROMPT action refuses this
  // server-side too (see `useActions`'s guard), but disabling the control here
  // avoids a round-trip rejection.
  const resolvePendingPrompt = useCallback(
    (resolution: PromptResolution): void => {
      if (
        pendingPrompt === null ||
        perspectiveSide !== pendingPrompt.run.side ||
        confirmedPromptId !== pendingPrompt.promptId
      ) {
        return;
      }
      logEvent("battle_prompt_resolution_requested", {
        ...createBattleLogBaseFields(board, {
          sourceSurface: "battlefield",
          selectedCardId:
            resolution.kind === "pick-cards"
              ? (resolution.chosenIds[0] ?? null)
              : null,
        }),
        ...createBattlePromptResolutionLogFields(
          board,
          pendingPrompt,
          resolution,
        ),
        perspectiveSide,
        promptSide: pendingPrompt.run.side,
      });
      void actions.resolvePrompt(pendingPrompt.promptId, resolution);
    },
    [actions, board, pendingPrompt, confirmedPromptId, perspectiveSide],
  );

  const logCumulusCardPickerInteraction = useCallback(
    (
      action: "selection-changed" | "submit" | "skip",
      chosenIds: readonly string[],
    ): void => {
      if (pendingPrompt?.options.kind !== "pick-cards") return;
      logEvent("battle_cumulus_card_picker_interaction", {
        ...createBattleLogBaseFields(board, {
          sourceSurface: "hand-tray",
          selectedCardId: chosenIds[0] ?? null,
        }),
        action,
        dreamwellCardUuid:
          pendingPrompt.run.scriptRef.table === "dreamwell"
            ? pendingPrompt.run.scriptRef.id
            : null,
        promptId: pendingPrompt.promptId,
        perspectiveSide,
        promptSide: pendingPrompt.run.side,
        candidateBattleCardInstanceIds: pendingPrompt.options.candidateIds,
        candidateBackingCardUuids: pendingPrompt.options.candidateIds.map(
          (instanceId) =>
            board.cardInstances[instanceId]?.definition.cardId ?? null,
        ),
        chosenBattleCardInstanceIds: chosenIds,
        chosenBackingCardUuids: chosenIds.map(
          (instanceId) =>
            board.cardInstances[instanceId]?.definition.cardId ?? null,
        ),
        finalResolution:
          action === "selection-changed"
            ? null
            : { kind: "pick-cards", chosenIds },
        requiredCount: pendingPrompt.options.count,
        optional: pendingPrompt.options.optional,
      });
    },
    [board, pendingPrompt, perspectiveSide],
  );

  const handleCumulusChoicePrompt = useCallback(
    (optionIndex: number): void => {
      if (pendingPrompt?.options.kind !== "choice") return;
      logEvent("battle_cumulus_choice_prompt_interaction", {
        ...createBattleLogBaseFields(board, {
          sourceSurface: "battlefield",
          selectedCardId: null,
        }),
        promptId: pendingPrompt.promptId,
        perspectiveSide,
        promptSide: pendingPrompt.run.side,
        ...promptTextLogFields("prompt", pendingPrompt.options.label),
        optionIndex,
        ...(pendingPrompt.options.options[optionIndex] === undefined
          ? {}
          : promptTextLogFields(
              "option",
              pendingPrompt.options.options[optionIndex].label,
            )),
      });
      resolvePendingPrompt({ kind: "choice", optionIndex });
    },
    [board, pendingPrompt, perspectiveSide, resolvePendingPrompt],
  );

  const handleCommand = useCallback(
    (command: BattleCommand): void => {
      setPendingDrag(null);
      const sourceSurface = command.sourceSurface ?? "action-bar";
      const actor =
        command.actor ??
        (sourceSurface === "auto-system"
          ? "system"
          : isDeveloperBattleSurface(sourceSurface)
            ? "debug"
            : perspectiveSide);
      const attributedCommand: BattleCommand = { ...command, actor };
      if (actor === "player" || actor === "enemy") {
        logEvent("battle_perspective_action_requested", {
          ...createBattleLogBaseFields(board, {
            sourceSurface,
            selectedCardId: selectedBattleCardId(attributedCommand),
          }),
          perspectiveSide,
          semanticActingSide: actor,
          commandId: attributedCommand.id,
          editKind:
            attributedCommand.id === "DEBUG_EDIT"
              ? attributedCommand.edit.kind
              : null,
          affectedBattleCardIds: affectedBattleCardIds(attributedCommand),
          canonicalTargets: canonicalCommandTargets(attributedCommand),
        });
      }
      const intentKey = automaticBattleIntentKey(
        battleInit.battleId,
        board,
        attributedCommand,
      );
      void actions.battleCommand(attributedCommand, intentKey);
    },
    [actions, board, battleInit.battleId, perspectiveSide],
  );

  const handleOpenForesee = useCallback(
    (
      side: BattleSide,
      count: number,
      sourceSurface: BattleCommandSourceSurface = "foresee-overlay",
    ): void => {
      handleCommand({
        id: "DEBUG_EDIT",
        edit: { kind: "REVEAL_DECK_TOP", side, count, viewer: perspectiveSide },
        sourceSurface,
      });
      setOpenForeseeOverlay({ side, count });
    },
    [handleCommand, perspectiveSide],
  );

  // Deck-aware companion to the reducer's `battle_proto_dreamwell_card_drawn`:
  // logs which card a reveal is about to draw, with the detail the reducer cannot
  // see (`order`, name, `energyAdded`). Read just before dispatch so
  // `dreamwellDeckIndex` is the pre-draw position the card is taken from, and
  // `sourceSurface` distinguishes the core per-turn reveal (`auto-system`) from a
  // manual extra draw such as Lily Lake (`status-strip`). Pairing this with the
  // reducer event by (side, turn) shows the intended order vs. the actual applied
  // index, exposing any over-advance of the shared deck index.
  const logDreamwellReveal = useCallback(
    (
      side: BattleSide,
      turnNumber: number,
      sourceSurface: BattleCommandSourceSurface,
    ): void => {
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
  const runDreamwellDraw = useCallback(
    (
      side: BattleSide,
      sourceSurface: BattleCommandSourceSurface = "status-strip",
    ): void => {
      logDreamwellReveal(side, board.turnNumber, sourceSurface);
      handleCommand({
        id: "DEBUG_EDIT",
        edit: {
          kind: "DRAW_DREAMWELL_CARD",
          side,
          turnNumber: board.turnNumber,
          additional: true,
        },
        sourceSurface,
      });
    },
    [handleCommand, logDreamwellReveal, board.turnNumber],
  );

  const handleSetBattleFlow = useCallback(
    (target: BattleFlowTarget): void => {
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
    },
    [handleCommand],
  );

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
  }, [handleCommand, activeSide, activePhase, activeTurnNumber, battleResult]);

  // Round 1 surfaces no Dreamwell card (see `isDreamwellDisplayVisible` below),
  // so the player should not have to click through an empty Dreamwell phase.
  // Once round 1's reveal has committed — `dreamwellDrawnTurn` reaches this turn,
  // so its energy is already applied — auto-advance to the Day phase for the
  // locally-driven side. Skipped on the AI's own turn (the AI driver advances
  // itself).
  // The event-log intent key owns the once-per-(battle, side, turn) transition.
  const activeDreamwellDrawnTurn = board.sides[activeSide].dreamwellDrawnTurn;
  useEffect(() => {
    if (battleResult !== null || activePhase !== "dreamwell") {
      return;
    }
    if (activeTurnNumber > 1) {
      return;
    }
    if (aiDriverEnabled && activeSide === "enemy") {
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
    aiDriverEnabled,
    activeSide,
    activePhase,
    activeTurnNumber,
    battleResult,
    activeDreamwellDrawnTurn,
  ]);

  useEffect(() => {
    const baseFields = createBattleLogBaseFields(board, {
      sourceSurface: "auto-system",
      selectedCardId: null,
    });
    logEventOnce(
      `battle_proto_init:${battleInit.battleId}`,
      "battle_proto_init",
      {
        ...baseFields,
        battleEntryKey: battleInit.battleEntryKey,
        enemyName: battleInit.enemyDescriptor.name,
        seed: battleInit.seed,
        siteId: battleInit.siteId,
      },
    );
    logEventOnce(
      `battle_proto_opening_hands:${battleInit.battleId}`,
      "battle_proto_opening_hands",
      {
        ...baseFields,
        enemyHandBattleCardIds: [...board.sides.enemy.hand],
        enemyHandCardUuids: board.sides.enemy.hand.map(
          (battleCardId) =>
            board.cardInstances[battleCardId]?.definition.cardId ?? null,
        ),
        enemyHandSize: board.sides.enemy.hand.length,
        openingHandSize: battleInit.openingHandSize,
        playerHandBattleCardIds: [...board.sides.player.hand],
        playerHandCardUuids: board.sides.player.hand.map(
          (battleCardId) =>
            board.cardInstances[battleCardId]?.definition.cardId ?? null,
        ),
      },
    );
    // This effect is keyed by `battleId` (via `logEventOnce`), so it fires once
    // per battle — intentionally reading `board` only at that first commit
    // rather than tracking it as a reactive dependency.
  }, [
    battleInit.battleId,
    battleInit.battleEntryKey,
    battleInit.enemyDescriptor.name,
    battleInit.openingHandSize,
    battleInit.seed,
    battleInit.siteId,
  ]);

  useEffect(() => {
    if (board.result === null) {
      setIsResultOverlayDismissed(false);
      return;
    }
    setOpenZoneBrowser(null);
    setContextMenu(null);
    setOpenForeseeOverlay(null);
    setOpenDeckOrderPicker(null);
    setOpenFigmentCreator(null);
    setIsPoolViewerOpen(false);
    setOpenNoteEditor(null);
    setIsBattleLogOpen(false);
    setIsDreamwellHistoryOpen(false);
  }, [board.result]);

  useEffect(() => {
    setIsOpponentHandRevealed(false);
  }, [battleInit.battleId]);

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
      logEventOnce(
        "battle_proto_automation_hash_drift",
        "battle_proto_automation_hash_drift",
        {
          drift: annotated,
        },
      );
      const details = annotated
        .map(
          ({ id, name, reason }) =>
            `  - ${id} (${name ?? "missing from catalog"}) [${reason}]`,
        )
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

  function handleHandCardDoubleClick(battleCardId: string): void {
    if (!canPlayerAct) {
      return;
    }
    const command = createPlayCardFromHandCommand(
      board,
      battleCardId,
      "hand-tray",
      true,
    );
    if (command !== null) {
      handleCommand(command);
    }
  }

  function handleOpenZoneBrowser(
    side: BattleSide,
    zone: BrowseableZone,
    sourceSurface: BattleCommandSourceSurface = "battlefield",
  ): void {
    setOpenZoneBrowser({ side, zone });
    setContextMenu(null);
    logEvent("battle_zone_browser_opened", {
      ...createBattleLogBaseFields(board, {
        sourceSurface,
        selectedCardId: null,
      }),
      selectedSide: side,
      zone,
    });
  }

  // The reducer's `applyDefeat` (END_BATTLE) freezes the `failureSummary` from
  // the terminal board, routes the journey slice to `journeyFailed`, clears the
  // active site, and tears down the shared battle in one fold.
  function handleFailureReset(): void {
    if (failureResult === null) {
      return;
    }
    void actions.endBattle();
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
    setIsOpponentHandRevealed(false);
    setIsResultOverlayDismissed(false);
    setIsBattleLogOpen(false);
  }

  // `END_BATTLE` derives victory from the terminal board and commits reward,
  // site completion, Atlas advancement, route, modifier expiry, and teardown
  // as one event.
  function handleContinueReward(): void {
    if (board.result !== "victory") {
      return;
    }
    void actions.endBattle();
  }

  function handleCumulusResultAction(action: MobileBattleResultAction): void {
    if (board.result === null) return;
    const logFields = createBattleLogBaseFields(board, {
      sourceSurface: "battlefield",
      selectedCardId: null,
    });
    if (action === "continue") {
      if (board.result !== "victory") return;
      logEvent("battle_proto_reward_continued", {
        ...logFields,
        essenceReward: battleInit.essenceReward,
        rewardSource: "battle_result",
      });
      handleContinueReward();
      return;
    }
    if (board.result === "victory") return;
    if (action === "reset") {
      logEvent("battle_result_reset_requested", {
        ...logFields,
        result: board.result,
      });
      handleFailureReset();
      return;
    }
    if (action === "reopen") {
      logEvent("battle_result_reopened", {
        ...logFields,
        result: board.result,
      });
      setIsResultOverlayDismissed(false);
      return;
    }

    logEvent("battle_result_dismissed", {
      ...logFields,
      result: board.result,
      via: "surface",
    });
    setIsResultOverlayDismissed(true);
  }

  function handleCardContextMenu(
    battleCardId: string,
    event: ReactMouseEvent<HTMLElement>,
    sourceSurface: BattleCommandSourceSurface,
  ): void {
    event.preventDefault();
    setContextMenu({
      battleCardId,
      presentation: "context-menu",
      sourceSurface,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleCumulusCardDebugActivate(
    battleCardId: string,
    sourceSurface: BattleCommandSourceSurface,
    invocation:
      | { readonly presentation: "sheet" }
      | {
          readonly presentation: "context-menu";
          readonly x: number;
          readonly y: number;
        },
  ): void {
    const card = board.cardInstances[battleCardId];
    const location = selectBattleCardLocation(board, battleCardId);
    if (card === undefined || location === null) return;
    setContextMenu({
      battleCardId,
      presentation: invocation.presentation,
      sourceSurface,
      x: invocation.presentation === "context-menu" ? invocation.x : 0,
      y: invocation.presentation === "context-menu" ? invocation.y : 0,
    });
    logEvent(
      invocation.presentation === "context-menu"
        ? "battle_desktop_card_debug_menu_opened"
        : "battle_mobile_card_debug_sheet_opened",
      {
        ...createBattleLogBaseFields(board, {
          sourceSurface,
          selectedCardId: battleCardId,
        }),
        battleCardId,
        cardId: card.definition.cardId,
        cardController: card.controller,
        cardZone: location.zone,
        presentation: invocation.presentation,
      },
    );
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
      pendingDragDropHandledRef.current = false;
      setPendingDrag({
        kind: "battle-card",
        battleCardId,
        sourceSurface: sourceSurface ?? resolveDragSourceSurface(location),
      });
    }
    setContextMenu(null);
  }

  function handleCardDragEnd(): void {
    if (
      !pendingDragDropHandledRef.current &&
      pendingDrag?.kind === "battle-card" &&
      selectBattleCardLocation(board, pendingDrag.battleCardId)?.zone === "hand"
    ) {
      handlePlayPendingHandCard();
      return;
    }
    pendingDragDropHandledRef.current = false;
    setPendingDrag(null);
  }

  function handlePlayPendingHandCard(
    preferredTarget?: MobileBattleSlotTarget,
  ): void {
    if (pendingDrag?.kind !== "battle-card") return;
    pendingDragDropHandledRef.current = true;
    const command = createPlayCardFromHandCommand(
      board,
      pendingDrag.battleCardId,
      pendingDrag.sourceSurface,
      true,
      preferredTarget === undefined
        ? undefined
        : {
            side: preferredTarget.owner,
            zone: preferredTarget.rank === "back" ? "backRank" : "frontRank",
            slotId: preferredTarget.slotId as BattlefieldSlotId,
          },
    );
    if (command === null) {
      setPendingDrag(null);
      return;
    }
    handleCommand(command);
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
  // | Double-click a hand card                                 | first open reserve, else deployed | MOVE_CARD_TO_ZONE via battlefield helper    |
  function handleSlotDrop(target: BattleFieldSlotAddress): void {
    if (!canPlayerAct) {
      return;
    }
    if (pendingDrag === null) {
      return;
    }

    const draggedLocation =
      pendingDrag.kind === "battle-card"
        ? selectBattleCardLocation(board, pendingDrag.battleCardId)
        : null;
    if (draggedLocation?.zone === "hand") {
      handlePlayPendingHandCard();
      return;
    }
    if (
      (draggedLocation?.zone === "backRank" ||
        draggedLocation?.zone === "frontRank") &&
      draggedLocation.side !== target.side
    ) {
      pendingDragDropHandledRef.current = true;
      setPendingDrag(null);
      return;
    }
    const targetOccupant = selectBattlefieldSlotOccupant(board, target);

    if (targetOccupant !== null) {
      const sourceIsBattlefield =
        pendingDrag.kind === "battle-card" &&
        (draggedLocation?.zone === "backRank" ||
          draggedLocation?.zone === "frontRank");
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
      handleCommand(
        createPoolCardDropCommand(pendingDrag.definition, target, Date.now()),
      );
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

  function handleFigmentMerge(
    sourceBattleCardId: string,
    target: MobileBattleSlotTarget,
  ): void {
    if (!canPlayerAct) return;
    pendingDragDropHandledRef.current = true;
    handleCommand({
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: sourceBattleCardId,
        destination: {
          side: target.owner,
          zone: target.rank === "back" ? "backRank" : "frontRank",
          slotId: target.slotId as BattlefieldSlotId,
        },
      },
      sourceSurface: "battlefield",
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
    if (
      pendingDrag.kind === "battle-card" &&
      selectBattleCardLocation(board, pendingDrag.battleCardId)?.zone === "hand"
    ) {
      handlePlayPendingHandCard();
      return;
    }

    if (pendingDrag.kind === "pool-card") {
      handleCommand(
        createPoolCardDropCommand(
          pendingDrag.definition,
          zone === "deck"
            ? { side, zone: "deck", position: "top" }
            : { side, zone },
          Date.now(),
        ),
      );
      setPendingDrag(null);
      return;
    }

    const command =
      zone === "deck"
        ? createMoveCardToDeckCommand(
            pendingDrag.battleCardId,
            side,
            "top",
            sourceSurface,
          )
        : createMoveCardToZoneCommand(
            pendingDrag.battleCardId,
            side,
            zone,
            sourceSurface,
          );
    handleCommand(command);
    setPendingDrag(null);
  }

  const enemyDreamAvatarSummary = resolveEnemyDreamAvatarSummary(
    battleInit.enemyDescriptor,
    journeyContent,
  );

  const requestBattlefieldPreview = useCallback(
    (playerInPlayCount: 9 | 19, enemyInPlayCount: 9 | 19): void => {
      const playerFrontRankCount = Math.floor(playerInPlayCount / 2);
      const playerBackRankCount = playerInPlayCount - playerFrontRankCount;
      const enemyFrontRankCount = Math.floor(enemyInPlayCount / 2);
      const enemyBackRankCount = enemyInPlayCount - enemyFrontRankCount;
      const command = createFillBattlefieldPreviewCommand(
        battleInit,
        Date.now(),
        { player: playerInPlayCount, enemy: enemyInPlayCount },
      );
      const previewCardIds =
        command?.id === "DEBUG_EDIT" &&
        command.edit.kind === "FILL_BATTLEFIELD_PREVIEW"
          ? [
              ...command.edit.definitions.player,
              ...command.edit.definitions.enemy,
            ].map((definition) => definition.cardId)
          : [];
      logEvent("battle_debug_battlefield_preview_requested", {
        ...createBattleLogBaseFields(board, {
          sourceSurface: "debug-menu",
          selectedCardId: null,
        }),
        commandCount: command === null ? 0 : 1,
        previewCardIds,
        playerBackRankCount,
        playerFrontRankCount,
        playerVoidAddedCount: 5,
        enemyBackRankCount,
        enemyFrontRankCount,
        enemyVoidAddedCount: 5,
      });
      if (command !== null) {
        void actions.battleCommand(command);
      }
    },
    [actions, battleInit, board],
  );

  const handleFillBattlefieldPreview = useCallback((): void => {
    requestBattlefieldPreview(19, 19);
  }, [requestBattlefieldPreview]);

  const handleFillAsymmetricBattlefieldPreview = useCallback((): void => {
    requestBattlefieldPreview(19, 9);
  }, [requestBattlefieldPreview]);

  function handleCumulusInspectorAction(
    action: MobileBattleInspectorAction,
  ): void {
    const resolution = resolveBattleInspectorIntent(action, board);
    if (resolution.kind === "command") {
      handleCommand(resolution.command);
      return;
    }
    if (resolution.kind === "gesture") {
      void actions.battleGesture(resolution.commands);
      return;
    }
    if (resolution.kind === "none") {
      return;
    }
    if (resolution.kind === "presentation") {
      if (
        resolution.action === "opened" ||
        resolution.action === "side-selected"
      ) {
        logEvent(
          resolution.action === "opened"
            ? "battle_inspector_opened"
            : "battle_inspector_side_selected",
          {
            ...createBattleLogBaseFields(board, {
              sourceSurface: "inspector",
              selectedCardId: null,
            }),
            selectedSide:
              action.kind === "opened" || action.kind === "side-selected"
                ? action.side
                : null,
            ...(action.kind === "opened" ? { layout: action.layout } : {}),
          },
        );
      } else if (resolution.action === "toggle-opponent-hand") {
        setIsOpponentHandRevealed((value) => !value);
      } else if (resolution.action === "toggle-player-hand") {
        setIsPlayerHandHidden((value) => !value);
      } else {
        handleResetBattle();
      }
      return;
    }

    if (
      resolution.accessory === "battle-log" ||
      resolution.accessory === "dreamwell-history"
    ) {
      const isBattleLog = resolution.accessory === "battle-log";
      setIsBattleLogOpen(isBattleLog);
      setIsDreamwellHistoryOpen(!isBattleLog);
      logEvent(
        isBattleLog
          ? "battle_log_drawer_opened"
          : "battle_dreamwell_history_drawer_opened",
        {
          ...createBattleLogBaseFields(board, {
            sourceSurface: "inspector",
            selectedCardId: null,
          }),
          ...(isBattleLog
            ? {}
            : {
                drawnDreamwellCardCount: Math.min(
                  board.dreamwellDeckIndex,
                  battleInit.dreamwellDeck.length,
                ),
              }),
        },
      );
      return;
    }
    if (resolution.accessory === "pool-viewer") {
      setIsPoolViewerOpen(true);
      return;
    }
    if (resolution.side === undefined) {
      return;
    }
    if (resolution.accessory === "foresee") {
      handleOpenForesee(resolution.side, 1, "inspector");
    } else if (resolution.accessory === "reorder-deck") {
      setOpenDeckOrderPicker(resolution.side);
    } else if (
      resolution.accessory === "open-zone" &&
      resolution.zone !== undefined
    ) {
      handleOpenZoneBrowser(resolution.side, resolution.zone, "inspector");
    } else if (resolution.accessory === "dreamwell-draw") {
      runDreamwellDraw(resolution.side, "inspector");
    } else {
      setOpenFigmentCreator(resolution.side);
    }
  }
  useEffect(() => {
    if (board.result === null) return;
    const logFields = createBattleLogBaseFields(board, {
      sourceSurface: "battlefield",
      selectedCardId: null,
    });
    if (board.result === "victory") {
      logEventOnce(
        `battle_proto_reward_opened:${battleInit.battleId}`,
        "battle_proto_reward_opened",
        {
          ...logFields,
          essenceReward: battleInit.essenceReward,
          rewardSource: "battle_result",
        },
      );
      return;
    }
    logEventOnce(
      `battle_result_overlay_opened:${battleInit.battleId}:${board.result}`,
      "battle_result_overlay_opened",
      {
        ...logFields,
        result: board.result,
      },
    );
  }, [battleInit.battleId, battleInit.essenceReward, board, board.result]);
  useEffect(() => {
    const layout = isCumulusDesktopLayout ? "desktop" : "mobile";
    const eventName = isCumulusDesktopLayout
      ? "battle_desktop_surface_opened"
      : "battle_mobile_surface_opened";
    logEventOnce(`${eventName}:${battleInit.battleId}`, eventName, {
      battleId: battleInit.battleId,
      enemyHandSize: board.sides.enemy.hand.length,
      layout,
      playerHandSize: board.sides.player.hand.length,
    });
  }, [
    battleInit.battleId,
    board.sides.enemy.hand.length,
    board.sides.player.hand.length,
    isCumulusDesktopLayout,
  ]);

  return (
    <>
      {openZoneBrowser !== null && openZoneBrowser.zone !== "hand" ? (
        <CumulusBattleZoneBrowser
          browser={{
            side: openZoneBrowser.side,
            zone: openZoneBrowser.zone,
          }}
          perspectiveSide={perspectiveSide}
          state={board}
          onClose={() => setOpenZoneBrowser(null)}
          onSideChange={(side) =>
            handleOpenZoneBrowser(side, "banished", "zone-browser-banished")
          }
          onCardContextMenu={handleCardContextMenu}
          onCardDoubleTap={(battleCardId, sourceSurface) =>
            handleCumulusCardDebugActivate(battleCardId, sourceSurface, {
              presentation: "sheet",
            })
          }
          onCardDragStart={handleCardDragStart}
          onCardDragEnd={handleCardDragEnd}
          onCardDropToBrowser={(sourceSurface) =>
            handleZoneDrop(
              openZoneBrowser.side,
              openZoneBrowser.zone,
              sourceSurface,
            )
          }
          pendingDragSourceSurface={pendingDrag?.sourceSurface ?? null}
        />
      ) : null}
      {openForeseeOverlay !== null ? (
        <CumulusBattleForeseeOverlay
          initialCount={openForeseeOverlay.count}
          side={openForeseeOverlay.side}
          state={board}
          onConfirm={({ viewedCardIds, orderedCardIds, voidCardIds }) => {
            handleCommand({
              id: "DEBUG_EDIT",
              edit: {
                kind: "FORESEE",
                side: openForeseeOverlay.side,
                viewer: perspectiveSide,
                viewedCardIds,
                orderedCardIds,
                voidCardIds,
              },
              sourceSurface: "foresee-overlay",
            });
            setOpenForeseeOverlay(null);
          }}
        />
      ) : null}
      {pendingPrompt !== null &&
      perspectiveSide === pendingPrompt.run.side &&
      pendingPrompt.options.kind === "foresee" &&
      openForeseeOverlay === null ? (
        <CumulusBattleForeseeOverlay
          initialCount={pendingPrompt.options.count}
          side={pendingPrompt.run.side}
          state={board}
          sourceDreamwellCard={pendingPromptDreamwellCard}
          onConfirm={({ viewedCardIds, orderedCardIds, voidCardIds }) =>
            resolvePendingPrompt({
              kind: "foresee",
              viewedCardIds: [...viewedCardIds],
              orderedCardIds: [...orderedCardIds],
              voidCardIds: [...voidCardIds],
            })
          }
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
              edit: { kind: "REORDER_DECK", order, side: openDeckOrderPicker },
              sourceSurface: "inspector",
            });
            setOpenDeckOrderPicker(null);
          }}
        />
      ) : null}
      {openFigmentCreator !== null ? (
        <BattleFigmentCreator
          initialSide={openFigmentCreator}
          initialTypeId={lastFigmentTypeId}
          state={board}
          onClose={() => setOpenFigmentCreator(null)}
          onTypeChange={setLastFigmentTypeId}
          onSubmit={(edit) =>
            handleCommand({
              id: "DEBUG_EDIT",
              edit,
              sourceSurface: "inspector",
            })
          }
        />
      ) : null}
      <PoolViewerFloatingController
        cardDatabase={cardDatabase}
        draftState={journeyState.draftState}
        resolvedPackage={journeyState.resolvedPackage}
        isOpen={isPoolViewerOpen}
        onClose={() => setIsPoolViewerOpen(false)}
        onPoolCardDragEnd={handleCardDragEnd}
        onPoolCardDragStart={handlePoolCardDragStart}
        title={
          /* localization-ignore: semantic pool-viewer context value. */ "battle"
        }
        variant="floating"
      />
      <MobileBattleScreenAdapter
        init={battleInit}
        board={board}
        enemyDreamAvatar={enemyDreamAvatarSummary}
        aiProposal={aiDriverEnabled ? proposal : null}
        aiMode={aiMode}
        isOpponentHandRevealed={isOpponentHandRevealed}
        isPlayerHandHidden={isPlayerHandHidden}
        perspectiveSide={perspectiveSide}
        pendingPrompt={pendingPrompt}
        confirmedPromptId={confirmedPromptId}
        isResultOverlayDismissed={isResultOverlayDismissed}
        interactions={{
          canInteract: canPlayerAct && pendingPrompt === null,
          nearSide: perspectiveSide,
          pendingCardId: pendingDragCardId,
          pendingCardSource,
          pendingCardOwner,
          figmentMergeTargets,
          onHandCardActivate: handleHandCardDoubleClick,
          onHandCardDrop: handlePlayPendingHandCard,
          onCardDebugActivate: (battleCardId, source, invocation) =>
            handleCumulusCardDebugActivate(
              battleCardId,
              source === "near-hand" ? "hand-tray" : "battlefield",
              invocation,
            ),
          onRevealedHandCardDebugActivate: (battleCardId, invocation) =>
            handleCumulusCardDebugActivate(
              battleCardId,
              "revealed-hand-card",
              invocation,
            ),
          onCardDragStart: (battleCardId, source) => {
            handleCardDragStart(
              battleCardId,
              source === "near-hand" ? "hand-tray" : "battlefield",
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
          onFigmentMerge: handleFigmentMerge,
          onZoneDrop: ({ owner, zone }) => {
            handleZoneDrop(
              owner,
              zone,
              pendingDrag?.sourceSurface ?? "battlefield",
            );
          },
          onZoneOpen: ({ owner, zone }) => {
            handleOpenZoneBrowser(owner, zone, "battlefield");
          },
          onPreviousPhase: () => {
            handleSetBattleFlow(computePhaseControlTarget(board, "previous"));
          },
          onNextPhase: () => {
            handleSetBattleFlow(computePhaseControlTarget(board, "next"));
          },
          onApproveAiProposal: aiDriverEnabled ? approve : undefined,
          onRejectAiProposal: aiDriverEnabled ? reject : undefined,
          onPerspectiveToggle: handlePerspectiveToggle,
          onCardPickerSelectionChange: (ids) => {
            logCumulusCardPickerInteraction("selection-changed", ids);
          },
          onCardPickerSubmit: (ids) => {
            logCumulusCardPickerInteraction("submit", ids);
            resolvePendingPrompt({ kind: "pick-cards", chosenIds: [...ids] });
          },
          onCardPickerSkip: () => {
            logCumulusCardPickerInteraction("skip", []);
            resolvePendingPrompt({ kind: "pick-cards", chosenIds: [] });
          },
          onChoicePromptChoose: handleCumulusChoicePrompt,
          onResultAction: handleCumulusResultAction,
          onFillBattlefieldPreview: handleFillBattlefieldPreview,
          onFillAsymmetricBattlefieldPreview:
            handleFillAsymmetricBattlefieldPreview,
          onInspectorAction: handleCumulusInspectorAction,
        }}
      />
      {contextMenu !== null ? (
        <BattleContextMenu
          key={`${contextMenu.battleCardId}:${contextMenu.sourceSurface}:${contextMenu.presentation}`}
          battleCardId={contextMenu.battleCardId}
          onOpenNoteEditor={(cardId) => setOpenNoteEditor(cardId)}
          presentation={contextMenu.presentation}
          sourceSurface={contextMenu.sourceSurface}
          state={board}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCommand={handleCommand}
        />
      ) : null}
      {openNoteEditor !== null ? (
        <BattleCardNoteEditor
          battleCardId={openNoteEditor}
          state={board}
          onClose={() => setOpenNoteEditor(null)}
          onSubmit={(edit) =>
            handleCommand({
              id: "DEBUG_EDIT",
              edit,
              sourceSurface: "note-editor",
            })
          }
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
      <BattleTutorialGuidance
        view={guidanceView}
        onDismiss={guidanceController.advance}
        onDurationComplete={guidanceController.completeDuration}
      />
    </>
  );
}

type BattleFlowTarget = {
  phase: BattlePhase;
  activeSide: BattleSide;
  turnNumber: number;
};

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
    return {
      didWrap: index >= PHASE_CONTROL_SEQUENCE.length,
      nextIndex: index,
    };
  })();
  const normalizedNextIndex =
    (nextIndex + PHASE_CONTROL_SEQUENCE.length) % PHASE_CONTROL_SEQUENCE.length;
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
  return {
    phase,
    ...turnPair,
  };
}

function normalizePhaseForControls(
  phase: BattleMutableState["phase"],
): (typeof PHASE_CONTROL_SEQUENCE)[number] {
  switch (phase) {
    // Draw and Dawn run as bookkeeping when the flow leaves Dreamwell and are
    // never resting phases; the surfaced start-of-turn stop is Dreamwell.
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

function resolveEnemyDreamAvatarSummary(
  enemyDescriptor: BattleEnemyDescriptor,
  journeyContent: JourneyContent,
): BattleDreamAvatarSummary {
  const sourceDreamAvatar = findEnemySourceDreamAvatar(
    enemyDescriptor,
    journeyContent,
  );
  return {
    id: sourceDreamAvatar?.id ?? enemyDescriptor.id,
    imageNumber:
      enemyDescriptor.imageNumber ?? sourceDreamAvatar?.imageNumber ?? "001",
    name: enemyDescriptor.name,
    renderedText: enemyDescriptor.abilityText,
    title: enemyDescriptor.subtitle,
    ...(sourceDreamAvatar?.portraitFocus === undefined
      ? {}
      : { portraitFocus: sourceDreamAvatar.portraitFocus }),
  };
}

function findEnemySourceDreamAvatar(
  enemyDescriptor: BattleEnemyDescriptor,
  journeyContent: JourneyContent,
) {
  const sourceId = parseEnemySourceDreamAvatarId(enemyDescriptor.id);
  if (sourceId !== null) {
    const byId = journeyContent.dreamAvatars.find(
      (dreamAvatar) => dreamAvatar.id === sourceId,
    );
    if (byId !== undefined) {
      return byId;
    }
  }

  const descriptorName = enemyDescriptor.name.toLocaleLowerCase();
  return journeyContent.dreamAvatars.find((dreamAvatar) => {
    const fullName = dreamAvatar.name.toLocaleLowerCase();
    const shortName = fullName.split(",")[0] ?? fullName;
    return (
      descriptorName === fullName ||
      descriptorName === shortName ||
      descriptorName.endsWith(` ${fullName}`) ||
      descriptorName.endsWith(` ${shortName}`)
    );
  });
}

function parseEnemySourceDreamAvatarId(enemyId: string): string | null {
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

function resolveDragSourceSurface(
  location: ReturnType<typeof selectBattleCardLocation>,
): BattleCommandSourceSurface {
  if (location?.zone === "hand") {
    return location.side === "enemy" ? "opponent-hand-tray" : "hand-tray";
  }

  return "battlefield";
}
