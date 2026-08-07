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
import {
  RADIAL_ANNOUNCEMENT_VICTORY_ACTION_DELAY,
  RadialAnnouncement,
} from "../components/status/RadialAnnouncement";
import { TransientStatusToast } from "../components/status/TransientStatusToast";
import { safeAreaInsetAtLeast } from "../primitives/safe-area";
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
import { useMessages } from "../hooks/use-messages";

export type TutorialBattleOwnership =
  "driver" | "observer" | "paused-driver-absent" | "terminal";
export type TutorialBattleMovementStatus =
  | "send-failed"
  | "exhausted-front-rank"
  | "no-legal-cell";
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
  readonly presentation:
    | {
        readonly kind: "opponent-play";
        readonly presentationId: string;
        /** UUID of the catalog card presented before automation continues. */
        readonly cardId: string;
        readonly battleCardId: string;
        readonly cardKind: "character" | "event";
        readonly card: MobileBattleCardView;
      }
    | {
        readonly kind: "dreamwell-reveal";
        readonly presentationId: string;
        /** UUID of the Dreamwell source card shown before its effect prompt. */
        readonly cardId: string;
        readonly side: "player" | "enemy";
      }
    | {
        readonly kind: "opponent-block";
        readonly presentationId: string;
      }
    | {
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
      }
    | null;
  readonly victoryVisible: boolean;
}

export interface TutorialBattleScreenProps {
  readonly view: TutorialBattleView;
  readonly interactions: MobileBattleInteractions;
  readonly movementStatusMessage: TutorialBattleMovementStatus | null;
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
  const t = useMessages();
  const reduceMotion = useReducedMotion();
  const turnAnnouncementKey = `${view.battle.battleId}:${view.battle.inspector.turn}:${view.battle.activeSide}`;
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
  const challengeTravelPresentationId = challengeTravel?.presentationId ?? null;
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
      setStartedChallengeTravelPresentationId(challengeTravelPresentationId);
      return;
    }
    let destinationFrame = 0;
    const paintedOriginFrame = window.requestAnimationFrame(() => {
      destinationFrame = window.requestAnimationFrame(() => {
        const root = screenRef.current;
        const rects = new Map<string, DOMRect>();
        if (root !== null && view.presentation?.kind === "challenge-resolved") {
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
        setStartedChallengeTravelPresentationId(challengeTravelPresentationId);
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
      animation.addEventListener(
        "finish",
        () => {
          animation.cancel();
          delete destination.dataset.tutorialChallengeVoidTravel;
        },
        { once: true },
      );
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
        {view.presentation?.kind === "opponent-play" && presentationVisible ? (
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
            top: `calc(var(--safe-area-inset-top) + ${token("--space-6xl")})`,
            width: "90vw",
            maxWidth: 416,
            transform: "translateX(-50%)",
            zIndex: 80,
          }}
        >
          <GlassPanel
            title={t("battle-tutorial-target-selection-title")}
            subtitle={t("battle-tutorial-target-selection-instruction")}
            headerSpacing="compact"
            headerDivider={false}
            radius="control"
            rightAccessory={{
              kind: "glassButton",
              button: {
                label: t("battle-tutorial-target-selection-cancel-action"),
                testId: "tutorial-target-cancel",
                onPress: () => interactions.onTargetSelectionCancel?.(),
              },
            }}
          >
            <span />
          </GlassPanel>
        </div>
      ) : null}
      {movementStatusMessage !== null ? (
        <TransientStatusToast
          copy={{
            message: t("battle-tutorial-movement-error", {
              reason:
                movementStatusMessage === "send-failed"
                  ? "sendFailed"
                  : movementStatusMessage === "exhausted-front-rank"
                    ? "exhaustedFrontRank"
                    : "noLegalCell",
            }),
          }}
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

const TUTORIAL_VICTORY_BUTTON_MAX_WIDTH = 240;
const TUTORIAL_VICTORY_ACTION_FADE_DURATION = `calc(${token("--dur-slow")} * 1.4)`;

const TUTORIAL_VICTORY_CSS = `
  @keyframes tutorial-victory-action {
    from { opacity: 0; transform: translateY(${token("--space-s")}); }
    to { opacity: 1; transform: translateY(0); }
  }

  [data-tutorial-victory-action][data-tutorial-victory-action-entering] {
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
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
        gap: token("--space-2xl"),
        paddingTop: safeAreaInsetAtLeast("top", "--space-2xl"),
        paddingRight: `max(var(--safe-area-inset-right), ${token("--space-l")})`,
        paddingBottom: safeAreaInsetAtLeast("bottom", "--space-2xl"),
        paddingLeft: `max(var(--safe-area-inset-left), ${token("--space-l")})`,
      }}
    >
      <style>{TUTORIAL_VICTORY_CSS}</style>
      <Motes on tint="violet" count={24} seed={121} zIndex={1} />
      <Motes on tint="warm" count={12} seed={243} zIndex={1} />
      <RadialAnnouncement
        variant="victory"
        headline="Victory"
        announcementId="tutorial-victory"
      />
      <div
        data-tutorial-victory-action=""
        data-tutorial-victory-action-entering={actionSettled ? undefined : ""}
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
            : `tutorial-victory-action ${TUTORIAL_VICTORY_ACTION_FADE_DURATION} ${token("--ease-out")} ${RADIAL_ANNOUNCEMENT_VICTORY_ACTION_DELAY} both`,
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
        reduceMotion ? undefined : battleCardLayoutId(presentation.battleCardId)
      }
      data-battle-card-layout-motion={reduceMotion ? "snap" : "travel"}
      layoutId={
        reduceMotion ? undefined : battleCardLayoutId(presentation.battleCardId)
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
        duration: reduceMotion ? 0 : TUTORIAL_BATTLE_REVEAL_TRAVEL_SECONDS,
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
