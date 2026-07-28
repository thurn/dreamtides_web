import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { useReducedMotion } from "framer-motion";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import type { DreamwellCardModel } from "../components/battle/DreamwellCard";
import { DreamwellCard } from "../components/battle/DreamwellCard";
import { CharacterDialogue } from "../components/overlay/CharacterDialogue";
import type { CharacterDialogueModel } from "../components/overlay/CharacterDialogue";
import { motionTimeSeconds } from "../primitives/motion-time";
import { Pressable } from "../primitives/Pressable";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "./use-is-desktop";

export type BattleTutorialGuidanceSourceView =
  | {
      readonly kind: "card";
      readonly model: GameCardModel;
      readonly figment: boolean;
      readonly battleCardId: string;
    }
  | {
      readonly kind: "journey-card";
      readonly model: GameCardModel;
      readonly cardId: string;
    }
  | {
      readonly kind: "dreamwell";
      readonly model: DreamwellCardModel;
      readonly side: "player" | "enemy";
    };

export interface BattleTutorialGuidanceView {
  readonly presentationId: string;
  readonly triggerId: string;
  readonly messageIndex: number;
  readonly messageCount: number;
  readonly duration: number;
  readonly dialogue: CharacterDialogueModel;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
  readonly bubbleWidth: number;
  readonly source: BattleTutorialGuidanceSourceView;
}

export interface BattleTutorialGuidanceProps {
  readonly view: BattleTutorialGuidanceView | null;
  readonly onDismiss: () => void;
  readonly onDurationComplete: () => void;
}

const GUIDANCE_OBJECT_TRAVEL_MS =
  motionTimeSeconds("--dur-slow") * 1_000;
const CARD_TUTORIAL_SCRIM_OPACITY = 0.48;

function battleCardSurface(
  battleCardId: string,
  journey: HTMLElement,
): HTMLElement | null {
  return [
    ...document.querySelectorAll<HTMLElement>("[data-battle-card-id]"),
  ].find(
    (candidate) =>
      candidate.dataset.battleCardId === battleCardId &&
      !journey.contains(candidate),
  ) ?? null;
}

function journeyCardSurface(
  cardId: string,
  journey: HTMLElement,
): HTMLElement | null {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-game-card-source][data-card-id]',
    ),
  ].filter(
    (candidate) =>
      candidate.dataset.cardId === cardId && !journey.contains(candidate),
  );
  return (
    candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) ??
    candidates[0] ??
    null
  );
}

function dreamwellSurface(
  side: "player" | "enemy",
  journey: HTMLElement,
  destination: boolean,
): HTMLElement | null {
  const selector = destination
    ? "[data-battle-dreamwell-layer]"
    : "[data-battle-zone]";
  return [...document.querySelectorAll<HTMLElement>(selector)].find(
    (candidate) =>
      !journey.contains(candidate) &&
      (destination
        ? candidate.dataset.battleDreamwellSide === side
        : candidate.dataset.battleZone === `${side}-status`),
  ) ?? null;
}

function sourceSurface(
  view: BattleTutorialGuidanceView,
  journey: HTMLElement,
): HTMLElement | null {
  return view.source.kind === "card"
    ? battleCardSurface(view.source.battleCardId, journey)
    : view.source.kind === "journey-card"
      ? journeyCardSurface(view.source.cardId, journey)
    : dreamwellSurface(view.source.side, journey, false);
}

function destinationSurface(
  view: BattleTutorialGuidanceView,
  journey: HTMLElement,
): HTMLElement | null {
  return view.source.kind === "card"
    ? battleCardSurface(view.source.battleCardId, journey)
    : view.source.kind === "journey-card"
      ? journeyCardSurface(view.source.cardId, journey)
    : (dreamwellSurface(view.source.side, journey, true) ??
        dreamwellSurface(view.source.side, journey, false));
}

