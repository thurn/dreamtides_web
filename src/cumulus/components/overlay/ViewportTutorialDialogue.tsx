import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import {
  CharacterDialogue,
  type CharacterDialogueModel,
} from "./CharacterDialogue";
import { token } from "../../primitives/tokens";
import { SAFE_AREA_INSET_PROPERTIES } from "../../primitives/safe-area";
import {
  placeCardTutorialDialogue,
  placeTutorialDialogueAboveAnchor,
  useTutorialPlacementSnapshot,
  type TutorialSafeAreaInsets,
  type TutorialPlacementAnchorId,
} from "./tutorial-placement";
import { tx } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import type {
  PresentationId,
  TutorialTriggerId,
} from "../../../types/identifiers";

function measuredRect(
  element: HTMLElement,
  origin: { readonly left: number; readonly top: number } = {
    left: 0,
    top: 0,
  },
) {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    right: rect.right - origin.left,
    bottom: rect.bottom - origin.top,
    width: rect.width,
    height: rect.height,
  };
}

function safeAreaInsets(): TutorialSafeAreaInsets {
  const styles = window.getComputedStyle(document.documentElement);
  const value = (name: string): number => {
    const parsed = Number.parseFloat(styles.getPropertyValue(name));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    top: value(SAFE_AREA_INSET_PROPERTIES.top),
    right: value(SAFE_AREA_INSET_PROPERTIES.right),
    bottom: value(SAFE_AREA_INSET_PROPERTIES.bottom),
    left: value(SAFE_AREA_INSET_PROPERTIES.left),
  };
}

/** Named placement preference consumed by the tutorial placement coordinator. */
export type TutorialDialoguePlacement =
  | {
      /** Places dialogue in measured free viewport space. */
      readonly kind: "floating";
      /** Avoids registered card and chrome obstacles. */
      readonly avoidance: "cards-and-chrome";
    }
  | {
      /** Prefers placement above one registered semantic anchor. */
      readonly kind: "anchored";
      /** Stable semantic anchor registration to follow. */
      readonly anchorId: TutorialPlacementAnchorId;
    };

export interface ViewportTutorialDialogueProps {
  /** Stable identity for this dialogue presentation. */
  readonly presentationId: PresentationId;
  /** Complete visible CharacterDialogue presentation. */
  readonly dialogue: CharacterDialogueModel;
  /** Semantic host context used for presentation and diagnostics. */
  readonly context: "battle" | "card" | "site";
  /** Named placement preference resolved through registered geometry. */
  readonly placement: TutorialDialoguePlacement;
  /** Whether dialogue is visible and announced through aria-live. */
  readonly visible: boolean;
  /** Optional tutorial-state diagnostics retained on semantic attributes. */
  readonly diagnostics?: {
    /** Stable tutorial trigger identity. */
    readonly triggerId?: TutorialTriggerId;
    /** Zero-based message position within the active trigger. */
    readonly messageIndex?: number;
  };
}

/**
 * Place persistent journey dialogue in measured free viewport space while
 * leaving every card and marked screen region in its authored position.
 */
