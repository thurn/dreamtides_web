import { useEffect } from "react";
import type { BattleSide } from "../types";

export function BattleActionBar({
  futureCount,
  hideDebugSection: _hideDebugSection = false,
  historyCount,
  isInteractionLocked = false,
  isBattleLogOpen: _isBattleLogOpen,
  isDesktopInspectorLayout: _isDesktopInspectorLayout,
  isInspectorDrawerOpen: _isInspectorDrawerOpen,
  onOpenForesee: _onOpenForesee,
  onRedo,
  onToggleBattleLog,
  onToggleInspector: _onToggleInspector,
  onUndo,
}: {
  futureCount: number;
  hideDebugSection?: boolean;
  historyCount: number;
  isInteractionLocked?: boolean;
  isBattleLogOpen: boolean;
  isDesktopInspectorLayout: boolean;
  isInspectorDrawerOpen: boolean;
  onOpenForesee: (side: BattleSide, count: number) => void;
  onRedo: () => void;
  onToggleBattleLog: () => void;
  onToggleInspector: () => void;
  onUndo: () => void;
}) {
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
    futureCount,
    historyCount,
    isInteractionLocked,
    onRedo,
    onUndo,
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
      </div>
    </section>
  );
}
