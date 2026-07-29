import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  CharacterDialogue,
  type CharacterDialogueModel,
} from "../components/overlay/CharacterDialogue";
import { token } from "../primitives/tokens";
import { placeCardTutorialDialogue } from "./card-tutorial-dialogue-placement";
import { useIsDesktop } from "./use-is-desktop";

export interface ViewportTutorialDialogueView {
  readonly id: string;
  readonly dialogue: CharacterDialogueModel;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
  readonly bubbleWidth: number;
}

export interface ViewportTutorialDialogueProps {
  readonly view: ViewportTutorialDialogueView;
  readonly visible: boolean;
  readonly kind: "card" | "site";
  readonly triggerId?: string;
  readonly messageIndex?: number;
}

const TUTORIAL_CLEARANCE_SELECTOR = [
  "[data-draft-pick-counter]",
  "[data-journey-status-bar-anchor]",
  "[data-coop-presence-status]",
  "[data-gallery-frame]",
  "[data-speech-bubble-pointer-placement]",
  "[data-tutorial-guidance-obstacle]",
].join(",");

/**
 * Place persistent journey dialogue in measured free viewport space while
 * leaving every card and marked screen region in its authored position.
 */
export function ViewportTutorialDialogue({
  view,
  visible,
  kind,
  triggerId,
  messageIndex,
}: ViewportTutorialDialogueProps): ReactElement {
  const desktop = useIsDesktop();
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    if (layout === null) return undefined;

    const updatePosition = (): void => {
      const dialogueRect = layout.getBoundingClientRect();
      if (dialogueRect.width <= 0 || dialogueRect.height <= 0) return;
      const cardRects = [
        ...document.querySelectorAll<HTMLElement>(
          '[data-game-card-source][data-card-id]',
        ),
      ]
        .filter((card) => !layout.contains(card))
        .map((card) => card.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const obstacleRects = [
        ...document.querySelectorAll<HTMLElement>(
          TUTORIAL_CLEARANCE_SELECTOR,
        ),
      ]
        .filter((obstacle) => !layout.contains(obstacle))
        .map((obstacle) => obstacle.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const gap = Number.parseFloat(
        window.getComputedStyle(layout).getPropertyValue("--space-4"),
      );
      setPosition(
        placeCardTutorialDialogue({
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          dialogueWidth: dialogueRect.width,
          dialogueHeight: dialogueRect.height,
          cardRects,
          obstacleRects,
          gap: Number.isFinite(gap) ? gap : 0,
          horizontalOffset: view.horizontalOffset,
          verticalOffset: view.verticalOffset,
        }),
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    const observer = new ResizeObserver(updatePosition);
    observer.observe(layout);
    for (const obstacle of document.querySelectorAll<HTMLElement>(
      `[data-game-card-source][data-card-id], ${TUTORIAL_CLEARANCE_SELECTOR}`,
    )) {
      if (!layout.contains(obstacle)) observer.observe(obstacle);
    }
    return () => {
      window.removeEventListener("resize", updatePosition);
      observer.disconnect();
    };
  }, [
    view.bubbleWidth,
    view.dialogue.text,
    view.horizontalOffset,
    view.id,
    view.verticalOffset,
  ]);

  return (
    <section
      aria-label={kind === "card" ? "Card tutorial" : "Site tutorial"}
      aria-live={visible ? "polite" : "off"}
      aria-hidden={visible ? undefined : "true"}
      data-card-tutorial-guidance={kind === "card" ? "" : undefined}
      data-site-tutorial-guidance={kind === "site" ? "" : undefined}
      data-presentation-id={view.id}
      data-trigger-id={triggerId}
      data-message-index={messageIndex}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: token("--layer-reveal"),
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div
        ref={layoutRef}
        data-card-tutorial-dialogue-layout={kind === "card" ? "" : undefined}
        data-site-tutorial-dialogue-layout={kind === "site" ? "" : undefined}
        style={{
          position: "absolute",
          left: position === null ? 0 : position.left,
          top: position === null ? 0 : position.top,
          visibility: position === null ? "hidden" : "visible",
          width: desktop
            ? `min(calc(100vw - (${token("--space-4")} * 2)), ${String(view.bubbleWidth)}px)`
            : `calc(100vw - (${token("--space-4")} * 2))`,
          maxWidth: view.bubbleWidth,
        }}
      >
        <CharacterDialogue
          dialogue={view.dialogue}
          visible={visible}
          size="wide"
          testId={
            kind === "card"
              ? "card-tutorial-dialogue"
              : "site-tutorial-dialogue"
          }
        />
      </div>
    </section>
  );
}
