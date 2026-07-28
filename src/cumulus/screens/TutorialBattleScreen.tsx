import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { GameCard } from "../components/card/CardView";
import { battleCardLayoutId } from "../components/battle/battle-card-layout";
import { GlassButton } from "../components/controls/GlassButton";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { Motes } from "../components/hud/Motes";
import { TransientStatusToast } from "../components/status/TransientStatusToast";
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
export const TUTORIAL_CHALLENGE_TRAVEL_SECONDS =
  motionTimeSeconds("--dur-slow");

export interface TutorialBattleView {
  readonly battle: MobileBattleView;
  /**
   * Historical board projection for the painted frame immediately before
   * dissolved Challenge cards travel to their authoritative void positions.
   */
  readonly challengeOriginBattle: MobileBattleView | null;
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
    readonly dissolved: readonly {
      readonly battleCardId: string;
      readonly side: "player" | "enemy";
    }[];
    readonly scored: {
      readonly battleCardId: string;
      readonly side: "player" | "enemy";
      readonly points: number;
    } | null;
  } | null;
  readonly victoryVisible: boolean;
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
  readonly onNewJourney: () => void;
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
  onNewJourney,
  guidance,
  onGuidanceContinue,
  onGuidanceDurationComplete,
  onPresentationVisible,
}: TutorialBattleScreenProps): ReactElement {
  const reduceMotion = useReducedMotion();
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
  const challengeTravel =
    view.presentation?.kind === "challenge-resolved" &&
    view.presentation.dissolved.length > 0 &&
    view.challengeOriginBattle !== null
      ? {
          presentationId: view.presentation.presentationId,
          originBattle: view.challengeOriginBattle,
        }
      : null;
  const challengeTravelPresentationId =
    challengeTravel?.presentationId ?? null;
  const [
    startedChallengeTravelPresentationId,
    setStartedChallengeTravelPresentationId,
  ] = useState<string | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const challengeOriginRectsRef = useRef<{
    readonly presentationId: string;
    readonly rects: ReadonlyMap<string, DOMRect>;
  } | null>(null);
  const challengeTravelStarted =
    challengeTravel === null ||
    startedChallengeTravelPresentationId === challengeTravelPresentationId;
  const presentationVisible =
    view.presentationId !== null &&
    challengeTravelStarted &&
    (view.presentation?.kind !== "dreamwell-reveal" ||
      completedTurnAnnouncementKey === turnAnnouncementKey);
  const displayedBattle =
    challengeTravel !== null && !challengeTravelStarted
      ? challengeTravel.originBattle
      : view.battle;
  const challengeCardOverlay =
    view.presentation?.kind === "challenge-resolved" &&
    !view.presentation.paired &&
    view.presentation.scored !== null
      ? {
          kind: "points-scored" as const,
          presentationId: view.presentation.presentationId,
          battleCardId: view.presentation.scored.battleCardId,
          points: view.presentation.scored.points,
        }
      : null;

  useEffect(() => {
    if (challengeTravelPresentationId === null) return;
    if (reduceMotion) {
      setStartedChallengeTravelPresentationId(
        challengeTravelPresentationId,
      );
      return;
    }
    let destinationFrame = 0;
    const paintedOriginFrame = window.requestAnimationFrame(() => {
      destinationFrame = window.requestAnimationFrame(() => {
        const root = screenRef.current;
        const rects = new Map<string, DOMRect>();
        if (
          root !== null &&
          view.presentation?.kind === "challenge-resolved"
        ) {
          for (const entry of view.presentation.dissolved) {
            const source = renderedBattleCard(root, entry.battleCardId);
            if (source !== null) {
              rects.set(entry.battleCardId, source.getBoundingClientRect());
            }
          }
        }
        challengeOriginRectsRef.current = {
          presentationId: challengeTravelPresentationId,
          rects,
        };
        setStartedChallengeTravelPresentationId(
          challengeTravelPresentationId,
        );
      });
    });
    return () => {
      window.cancelAnimationFrame(paintedOriginFrame);
      if (destinationFrame !== 0) {
        window.cancelAnimationFrame(destinationFrame);
      }
    };
  }, [challengeTravelPresentationId, reduceMotion, view.presentation]);

  useLayoutEffect(() => {
    if (
      reduceMotion ||
      !challengeTravelStarted ||
      challengeTravelPresentationId === null ||
      view.presentation?.kind !== "challenge-resolved"
    ) {
      return;
    }
    const root = screenRef.current;
    const origins = challengeOriginRectsRef.current;
    if (
      root === null ||
      origins?.presentationId !== challengeTravelPresentationId
    ) {
      return;
    }
    const animations: {
      readonly element: HTMLElement;
      readonly animation: Animation;
    }[] = [];
    for (const entry of view.presentation.dissolved) {
      const origin = origins.rects.get(entry.battleCardId);
      const destination = renderedBattleCard(
        root,
        entry.battleCardId,
        `${entry.side}-void`,
      );
      if (origin === undefined || destination === null) continue;
      const destinationRect = destination.getBoundingClientRect();
      if (destinationRect.width === 0 || destinationRect.height === 0) continue;
      destination.dataset.tutorialChallengeVoidTravel = entry.side;
      const animation = destination.animate(
        [
          {
            transformOrigin: "top left",
            transform:
              `translate(${String(origin.left - destinationRect.left)}px, ` +
              `${String(origin.top - destinationRect.top)}px) ` +
              `scale(${String(origin.width / destinationRect.width)}, ` +
              `${String(origin.height / destinationRect.height)})`,
          },
          {
            transformOrigin: "top left",
            transform: "none",
          },
        ],
        {
          duration: TUTORIAL_CHALLENGE_TRAVEL_SECONDS * 1_000,
          easing: getComputedStyle(destination)
            .getPropertyValue("--ease-out")
            .trim(),
          fill: "both",
        },
      );
      animation.addEventListener("finish", () => {
        animation.cancel();
        delete destination.dataset.tutorialChallengeVoidTravel;
      }, { once: true });
      animations.push({ element: destination, animation });
    }
    return () => {
      for (const { element, animation } of animations) {
        animation.cancel();
        delete element.dataset.tutorialChallengeVoidTravel;
      }
    };
  }, [
    challengeTravelPresentationId,
    challengeTravelStarted,
    reduceMotion,
    view.presentation,
  ]);

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
      ref={screenRef}
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
          view={displayedBattle}
          interactions={interactions}
          cardOverlay={challengeCardOverlay}
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
      view.presentation.paired &&
      presentationVisible ? (
        <div
          aria-hidden="true"
          data-tutorial-challenge-animation="paired"
          data-tutorial-challenge-presentation-id={
            view.presentation.presentationId
          }
        />
      ) : null}
      {view.manualControls && interactions.targetSelectionPrompt !== null ? (
        <div
          data-tutorial-target-selection=""
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            left: "50%",
            top: `calc(var(--safe-area-inset-top) + ${token("--space-12")})`,
            width: "90vw",
            maxWidth: 416,
            transform: "translateX(-50%)",
            zIndex: 80,
          }}
        >
          <GlassPanel
            title="Choose a Target"
            subtitle={interactions.targetSelectionPrompt}
            headerSpacing="compact"
            headerDivider={false}
            radius="control"
            rightAccessory={{
              kind: "glassButton",
              label: "Cancel",
              testId: "tutorial-target-cancel",
              onPress: () => interactions.onTargetSelectionCancel?.(),
            }}
          >
            <span />
          </GlassPanel>
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
      {view.victoryVisible ? (
        <TutorialVictorySurface onNewJourney={onNewJourney} />
      ) : null}
      <BattleTutorialGuidance
        view={visibleGuidance}
        onDismiss={onGuidanceContinue}
        onDurationComplete={onGuidanceDurationComplete}
      />
    </div>
  );
}

