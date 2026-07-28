import { useCallback, useEffect, useState, type ReactElement } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { GameCard } from "../components/card/CardView";
import { GlassButton } from "../components/controls/GlassButton";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { TransientStatusToast } from "../components/status/TransientStatusToast";
import { token } from "../primitives/tokens";
import { motionTimeSeconds } from "../primitives/motion-time";
import {
  BattleForeseeOverlay,
  type BattleForeseeView,
} from "./BattleForeseeOverlay";
import {
  MobileBattleScreen,
  battleCardLayoutId,
  type MobileBattleCardView,
  type MobileBattleInteractions,
  type MobileBattleView,
} from "./MobileBattleScreen";
import {
  BattleTutorialGuidance,
  type BattleTutorialGuidanceView,
} from "./BattleTutorialGuidance";

export type TutorialBattleOwnership = "driver" | "observer" | "paused-driver-absent" | "terminal";

export interface TutorialBattleView {
  readonly battle: MobileBattleView;
  readonly ownership: TutorialBattleOwnership;
  readonly driverClientId: string | null;
  readonly manualControls: boolean;
  readonly foresee: BattleForeseeView | null;
  /**
   * A persisted, event-log-owned dwell checkpoint. The materialized source
   * stays in its battlefield or Dreamwell position while it is active.
   */
  readonly presentation: {
    readonly kind: "opponent-play";
    readonly presentationId: string;
    /** UUID of the catalog card presented before automation continues. */
    readonly cardId: string;
    readonly battleCardId: string;
    readonly cardKind: "character" | "event";
    readonly card: MobileBattleCardView;
  } | {
    readonly kind: "dreamwell-reveal";
    readonly presentationId: string;
    /** UUID of the Dreamwell source card shown before its effect prompt. */
    readonly cardId: string;
    readonly side: "player" | "enemy";
  } | {
    readonly kind: "opponent-block" | "challenge-resolved";
    readonly presentationId: string;
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
  readonly guidance: BattleTutorialGuidanceView | null;
  readonly onGuidanceContinue: () => void;
  readonly onGuidanceDurationComplete: () => void;
  readonly onPresentationVisible: (presentationId: string) => void;
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
  guidance,
  onGuidanceContinue,
  onGuidanceDurationComplete,
  onPresentationVisible,
}: TutorialBattleScreenProps): ReactElement {
  const paused = view.ownership === "paused-driver-absent" || view.terminalRestartAvailable;
  const turnAnnouncementKey =
    `${view.battle.battleId}:${view.battle.inspector.turn}:${view.battle.activeSide}`;
  const [completedTurnAnnouncementKey, setCompletedTurnAnnouncementKey] =
    useState<string | null>(null);
  const completeTurnAnnouncement = useCallback(
    (side: "player" | "enemy"): void => {
      setCompletedTurnAnnouncementKey(
        `${view.battle.battleId}:${view.battle.inspector.turn}:${side}`,
      );
    },
    [view.battle.battleId, view.battle.inspector.turn],
  );
  const visibleGuidance =
    guidance?.source.kind !== "dreamwell" ||
    completedTurnAnnouncementKey === turnAnnouncementKey
      ? guidance
      : null;
  const presentationVisible =
    view.presentation !== null &&
    (view.presentation.kind !== "dreamwell-reveal" ||
      completedTurnAnnouncementKey === turnAnnouncementKey);

  useEffect(() => {
    if (view.presentation === null || !presentationVisible) return;
    if (view.presentation.kind === "opponent-play") return;
    onPresentationVisible(view.presentation.presentationId);
  }, [onPresentationVisible, presentationVisible, view.presentation]);

  return (
    <div
      className="cumulus"
      data-tutorial-live-battle=""
      data-tutorial-battle-ownership={view.ownership}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        minHeight: "100vh",
        overflow: "hidden",
      }}
    >
      <LayoutGroup id={`tutorial-battle:${view.battle.battleId}`}>
        <MobileBattleScreen
          view={view.battle}
          interactions={interactions}
          cardLayoutGroup="inherited"
          inspectorDefault="collapsed"
          inspectorVisibility="hidden"
          phaseNavigation={view.manualControls ? "tutorial" : "hidden"}
          viewport="contained"
          onTurnAnnouncementComplete={completeTurnAnnouncement}
        />
        {view.presentation?.kind === "opponent-play" &&
        presentationVisible ? (
          <TutorialOpponentPlayReveal
            presentation={view.presentation}
            onVisible={onPresentationVisible}
          />
        ) : null}
      </LayoutGroup>
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
        <BattleForeseeOverlay
          view={view.foresee}
          onConfirm={onForeseeConfirm}
        />
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
      <BattleTutorialGuidance
        view={visibleGuidance}
        onDismiss={onGuidanceContinue}
        onDurationComplete={onGuidanceDurationComplete}
      />
    </div>
  );
}

// Full-card reading width: the canonical 240px desktop size, constrained to
// 45vw on narrow screens so the reveal remains entirely visible.
const TUTORIAL_BATTLE_REVEAL_CARD_WIDTH = "min(240px, 45vw)";
export const TUTORIAL_BATTLE_REVEAL_TRAVEL_SECONDS =
  motionTimeSeconds("--dur-slow");

function TutorialOpponentPlayReveal({
  presentation,
  onVisible,
}: {
  readonly presentation: Extract<
    NonNullable<TutorialBattleView["presentation"]>,
    { readonly kind: "opponent-play" }
  >;
  readonly onVisible: (presentationId: string) => void;
}): ReactElement {
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const timeout = window.setTimeout(
      () => onVisible(presentation.presentationId),
      reduceMotion ? 0 : TUTORIAL_BATTLE_REVEAL_TRAVEL_SECONDS * 1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [onVisible, presentation.presentationId, reduceMotion]);

  return (
    <motion.div
      data-tutorial-opponent-play-reveal=""
      data-battle-card-id={presentation.battleCardId}
      data-battle-card-layout-id={battleCardLayoutId(
        presentation.battleCardId,
      )}
      layoutId={battleCardLayoutId(presentation.battleCardId)}
      initial={{
        x: "-50%",
        y: "-50%",
        opacity: reduceMotion ? 1 : 0,
        scale: reduceMotion ? 1 : 0.55,
      }}
      animate={{
        x: "-50%",
        y: "-50%",
        opacity: 1,
        scale: 1,
      }}
      transition={{
        duration: reduceMotion
          ? 0
          : TUTORIAL_BATTLE_REVEAL_TRAVEL_SECONDS,
        ease: [0.22, 0.61, 0.36, 1],
      }}
      style={{
        position: "fixed",
        left: "50%",
        top: "50%",
        width: TUTORIAL_BATTLE_REVEAL_CARD_WIDTH,
        zIndex: token("--layer-reveal"),
        pointerEvents: "none",
      }}
    >
      <GameCard
        model={presentation.card.model}
        testId="tutorial-opponent-play-card"
      />
    </motion.div>
  );
}
