import { useCallback, useEffect, useState, type ReactElement } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { GameCard } from "../components/card/CardView";
import { battleCardLayoutId } from "../components/battle/battle-card-layout";
import { GlassButton } from "../components/controls/GlassButton";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { TransientStatusToast } from "../components/status/TransientStatusToast";
import { GlowIcon } from "../components/controls/GlowIcon";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { motionTimeSeconds } from "../primitives/motion-time";
import {
  BattleForeseeOverlay,
  type BattleForeseeView,
} from "./BattleForeseeOverlay";
import {
  MobileBattleScreen,
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
   * Event-log presentation checkpoint released by this screen. It remains
   * available when optional display data cannot be projected.
   */
  readonly presentationId: string | null;
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
    readonly kind: "opponent-block";
    readonly presentationId: string;
  } | {
    readonly kind: "challenge-resolved";
    readonly presentationId: string;
    readonly paired: boolean;
    readonly scored: {
      readonly battleCardId: string;
      readonly side: "player" | "enemy";
      readonly points: number;
    } | null;
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
    view.presentationId !== null &&
    (view.presentation?.kind !== "dreamwell-reveal" ||
      completedTurnAnnouncementKey === turnAnnouncementKey);

  useEffect(() => {
    if (view.presentationId === null || !presentationVisible) return;
    if (view.presentation?.kind === "opponent-play") return;
    onPresentationVisible(view.presentationId);
  }, [
    onPresentationVisible,
    presentationVisible,
    view.presentation,
    view.presentationId,
  ]);

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
      {view.presentation?.kind === "challenge-resolved" &&
      presentationVisible ? (
        <TutorialChallengeResolutionAnimation
          presentation={view.presentation}
        />
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

const TUTORIAL_CHALLENGE_BUBBLE_SIZE = "min(42vw, 184px)";
const TUTORIAL_CHALLENGE_ANIMATION_SECONDS =
  motionTimeSeconds("--dur-slow") * 4;

function TutorialChallengeResolutionAnimation({
  presentation,
}: {
  readonly presentation: Extract<
    NonNullable<TutorialBattleView["presentation"]>,
    { readonly kind: "challenge-resolved" }
  >;
}): ReactElement {
  const reduceMotion = useReducedMotion();
  if (presentation.paired || presentation.scored === null) {
    return (
      <div
        aria-hidden="true"
        data-tutorial-challenge-animation="paired"
        data-tutorial-challenge-presentation-id={presentation.presentationId}
      />
    );
  }

  const { scored } = presentation;
  const duration = reduceMotion ? 0 : TUTORIAL_CHALLENGE_ANIMATION_SECONDS;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${String(scored.points)} points`}
      data-tutorial-challenge-animation="points"
      data-tutorial-challenge-presentation-id={presentation.presentationId}
      data-tutorial-challenge-scoring-side={scored.side}
      data-tutorial-challenge-scoring-card-id={scored.battleCardId}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: token("--layer-reveal"),
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
      }}
    >
      <motion.div
        data-tutorial-challenge-points-bubble=""
        initial={
          reduceMotion
            ? false
            : { opacity: 0, scale: 0.48, rotate: -12 }
        }
        animate={
          reduceMotion
            ? { opacity: 1, scale: 1, rotate: 0 }
            : {
                opacity: [0, 1, 1, 0],
                scale: [0.48, 1.08, 1, 0.86],
                rotate: [-12, 3, 0, 0],
              }
        }
        transition={{
          duration,
          times: reduceMotion ? undefined : [0, 0.18, 0.72, 1],
          ease: "easeInOut",
        }}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: token("--space-2"),
          width: TUTORIAL_CHALLENGE_BUBBLE_SIZE,
          height: TUTORIAL_CHALLENGE_BUBBLE_SIZE,
          borderRadius: token("--radius-pill"),
          background: `radial-gradient(circle at 38% 28%, ${token("--surface-raised")} 0%, ${token("--surface-card")} 56%, ${token("--bg-sunken")} 100%)`,
          boxShadow: `${token("--shadow-lg")}, ${token("--glow-accent-soft")}`,
          color: token("--text-primary"),
          font: token("--t-display"),
          textShadow: token("--text-outline-media"),
        }}
      >
        <motion.span
          aria-hidden="true"
          data-tutorial-challenge-points-orbit=""
          animate={
            reduceMotion
              ? { opacity: 0.42, scale: 1, rotate: 0 }
              : {
                  opacity: [0, 0.88, 0.42, 0],
                  scale: [0.64, 1, 1, 1.24],
                  rotate: [-70, 0, 140, 250],
                }
          }
          transition={{
            duration,
            times: reduceMotion ? undefined : [0, 0.24, 0.74, 1],
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            inset: token("--space-4"),
            border: `${token("--space-1")} solid ${token("--border-accent")}`,
            borderTopColor: token("--accent-bright"),
            borderRadius: token("--radius-pill"),
          }}
        />
        <span data-tutorial-challenge-points-value="">
          {scored.points}
        </span>
        <GlowIcon
          iconClass={GLYPHS.points}
          color="points"
          size="1em"
          shadow
        />
      </motion.div>
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
      data-battle-card-layout-id={
        reduceMotion
          ? undefined
          : battleCardLayoutId(presentation.battleCardId)
      }
      data-battle-card-layout-motion={reduceMotion ? "snap" : "travel"}
      layoutId={
        reduceMotion
          ? undefined
          : battleCardLayoutId(presentation.battleCardId)
      }
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