function renderedBattleCard(
  root: HTMLElement,
  battleCardId: string,
  zone?: `${"player" | "enemy"}-void`,
): HTMLElement | null {
  return (
    Array.from(
      root.querySelectorAll<HTMLElement>("[data-battle-card-id]"),
    ).find((candidate) => {
      if (candidate.dataset.battleCardId !== battleCardId) return false;
      return (
        zone === undefined ||
        candidate.closest<HTMLElement>("[data-battle-zone]")?.dataset
          .battleZone === zone
      );
    }) ?? null
  );
}

const TUTORIAL_VICTORY_STAGE_SIZE = "min(76vw, 420px)";
const TUTORIAL_VICTORY_CORE_SIZE = "min(43vw, 236px)";
const TUTORIAL_VICTORY_BUTTON_MAX_WIDTH = 240;
const TUTORIAL_VICTORY_ARRIVAL_SCALE = 0.36;
const TUTORIAL_VICTORY_OVERSHOOT_SCALE = 1.08;
const TUTORIAL_VICTORY_RIPPLE_START_SCALE = 0.72;
const TUTORIAL_VICTORY_RIPPLE_END_SCALE = 1.46;
const TUTORIAL_VICTORY_BREATHE_LOW_SCALE = 0.97;
const TUTORIAL_VICTORY_BREATHE_HIGH_SCALE = 1.03;
const TUTORIAL_VICTORY_STAR_LOW_SCALE = 0.92;
const TUTORIAL_VICTORY_STAR_HIGH_SCALE = 1.08;
const TUTORIAL_VICTORY_INTRO_DURATION = `calc(${token("--dur-slow")} * 5)`;
const TUTORIAL_VICTORY_TITLE_HOLD_DURATION = "3s";
const TUTORIAL_VICTORY_TITLE_MOVE_DURATION = `calc(${token("--dur-slow")} * 3)`;
const TUTORIAL_VICTORY_TITLE_TOTAL_DURATION =
  `calc(${TUTORIAL_VICTORY_TITLE_HOLD_DURATION} + ` +
  `${token("--dur-slow")} * 3)`;
