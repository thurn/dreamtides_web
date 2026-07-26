import type { ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { token } from "../primitives/tokens";
import {
  BattleForeseeOverlay,
  type BattleForeseeView,
} from "./BattleForeseeOverlay";
import {
  MobileBattleScreen,
  type MobileBattleInteractions,
  type MobileBattleView,
} from "./MobileBattleScreen";

export type TutorialBattleOwnership = "driver" | "observer" | "paused-driver-absent" | "terminal";

export interface TutorialBattleView {
  readonly battle: MobileBattleView;
  readonly ownership: TutorialBattleOwnership;
  readonly driverClientId: string | null;
  readonly manualControls: boolean;
  readonly foresee: BattleForeseeView | null;
  readonly victorySummary: string | null;
  readonly terminalRestartAvailable: boolean;
}

export interface TutorialBattleScreenProps {
  readonly view: TutorialBattleView;
  readonly interactions: MobileBattleInteractions;
  readonly onForeseeConfirm: (resolution: {
    readonly viewedCardIds: readonly string[];
    readonly orderedCardIds: readonly string[];
    readonly voidCardIds: readonly string[];
  }) => void;
  readonly onRestart: () => void;
  readonly onReturnToMainMenu: () => void;
}

/** Focused live tutorial battle presentation without operator tools or rewards. */
export function TutorialBattleScreen({
  view,
  interactions,
  onForeseeConfirm,
  onRestart,
  onReturnToMainMenu,
}: TutorialBattleScreenProps): ReactElement {
  const paused = view.ownership === "paused-driver-absent" || view.terminalRestartAvailable;
  const observing = view.ownership === "observer";
  return (
    <div
      className="cumulus"
      data-tutorial-live-battle=""
      data-tutorial-battle-ownership={view.ownership}
      style={{ minHeight: "100vh" }}
    >
      <MobileBattleScreen
        view={view.battle}
        interactions={interactions}
        inspectorDefault="collapsed"
        inspectorVisibility="hidden"
        phaseNavigation={view.manualControls ? "tutorial" : "hidden"}
      />
      <div
        data-tutorial-battle-ownership-panel=""
        style={{
          position: "fixed",
          left: `max(var(--safe-area-inset-left), ${token("--space-4")})`,
          top: `max(var(--safe-area-inset-top), ${token("--space-4")})`,
          width: "min(320px, calc(100vw - var(--space-8)))",
          zIndex: 70,
          pointerEvents: paused ? "auto" : "none",
        }}
      >
        <GlassPanel
          eyebrow="Tutorial Battle"
          title={paused ? "Battle Paused" : observing ? "Observing" : "Tutorial Battle"}
          subtitle={
            paused
              ? "The battle driver has left. Restart to take over from the tutorial handoff."
              : observing
              ? "Another connected player is driving this tutorial battle."
              : "You are driving the shared tutorial battle."
          }
          footer={paused ? (
            <GlassButton
              label="Restart"
              variant="accent"
              placement="onGlass"
              testId="tutorial-battle-restart"
              onPress={onRestart}
            />
          ) : undefined}
        >
          <p style={{ margin: 0, color: token("--text-on-glass-muted"), font: token("--t-caption") }}>
            Driver: {view.driverClientId ?? "Unavailable"}
          </p>
        </GlassPanel>
      </div>
      {view.manualControls && interactions.targetSelectionPrompt !== null ? (
        <div data-tutorial-target-selection="" style={{ position: "fixed", left: "50%", top: `calc(var(--safe-area-inset-top) + ${token("--space-12")})`, transform: "translateX(-50%)", zIndex: 80 }}>
          <GlassPanel eyebrow="Play card" title="Choose target" subtitle={interactions.targetSelectionPrompt} footer={<GlassButton label="Cancel" variant="default" placement="onGlass" testId="tutorial-target-cancel" onPress={() => interactions.onTargetSelectionCancel?.()} />}><span /></GlassPanel>
        </div>
      ) : null}
      {view.manualControls && view.foresee !== null ? (
        <BattleForeseeOverlay view={view.foresee} onConfirm={onForeseeConfirm} />
      ) : null}
      {view.victorySummary !== null ? (
        <GlassDialog title="Tutorial Complete" subtitle={view.victorySummary}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <GlassButton
              label="Return to Main Menu"
              variant="accent"
              placement="onGlass"
              testId="tutorial-battle-return-main-menu"
              onPress={onReturnToMainMenu}
            />
          </div>
        </GlassDialog>
      ) : null}
    </div>
  );
}