function transformBetween(
  from: DOMRect,
  to: DOMRect,
): string | null {
  if (
    from.width === 0 ||
    from.height === 0 ||
    to.width === 0 ||
    to.height === 0
  ) {
    return null;
  }
  const x = from.left + from.width / 2 - (to.left + to.width / 2);
  const y = from.top + from.height / 2 - (to.top + to.height / 2);
  const scale = Math.min(from.width / to.width, from.height / to.height);
  return `translate(${String(x)}px, ${String(y)}px) scale(${String(scale)})`;
}

/**
 * Timed battle teaching moment which carries one visible game object from its
 * source, through Mira's explanation, and into the folded destination.
 */
export function BattleTutorialGuidance({
  view,
  onDismiss,
  onDurationComplete,
}: BattleTutorialGuidanceProps): ReactElement {
  const desktop = useIsDesktop();
  const reduceMotion = useReducedMotion() ?? false;
  const [retainedView, setRetainedView] =
    useState<BattleTutorialGuidanceView | null>(view);
  const journeyViewRef = useRef<BattleTutorialGuidanceView | null>(view);
  const journeyRef = useRef<HTMLElement | null>(null);
  const objectRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const hiddenSurfaceRef = useRef<{
    readonly element: HTMLElement;
    readonly visibility: string;
    readonly opacity: string;
  } | null>(null);
  const animationRef = useRef<Animation | null>(null);
  const scrimAnimationRef = useRef<Animation | null>(null);
  const destinationAnimationRef = useRef<Animation | null>(null);
  const renderedView = view ?? retainedView;
  const active = view !== null;
  const presentationId = view?.presentationId ?? null;
  const messageIndex = view?.messageIndex ?? null;
  const duration = view?.duration ?? null;

  useEffect(() => {
    if (duration === null) return undefined;
    const timeout = window.setTimeout(
      onDurationComplete,
      duration * 1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [
    duration,
    messageIndex,
    onDurationComplete,
    presentationId,
  ]);

  useLayoutEffect(() => {
    if (
      view !== null &&
      view.presentationId !== journeyViewRef.current?.presentationId
    ) {
      journeyViewRef.current = view;
    }
    if (
      view !== null &&
      (view.presentationId !== retainedView?.presentationId ||
        view.messageIndex !== retainedView.messageIndex)
    ) {
      setRetainedView(view);
    }
  }, [
    messageIndex,
    retainedView?.messageIndex,
    retainedView?.presentationId,
    view,
  ]);

  useLayoutEffect(() => {
    const journey = journeyRef.current;
    const object = objectRef.current;
    const journeyView = journeyViewRef.current;
    if (journey === null || object === null || journeyView === null) {
      return undefined;
    }

    animationRef.current?.cancel();
    animationRef.current = null;
    scrimAnimationRef.current?.cancel();
    scrimAnimationRef.current = null;
    destinationAnimationRef.current?.cancel();
    destinationAnimationRef.current = null;
    if (hiddenSurfaceRef.current !== null) {
      hiddenSurfaceRef.current.element.style.visibility =
        hiddenSurfaceRef.current.visibility;
      hiddenSurfaceRef.current.element.style.opacity =
        hiddenSurfaceRef.current.opacity;
      delete hiddenSurfaceRef.current.element.dataset
        .tutorialGuidanceJourneyHidden;
      hiddenSurfaceRef.current = null;
    }

    const surface = active
      ? sourceSurface(journeyView, journey)
      : destinationSurface(journeyView, journey);
    const hideSurface =
      surface !== null &&
      (journeyView.source.kind !== "dreamwell" || !active);
    if (hideSurface) {
      hiddenSurfaceRef.current = {
        element: surface,
        visibility: surface.style.visibility,
        opacity: surface.style.opacity,
      };
      if (active) {
        surface.style.visibility = "hidden";
      } else {
        surface.style.opacity = "0";
      }
      surface.dataset.tutorialGuidanceJourneyHidden = active
        ? "source"
        : "destination";
    }

    object.style.visibility = "visible";
    journey.dataset.tutorialGuidanceJourney = active ? "entering" : "settling";
    const objectBox = object.getBoundingClientRect();
    const surfaceBox = surface?.getBoundingClientRect();
    const transform =
      surfaceBox === undefined
        ? null
        : transformBetween(surfaceBox, objectBox);
    const finish = (): void => {
      if (active) {
        journey.dataset.tutorialGuidanceJourney = "dwelling";
        return;
      }
      if (hiddenSurfaceRef.current !== null) {
        hiddenSurfaceRef.current.element.style.visibility =
          hiddenSurfaceRef.current.visibility;
        hiddenSurfaceRef.current.element.style.opacity =
          hiddenSurfaceRef.current.opacity;
        delete hiddenSurfaceRef.current.element.dataset
          .tutorialGuidanceJourneyHidden;
        hiddenSurfaceRef.current = null;
      }
      setRetainedView(null);
    };

    if (
      reduceMotion ||
      transform === null ||
      typeof object.animate !== "function"
    ) {
      finish();
      return undefined;
    }

    const easing = window
      .getComputedStyle(journey)
      .getPropertyValue("--ease-out")
      .trim();
    const animation = object.animate(
      active
        ? [
            { transform, opacity: 1 },
            { transform: "none", opacity: 1 },
          ]
        : [
            { transform: "none", opacity: 1 },
            { transform, opacity: 0 },
          ],
      {
        duration: GUIDANCE_OBJECT_TRAVEL_MS,
        fill: active ? "backwards" : "forwards",
        ...(easing === "" ? {} : { easing }),
      },
    );
    animationRef.current = animation;
    animation.addEventListener("finish", finish, { once: true });
    const scrim = scrimRef.current;
    if (scrim !== null) {
      scrimAnimationRef.current = scrim.animate(
        active
          ? [
              { opacity: 0 },
              { opacity: CARD_TUTORIAL_SCRIM_OPACITY },
            ]
          : [
              { opacity: CARD_TUTORIAL_SCRIM_OPACITY },
              { opacity: 0 },
            ],
        {
          duration: GUIDANCE_OBJECT_TRAVEL_MS,
          fill: "forwards",
          ...(easing === "" ? {} : { easing }),
        },
      );
    }
    if (!active && surface !== null) {
      destinationAnimationRef.current = surface.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        {
          duration: GUIDANCE_OBJECT_TRAVEL_MS,
          fill: "forwards",
          ...(easing === "" ? {} : { easing }),
        },
      );
    }

    return () => {
      animation.cancel();
      scrimAnimationRef.current?.cancel();
      scrimAnimationRef.current = null;
      destinationAnimationRef.current?.cancel();
      destinationAnimationRef.current = null;
      if (animationRef.current === animation) animationRef.current = null;
    };
  }, [
    active,
    presentationId,
    reduceMotion,
  ]);

  useLayoutEffect(
    () => () => {
      animationRef.current?.cancel();
      scrimAnimationRef.current?.cancel();
      destinationAnimationRef.current?.cancel();
      if (hiddenSurfaceRef.current !== null) {
        hiddenSurfaceRef.current.element.style.visibility =
          hiddenSurfaceRef.current.visibility;
        hiddenSurfaceRef.current.element.style.opacity =
          hiddenSurfaceRef.current.opacity;
        delete hiddenSurfaceRef.current.element.dataset
          .tutorialGuidanceJourneyHidden;
      }
    },
    [],
  );

  if (renderedView === null) return <></>;
  return (
    <section
      ref={journeyRef}
      aria-label={
        renderedView.source.kind === "journey-card"
          ? "Card tutorial"
          : "Battle tutorial"
      }
      aria-live={active ? "polite" : "off"}
      aria-hidden={active ? undefined : "true"}
      data-battle-tutorial-guidance={
        renderedView.source.kind === "journey-card" ? undefined : ""
      }
      data-card-tutorial-guidance=""
      data-presentation-id={renderedView.presentationId}
      data-trigger-id={renderedView.triggerId}
      data-message-index={renderedView.messageIndex}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: token("--layer-reveal"),
        display: "flex",
        flexDirection: desktop ? "row" : "column",
        alignItems: "center",
        justifyContent: "center",
        gap: desktop ? token("--space-10") : token("--space-4"),
        boxSizing: "border-box",
        padding: desktop
          ? `max(${token("--space-8")}, var(--safe-area-inset-top)) max(${token("--space-8")}, var(--safe-area-inset-right)) max(${token("--space-8")}, var(--safe-area-inset-bottom)) max(${token("--space-8")}, var(--safe-area-inset-left))`
          : `max(${token("--space-4")}, var(--safe-area-inset-top)) max(${token("--space-4")}, var(--safe-area-inset-right)) max(${token("--space-4")}, var(--safe-area-inset-bottom)) max(${token("--space-4")}, var(--safe-area-inset-left))`,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {renderedView.source.kind === "journey-card" && (
        <div
          ref={scrimRef}
          aria-hidden="true"
          data-testid="card-tutorial-scrim"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            background: token("--scrim"),
            opacity: active ? CARD_TUTORIAL_SCRIM_OPACITY : 0,
          }}
        />
      )}
      <div
        ref={objectRef}
        data-battle-tutorial-source=""
        style={{
          position: "relative",
          zIndex: 1,
          visibility: "hidden",
          width:
            renderedView.source.kind === "dreamwell"
              ? desktop
                ? "min(520px, 45vw)"
                : "min(92vw, 64dvh, 430px)"
              : renderedView.source.kind === "journey-card"
                ? desktop
                  ? "min(360px, 45vw, 52dvh)"
                  : "min(62vw, 42dvh, 280px)"
              : desktop
                ? "min(240px, 45vw)"
                : "min(45vw, 34dvh)",
          maxHeight:
            desktop
              ? undefined
              : renderedView.source.kind === "dreamwell"
                ? "40dvh"
                : "48dvh",
          flex: "0 1 auto",
          transformOrigin: "50% 50%",
        }}
      >
        {renderedView.source.kind === "dreamwell" ? (
          <DreamwellCard
            model={renderedView.source.model}
            testId="battle-tutorial-dreamwell"
          />
        ) : (
          <GameCard
            model={renderedView.source.model}
            figment={
              renderedView.source.kind === "card"
                ? renderedView.source.figment
                : false
            }
            testId={
              renderedView.source.kind === "journey-card"
                ? "card-tutorial-card"
                : "battle-tutorial-card"
            }
          />
        )}
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          width: desktop ? undefined : "min(100%, 560px)",
          maxWidth: desktop ? renderedView.bubbleWidth : "none",
          flex: desktop ? "1 1 480px" : "0 1 auto",
          flexDirection: "column",
          alignItems: "center",
          transform: `translate(${String(renderedView.horizontalOffset)}px, ${String(renderedView.verticalOffset)}px)`,
        }}
      >
        <Pressable
          as="div"
          role="button"
          tabIndex={active ? 0 : -1}
          disabled={!active}
          aria-label={`Dismiss ${renderedView.dialogue.speakerName} tutorial`}
          data-testid="battle-tutorial-dismiss"
          hoverFeedback="stationary"
          pressFeedback="stationary"
          onClick={() => {
            if (active) onDismiss();
          }}
          onKeyDown={(event) => {
            if (!active) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onDismiss();
          }}
          style={{
            width: "100%",
            pointerEvents: "auto",
          }}
        >
          <CharacterDialogue
            dialogue={renderedView.dialogue}
            visible={active}
            size={desktop ? "prominent" : "compact"}
            testId="battle-tutorial-dialogue"
          />
        </Pressable>
      </div>
    </section>
  );
}