const TUTORIAL_VICTORY_TITLE_FADE_DURATION = `calc(${token("--dur-slow")} * 0.7)`;
const TUTORIAL_VICTORY_ACTION_FADE_DURATION = `calc(${token("--dur-slow")} * 1.4)`;

const TUTORIAL_VICTORY_CSS = `
  @keyframes tutorial-victory-arrival {
    0% { opacity: 0; transform: scale(${String(TUTORIAL_VICTORY_ARRIVAL_SCALE)}) rotate(-18deg); }
    18% { opacity: 1; transform: scale(${String(TUTORIAL_VICTORY_OVERSHOOT_SCALE)}) rotate(3deg); }
    32%, 100% { opacity: 1; transform: scale(1) rotate(0deg); }
  }

  @keyframes tutorial-victory-orbit {
    from { transform: rotate(-70deg); }
    to { transform: rotate(290deg); }
  }

  @keyframes tutorial-victory-counter-orbit {
    from { transform: rotate(40deg); }
    to { transform: rotate(-320deg); }
  }

  @keyframes tutorial-victory-ripple {
    0% { opacity: 0; transform: scale(${String(TUTORIAL_VICTORY_RIPPLE_START_SCALE)}); }
    18% { opacity: 0.68; }
    78%, 100% { opacity: 0; transform: scale(${String(TUTORIAL_VICTORY_RIPPLE_END_SCALE)}); }
  }

  @keyframes tutorial-victory-breathe {
    0%, 100% { transform: scale(${String(TUTORIAL_VICTORY_BREATHE_LOW_SCALE)}); }
    50% { transform: scale(${String(TUTORIAL_VICTORY_BREATHE_HIGH_SCALE)}); }
  }

  @keyframes tutorial-victory-title-move {
    from { top: 50%; transform: translate(-50%, -50%); }
    to { top: 0; transform: translate(-50%, calc(-100% - ${token("--space-5")})); }
  }

  @keyframes tutorial-victory-title-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes tutorial-victory-star-reveal {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes tutorial-victory-star-spin {
    0%, 100% { transform: rotate(0deg) scale(${String(TUTORIAL_VICTORY_STAR_LOW_SCALE)}); }
    50% { transform: rotate(45deg) scale(${String(TUTORIAL_VICTORY_STAR_HIGH_SCALE)}); }
  }

  @keyframes tutorial-victory-action {
    from { opacity: 0; transform: translateY(${token("--space-4")}); }
    to { opacity: 1; transform: translateY(0); }
  }

  [data-tutorial-victory-action][data-tutorial-victory-action-entering] {
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    [data-tutorial-victory-arrival],
    [data-tutorial-victory-orbit],
    [data-tutorial-victory-counter-orbit],
    [data-tutorial-victory-ripple],
    [data-tutorial-victory-core],
    [data-tutorial-victory-title],
    [data-tutorial-victory-title-copy],
    [data-tutorial-victory-star],
    [data-tutorial-victory-action] {
      animation: none !important;
    }

    [data-tutorial-victory-action][data-tutorial-victory-action-entering] {
      pointer-events: auto;
    }
  }
`;

