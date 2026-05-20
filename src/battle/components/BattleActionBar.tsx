import { useEffect } from "react";
import type { BattleCommand } from "../debug/commands";
import { selectShouldEndTurnFromDay } from "../state/selectors";
import type { BattleMutableState, BattleSide } from "../types";

export function BattleActionBar({
  canEndTurn,
  futureCount,
  hideDebugSection: _hideDebugSection = false,
  historyCount,
  isInteractionLocked = false,
  isBattleLogOpen: _isBattleLogOpen,
  isDesktopInspectorLayout: _isDesktopInspectorLayout,
  isInspectorDrawerOpen: _isInspectorDrawerOpen,
  isOpponentHandRevealed = false,
  state,
  onCommand,
  onOpenForesee: _onOpenForesee,
  onRedo,
  onToggleBattleLog,
  onToggleInspector: _onToggleInspector,
  onToggleOpponentHand,
  onUndo,
}: {
  canEndTurn: boolean;
  futureCount: number;
  hideDebugSection?: boolean;
  historyCount: number;
  isInteractionLocked?: boolean;
  isBattleLogOpen: boolean;
  isDesktopInspectorLayout: boolean;
  isInspectorDrawerOpen: boolean;
  isOpponentHandRevealed?: boolean;
  state: BattleMutableState;
  onCommand: (command: BattleCommand) => void;
  onOpenForesee: (side: BattleSide, count: number) => void;
  onRedo: () => void;
  onToggleBattleLog: () => void;
  onToggleInspector: () => void;
  onToggleOpponentHand?: () => void;
  onUndo: () => void;
}) {
  const phaseButtonLabel = getPhaseButtonLabel(state);
  const phaseActionCommand = createPhaseActionCommand(state);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (
        isInteractionLocked ||
        target !== null &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod && event.key.toLowerCase() === "e") {
        if (!canEndTurn) {
          return;
        }
        event.preventDefault();
        onCommand(phaseActionCommand);
        return;
      }
      if (mod && !event.shiftKey && event.key.toLowerCase() === "z") {
        if (historyCount === 0) {
          return;
        }
        event.preventDefault();
        onUndo();
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "z") {
        if (futureCount === 0) {
          return;
        }
        event.preventDefault();
        onRedo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    canEndTurn,
    futureCount,
    historyCount,
    isInteractionLocked,
    onCommand,
    onRedo,
    onUndo,
    phaseActionCommand,
  ]);

  return (
    <section data-battle-region="action-bar" className="actionbar">
      <div className="group">
        <button
          type="button"
          data-battle-action="undo"
          className="btn ghost sm"
          onClick={onUndo}
          disabled={historyCount === 0}
        >
          Undo
        </button>
        <button
          type="button"
          data-battle-action="redo"
          className="btn ghost sm"
          onClick={onRedo}
          disabled={futureCount === 0}
        >
          Redo
        </button>
        <button
          type="button"
          data-battle-action="toggle-log"
          className="btn ghost sm"
          onClick={onToggleBattleLog}
        >
          Log
        </button>
        {onToggleOpponentHand !== undefined ? (
          <button
            type="button"
            data-battle-action="toggle-opponent-hand"
            className={`btn ghost sm ${isOpponentHandRevealed ? "active" : ""}`}
            onClick={onToggleOpponentHand}
          >
            {isOpponentHandRevealed ? "Hide enemy hand" : "Show enemy hand"}
          </button>
        ) : null}
      </div>
      <div className="group">
        <button
          type="button"
          data-battle-action="skip-to-rewards"
          className="btn ghost sm"
          onClick={() => onCommand({ id: "SKIP_TO_REWARDS", sourceSurface: "action-bar" })}
        >
          Skip to rewards
        </button>
        <button
          type="button"
          data-battle-action="end-turn"
          className="btn primary"
          onClick={() => onCommand(phaseActionCommand)}
          disabled={!canEndTurn}
        >
          {phaseButtonLabel}
        </button>
      </div>
    </section>
  );
}

function getPhaseButtonLabel(state: BattleMutableState): string {
  if (selectShouldEndTurnFromDay(state)) {
    return "End Turn";
  }
  if (state.phase === "day" || state.phase === "dusk") {
    return "End Phase";
  }
  if (state.phase === "night" && state.activeSide === "player") {
    return "End Turn";
  }
  return "Next Turn";
}

function createPhaseActionCommand(state: BattleMutableState): BattleCommand {
  if (selectShouldEndTurnFromDay(state)) {
    return { id: "END_TURN", sourceSurface: "action-bar" };
  }
  return { id: "PASS_PHASE", sourceSurface: "action-bar" };
}
