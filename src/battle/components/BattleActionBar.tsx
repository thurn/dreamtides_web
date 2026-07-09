import { HudDreamsignRow } from "../../components/HudDreamsignRow";
import type { BattleDreamsignSummary, BattleSide } from "../types";

export function BattleActionBar({
  dreamsigns = [],
  hideDebugSection: _hideDebugSection = false,
  isBasicAutomationEnabled,
  isInteractionLocked: _isInteractionLocked = false,
  isBattleLogOpen: _isBattleLogOpen,
  isDesktopInspectorLayout: _isDesktopInspectorLayout,
  isInspectorDrawerOpen: _isInspectorDrawerOpen,
  onOpenForesee: _onOpenForesee,
  onToggleBasicAutomation,
  onToggleBattleLog,
  onToggleDreamwellHistory,
  onToggleInspector: _onToggleInspector,
}: {
  dreamsigns?: readonly BattleDreamsignSummary[];
  hideDebugSection?: boolean;
  isBasicAutomationEnabled: boolean;
  isInteractionLocked?: boolean;
  isBattleLogOpen: boolean;
  isDesktopInspectorLayout: boolean;
  isInspectorDrawerOpen: boolean;
  onOpenForesee: (side: BattleSide, count: number) => void;
  onToggleBasicAutomation: () => void;
  onToggleBattleLog: () => void;
  onToggleDreamwellHistory: () => void;
  onToggleInspector: () => void;
}) {
  return (
    <section data-battle-region="action-bar" className="actionbar">
      <div className="group">
        <button
          type="button"
          data-battle-action="toggle-dreamwell-history"
          className="btn ghost sm"
          onClick={onToggleDreamwellHistory}
        >
          Dreamwell
        </button>
        <button
          type="button"
          data-battle-action="toggle-log"
          className="btn ghost sm"
          onClick={onToggleBattleLog}
        >
          Log
        </button>
        <button
          type="button"
          data-battle-action="toggle-automation"
          data-battle-automation-enabled={isBasicAutomationEnabled ? "true" : "false"}
          className={`btn ghost sm icon ${isBasicAutomationEnabled ? "automation-active" : ""}`}
          aria-pressed={isBasicAutomationEnabled}
          aria-label={`Basic automation ${isBasicAutomationEnabled ? "on" : "off"}`}
          title={`Basic automation: ${isBasicAutomationEnabled ? "on" : "off"}`}
          onClick={onToggleBasicAutomation}
        >
          <i className="bxf bx-cog" aria-hidden="true" />
        </button>
        {dreamsigns.length > 0 ? (
          <div className="actionbar-dreamsigns" data-battle-region="dreamsigns">
            <HudDreamsignRow dreamsigns={dreamsigns} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