/** Sparse full-screen tutorial payoff inspired by the battle turn announcement. */
function TutorialVictorySurface({
  onNewJourney,
}: {
  readonly onNewJourney: () => void;
}): ReactElement {
  const [titleSettled, setTitleSettled] = useState(false);
  const [actionSettled, setActionSettled] = useState(false);
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial complete"
      data-tutorial-victory-screen=""
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        minHeight: "100dvh",
        boxSizing: "border-box",
        overflow: "hidden",
        background:
          `radial-gradient(circle at 50% 42%, ${token("--accent-tint")} 0%, transparent 46%), ` +
          token("--bg-app"),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-8"),
        paddingTop: `max(var(--safe-area-inset-top), ${token("--space-8")})`,
        paddingRight: `max(var(--safe-area-inset-right), ${token("--space-6")})`,
        paddingBottom: `max(var(--safe-area-inset-bottom), ${token("--space-8")})`,
        paddingLeft: `max(var(--safe-area-inset-left), ${token("--space-6")})`,
      }}
    >
      <style>{TUTORIAL_VICTORY_CSS}</style>
      <Motes on tint="violet" count={24} seed={121} zIndex={1} />
      <Motes on tint="warm" count={12} seed={243} zIndex={1} />
      <div
        data-tutorial-victory-arrival=""
        style={{
          position: "relative",
          zIndex: 2,
          width: TUTORIAL_VICTORY_STAGE_SIZE,
          aspectRatio: "1",
          display: "grid",
          placeItems: "center",
          animation: `tutorial-victory-arrival ${TUTORIAL_VICTORY_INTRO_DURATION} ${token("--ease-dream")} both`,
        }}
      >
        <h1
          data-tutorial-victory-title=""
          onAnimationEnd={(event) => {
            if (event.currentTarget === event.target) {
              setTitleSettled(true);
            }
          }}
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            zIndex: 4,
            margin: 0,
            color: token("--text-primary"),
            font: token("--t-display"),
            textAlign: "center",
            textShadow: token("--text-outline-media"),
            whiteSpace: "nowrap",
            transform: `translate(-50%, calc(-100% - ${token("--space-5")}))`,
            animation: titleSettled
              ? undefined
              : `tutorial-victory-title-move ${TUTORIAL_VICTORY_TITLE_MOVE_DURATION} ${token("--ease-dream")} ${TUTORIAL_VICTORY_TITLE_HOLD_DURATION} both`,
          }}
        >
          <span
            data-tutorial-victory-title-copy=""
            style={{
              display: "block",
              animation: `tutorial-victory-title-fade ${TUTORIAL_VICTORY_TITLE_FADE_DURATION} ${token("--ease-out")} both`,
            }}
          >
            Victory
          </span>
        </h1>
        <span
          aria-hidden="true"
          data-tutorial-victory-ripple=""
          style={{
            position: "absolute",
            inset: token("--space-5"),
            border: `${token("--space-1")} solid ${token("--border-accent")}`,
            borderRadius: token("--radius-pill"),
            animation: `tutorial-victory-ripple ${TUTORIAL_VICTORY_INTRO_DURATION} ${token("--ease-out")} infinite`,
          }}
        />
        <span
          aria-hidden="true"
          data-tutorial-victory-ripple=""
          style={{
            position: "absolute",
            inset: token("--space-5"),
            border: `${token("--space-1")} solid ${token("--border-accent")}`,
            borderRadius: token("--radius-pill"),
            animation: `tutorial-victory-ripple ${TUTORIAL_VICTORY_INTRO_DURATION} ${token("--ease-out")} calc(${TUTORIAL_VICTORY_INTRO_DURATION} / 2) infinite`,
          }}
        />
        <span
          aria-hidden="true"
          data-tutorial-victory-orbit=""
          style={{
            position: "absolute",
            inset: token("--space-6"),
            border: `${token("--space-1")} solid ${token("--border-accent")}`,
            borderTopColor: token("--accent-bright"),
            borderBottomColor: "transparent",
            borderRadius: token("--radius-pill"),
            animation: `tutorial-victory-orbit calc(${token("--dur-slow")} * 12) linear infinite`,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: `calc(-1 * ${token("--space-3")})`,
              width: token("--space-6"),
              height: token("--space-6"),
              borderRadius: token("--radius-pill"),
              background: token("--gold"),
              boxShadow: token("--glow-accent-soft"),
            }}
          />
        </span>
        <span
          data-tutorial-victory-counter-orbit=""
          style={{
            position: "absolute",
            inset: token("--space-12"),
            border: `${token("--space-1")} solid ${token("--border-soft")}`,
            borderLeftColor: token("--gold"),
            borderRightColor: "transparent",
            borderRadius: token("--radius-pill"),
            animation: `tutorial-victory-counter-orbit calc(${token("--dur-slow")} * 16) linear infinite`,
          }}
        />
        <span
          aria-hidden="true"
          data-tutorial-victory-core=""
          style={{
            position: "relative",
            width: TUTORIAL_VICTORY_CORE_SIZE,
            aspectRatio: "1",
            display: "grid",
            placeItems: "center",
            border: `${token("--space-1")} solid ${token("--border-accent")}`,
            borderRadius: token("--radius-pill"),
            background: `radial-gradient(circle at 38% 28%, ${token("--surface-raised")} 0%, ${token("--surface-card")} 56%, ${token("--bg-sunken")} 100%)`,
            boxShadow: `${token("--shadow-lg")}, ${token("--glow-accent-soft")}`,
            animation: `tutorial-victory-breathe calc(${token("--dur-slow")} * 7) ${token("--ease-in-out")} infinite`,
          }}
        >
          <span
            data-tutorial-victory-star=""
            style={{
              width: "42%",
              aspectRatio: "1",
              background: token("--gold"),
              clipPath:
                "polygon(50% 0%, 56% 44%, 100% 50%, 56% 56%, 50% 100%, 44% 56%, 0% 50%, 44% 44%)",
              boxShadow: token("--glow-accent-soft"),
              animation:
                `tutorial-victory-star-reveal ${TUTORIAL_VICTORY_TITLE_MOVE_DURATION} ${token("--ease-out")} ${TUTORIAL_VICTORY_TITLE_HOLD_DURATION} both, ` +
                `tutorial-victory-star-spin calc(${token("--dur-slow")} * 8) ${token("--ease-in-out")} ${TUTORIAL_VICTORY_TITLE_TOTAL_DURATION} infinite`,
            }}
          />
        </span>
      </div>
      <div
        data-tutorial-victory-action=""
        data-tutorial-victory-action-entering={
          actionSettled ? undefined : ""
        }
        data-tutorial-victory-action-settled={actionSettled ? "" : undefined}
        onAnimationEnd={(event) => {
          if (event.currentTarget === event.target) {
            setActionSettled(true);
          }
        }}
        style={{
          position: "relative",
          zIndex: 3,
          width: "100%",
          maxWidth: TUTORIAL_VICTORY_BUTTON_MAX_WIDTH,
          display: "flex",
          justifyContent: "center",
          animation: actionSettled
            ? undefined
            : `tutorial-victory-action ${TUTORIAL_VICTORY_ACTION_FADE_DURATION} ${token("--ease-out")} ${TUTORIAL_VICTORY_TITLE_TOTAL_DURATION} both`,
        }}
      >
        <GlassButton
          label="New Journey"
          variant="accent"
          testId="tutorial-battle-new-journey"
          onPress={onNewJourney}
        />
      </div>
    </section>
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
