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
import {
  placeCardTutorialDialogue,
  placeTutorialDialogueAboveAnchor,
} from "./card-tutorial-dialogue-placement";
import { useIsDesktop } from "./use-is-desktop";
import { useMessages } from "../hooks/use-messages";

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
  readonly kind: "battle" | "card" | "site";
  readonly triggerId?: string;
  readonly messageIndex?: number;
}

const TUTORIAL_CLEARANCE_SELECTOR = [
  "[data-draft-pick-counter]",
  "[data-journey-status-bar-anchor]",
  "[data-coop-presence-status]",
  "[data-testid='dreamscape-menu-button']",
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
  const t = useMessages();
  const desktop = useIsDesktop();
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number | null;
    bottom: number | null;
  } | null>(null);

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
      const anchor =
        kind === "site"
          ? document.querySelector<HTMLElement>(
              "[data-tutorial-guidance-anchor]",
            )
          : null;
      const anchorRect =
        anchor === null
          ? undefined
          : {
              left: anchor.offsetLeft,
              top: anchor.offsetTop,
              right: anchor.offsetLeft + anchor.offsetWidth,
              bottom: anchor.offsetTop + anchor.offsetHeight,
              width: anchor.offsetWidth,
              height: anchor.offsetHeight,
            };
      const gap = Number.parseFloat(
        window.getComputedStyle(layout).getPropertyValue("--space-s"),
      );
      const resolvedGap = Number.isFinite(gap) ? gap : 0;
      if (
        anchorRect !== undefined &&
        anchorRect.width > 0 &&
        anchorRect.height > 0
      ) {
        const anchoredPosition = placeTutorialDialogueAboveAnchor({
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          dialogueWidth: dialogueRect.width,
          dialogueHeight: dialogueRect.height,
          anchorRect,
          gap: resolvedGap,
          horizontalOffset: view.horizontalOffset,
          verticalOffset: view.verticalOffset,
        });
        if (anchoredPosition !== null) {
          setPosition({ ...anchoredPosition, top: null });
          return;
        }
      }
      const floatingPosition = placeCardTutorialDialogue({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        dialogueWidth: dialogueRect.width,
        dialogueHeight: dialogueRect.height,
        cardRects,
        obstacleRects,
        gap: resolvedGap,
        horizontalOffset: view.horizontalOffset,
        verticalOffset: view.verticalOffset,
      });
      setPosition(
        { ...floatingPosition, bottom: null },
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
    kind,
  ]);

  return (
    <section
      aria-label={
        kind === "battle"
          ? t("tutorial-region-battle")
          : kind === "card"
            ? t("tutorial-region-card")
            : t("tutorial-region-site")
      }
      aria-live={visible ? "polite" : "off"}
      aria-hidden={visible ? undefined : "true"}
      data-card-tutorial-guidance={kind === "card" ? "" : undefined}
      data-site-tutorial-guidance={kind === "site" ? "" : undefined}
      data-battle-tutorial-guidance={kind === "battle" ? "" : undefined}
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
        data-battle-tutorial-dialogue-layout={
          kind === "battle" ? "" : undefined
        }
        style={{
          position: "absolute",
          left: position === null ? 0 : position.left,
          top: position === null ? 0 : (position.top ?? undefined),
          bottom: position?.bottom ?? undefined,
          visibility: position === null ? "hidden" : "visible",
          width: desktop
            ? `min(calc(100vw - (${token("--space-s")} * 2)), ${String(view.bubbleWidth)}px)`
            : `calc(100vw - (${token("--space-s")} * 2))`,
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
              : kind === "battle"
                ? "battle-tutorial-dialogue"
                : "site-tutorial-dialogue"
          }
        />
      </div>
    </section>
  );
}