export function ViewportTutorialDialogue({
  presentationId,
  dialogue,
  context,
  placement,
  visible,
  diagnostics,
}: ViewportTutorialDialogueProps): ReactElement {
  const resolve = useLocalizer();
  const coordinator = useTutorialPlacementSnapshot();
  const viewportRef = useRef<HTMLElement | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number | null;
    bottom: number | null;
  } | null>(null);

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const viewport = viewportRef.current;
    if (layout === null || viewport === null) return undefined;

    const updatePosition = (): void => {
      const dialogueRect = layout.getBoundingClientRect();
      if (dialogueRect.width <= 0 || dialogueRect.height <= 0) return;
      const hostRect = viewport.getBoundingClientRect();
      const hostHasMeasuredArea =
        hostRect.width > dialogueRect.width ||
        hostRect.height > dialogueRect.height;
      const viewportWidth = hostHasMeasuredArea
        ? hostRect.width
        : window.innerWidth;
      const viewportHeight = hostHasMeasuredArea
        ? hostRect.height
        : window.innerHeight;
      const origin = hostHasMeasuredArea
        ? { left: hostRect.left, top: hostRect.top }
        : { left: 0, top: 0 };
      const measuredObstacles = [...coordinator.obstacles.values()]
        .filter(({ element }) => !layout.contains(element))
        .map(({ element, role }) => ({
          rect: measuredRect(element, origin),
          role,
        }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0);
      const cardRects = measuredObstacles
        .filter(({ role }) => role === "card")
        .map(({ rect }) => rect);
      const obstacleRects = measuredObstacles
        .filter(({ role }) => role !== "card")
        .map(({ rect }) => rect)
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const anchor =
        placement.kind === "anchored"
          ? (coordinator.anchors.get(placement.anchorId) ?? null)
          : null;
      const anchorRect =
        anchor === null ? undefined : measuredRect(anchor, origin);
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
          viewportWidth,
          viewportHeight,
          dialogueWidth: dialogueRect.width,
          dialogueHeight: dialogueRect.height,
          anchorRect,
          gap: resolvedGap,
          safeAreaInsets: safeAreaInsets(),
        });
        if (anchoredPosition !== null) {
          setPosition({ ...anchoredPosition, top: null });
          return;
        }
      }
      const floatingPosition = placeCardTutorialDialogue({
        viewportWidth,
        viewportHeight,
        dialogueWidth: dialogueRect.width,
        dialogueHeight: dialogueRect.height,
        cardRects,
        obstacleRects,
        gap: resolvedGap,
        safeAreaInsets: safeAreaInsets(),
      });
      setPosition({ ...floatingPosition, bottom: null });
    };

    updatePosition();
    let frame = 0;
    const schedulePosition = (): void => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updatePosition();
      });
    };
    window.addEventListener("resize", schedulePosition);
    window.visualViewport?.addEventListener("resize", schedulePosition);
    const observer = new ResizeObserver(schedulePosition);
    observer.observe(viewport);
    observer.observe(layout);
    observer.observe(document.documentElement);
    for (const { element } of coordinator.obstacles.values())
      observer.observe(element);
    for (const element of coordinator.anchors.values())
      observer.observe(element);
    const rootObserver = new MutationObserver(schedulePosition);
    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => {
      window.removeEventListener("resize", schedulePosition);
      window.visualViewport?.removeEventListener("resize", schedulePosition);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      observer.disconnect();
      rootObserver.disconnect();
    };
  }, [dialogue.text, presentationId, placement, coordinator]);

  return (
    <section
      ref={viewportRef}
      aria-label={resolve(
        context === "battle"
          ? tx(
              "Battle tutorial",
              "[accessibility] [tutorial] Tutorial region names.",
            )
          : context === "card"
            ? tx("Card tutorial", "[tutorial] Region card.")
            : tx("Site tutorial", "[tutorial] Region site."),
      )}
      aria-live={visible ? "polite" : "off"}
      aria-hidden={visible ? undefined : "true"}
      data-card-tutorial-guidance={context === "card" ? "" : undefined}
      data-site-tutorial-guidance={context === "site" ? "" : undefined}
      data-battle-tutorial-guidance={context === "battle" ? "" : undefined}
      data-presentation-id={presentationId}
      data-trigger-id={diagnostics?.triggerId}
      data-message-index={diagnostics?.messageIndex}
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
        data-card-tutorial-dialogue-layout={context === "card" ? "" : undefined}
        data-site-tutorial-dialogue-layout={context === "site" ? "" : undefined}
        data-battle-tutorial-dialogue-layout={
          context === "battle" ? "" : undefined
        }
        style={{
          position: "absolute",
          left: position === null ? 0 : position.left,
          top: position === null ? 0 : (position.top ?? undefined),
          bottom: position?.bottom ?? undefined,
          visibility: position === null ? "hidden" : "visible",
          width: `min(calc(100vw - (${token("--space-s")} * 2)), ${context === "battle" ? "520px" : context === "card" ? "560px" : "480px"})`,
        }}
      >
        <CharacterDialogue
          dialogue={dialogue}
          visible={visible}
          size="wide"
          testId={
            context === "card"
              ? "card-tutorial-dialogue"
              : context === "battle"
                ? "battle-tutorial-dialogue"
                : "site-tutorial-dialogue"
          }
        />
      </div>
    </section>
  );
}
