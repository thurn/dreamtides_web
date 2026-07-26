import type { ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { GameCard, type GameCardModel } from "../components/card/CardView";
import { TransientStatusToast } from "../components/status/TransientStatusToast";
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
  readonly presentation: {
    readonly kind: "opponent-play";
    /** UUID of the catalog card presented before automation continues. */
    readonly cardId: string;
    readonly battleCardId: string;
    readonly cardKind: "character" | "event";
    readonly model: GameCardModel;
  } | null;
  readonly victorySummary: string | null;
  readonly terminalRestartAvailable: boolean;
}

export interface TutorialBattleScreenProps {
  readonly view: TutorialBattleView;
  readonly interactions: MobileBattleInteractions;
  readonly movementStatusMessage: string | null;
  readonly onMovementStatusDismiss: () => void;
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
  movementStatusMessage,
  onMovementStatusDismiss,
  onForeseeConfirm,
  onRestart,
  onReturnToMainMenu,
}: TutorialBattleScreenProps): ReactElement {
  const paused = view.ownership === "paused-driver-absent" || view.terminalRestartAvailable;
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
      {view.presentation !== null ? (
        <GlassDialog
          title={`Opponent Played a ${view.presentation.cardKind === "character" ? "Character" : "Event"}`}
          subtitle="Watch the card before the battle continues."
          presentation="popup"
          companion={(
            <div
              data-tutorial-opponent-play-reveal=""
              data-tutorial-presentation-card-id={view.presentation.cardId}
              data-tutorial-presentation-battle-card-id={view.presentation.battleCardId}
              style={{ width: "min(72vw, 300px)" }}
            >
              <GameCard model={view.presentation.model} presentation="full" />
            </div>
          )}
        >
          <span data-tutorial-presentation-dwell="">The battle continues in a moment.</span>
        </GlassDialog>
      ) : null}
      {paused ? (
        <GlassDialog
          title="Battle Paused"
          subtitle="The battle driver has left. Restart to take over from the tutorial handoff."
        >
          <div style={{ display: "flex", justifyContent: "center" }}>
            <GlassButton
              label="Restart"
              variant="accent"
              placement="onGlass"
              testId="tutorial-battle-restart"
              onPress={onRestart}
            />
          </div>
        </GlassDialog>
      ) : null}
      {view.manualControls && interactions.targetSelectionPrompt !== null ? (
        <div data-tutorial-target-selection="" style={{ position: "fixed", left: "50%", top: `calc(var(--safe-area-inset-top) + ${token("--space-12")})`, transform: "translateX(-50%)", zIndex: 80 }}>
          <GlassPanel eyebrow="Play card" title="Choose target" subtitle={interactions.targetSelectionPrompt} footer={<GlassButton label="Cancel" variant="default" placement="onGlass" testId="tutorial-target-cancel" onPress={() => interactions.onTargetSelectionCancel?.()} />}><span /></GlassPanel>
        </div>
      ) : null}
      {movementStatusMessage !== null ? (
        <TransientStatusToast
          variant="warning"
          copy={{ message: movementStatusMessage }}
          onDismiss={onMovementStatusDismiss}
        />
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
