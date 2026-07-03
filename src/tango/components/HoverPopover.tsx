import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  computePopoverPlacement,
  type PopoverPlacementSide,
} from "./hover-popover-placement";

/**
 * A reusable hover popover primitive.
 *
 * Renders `children` inside a wrapper element (defaults to a `<span>` for
 * inline triggers; pass `triggerAs="div"` for block-level triggers like
 * deck rows). On `mouseenter` (or keyboard focus), waits `delayMs` and then
 * portals the `content` node into the document body, anchored relative to
 * the trigger element. Hides immediately on `mouseleave` or blur.
 *
 * The popover is portaled directly to `document.body` so it floats above
 * any framer-motion overlays (z-index conflicts in the prototype are
 * common) and escapes any ancestor `overflow: hidden` clipping.
 *
 * The trigger element receives `pointer-events: auto` styling so it remains
 * clickable. The popover itself uses `pointer-events: none` so it never
 * intercepts clicks on what's underneath it.
 *
 * Viewport awareness:
 *
 * After the popover mounts, the component measures its actual rendered size
 * and then re-positions through `computePopoverPlacement` so the popover is
 * fully on-screen. The chosen side is deterministic given the same anchor
 * rect, popover size, and viewport: it flips when the preferred side does
 * not fit and shifts along the perpendicular axis to stay inside the
 * viewport. See `hover-popover-placement.ts` for the math.
 *
 * Used for glossary term definitions on card / Dreamcaller / Dreamsign
 * rules text, and for full-card previews on compact deck rows.
 */

type Placement = "top" | "left";

export interface HoverPopoverContentContext {
  /** The side selected by the viewport-aware placement pass. */
  side: PopoverPlacementSide;
  /** Anchor rect captured from the trigger when the popover opened. */
  anchorRect: DOMRect;
}

interface HoverPopoverProps {
  /** The element that triggers the popover on hover. */
  children: ReactNode;
  /** The popover body. Rendered into a portal when visible. */
  content: ReactNode | ((context: HoverPopoverContentContext) => ReactNode);
  /** Delay before showing the popover (ms). Defaults to 500ms. */
  delayMs?: number;
  /**
   * Preferred side to anchor the popover relative to the trigger.
   * - `"top"` (default) centers the popover above the trigger and flips to
   *   the bottom when the trigger sits near the top edge of the viewport.
   * - `"left"` anchors the popover to the left of the trigger and flips to
   *   the right when the trigger sits near the left edge of the viewport.
   *   Useful for triggers on the right edge of the viewport (e.g. the
   *   right-side deck sidebar) where the popover would otherwise appear
   *   detached above or below the row.
   *
   * In both cases the popover is shifted along the perpendicular axis as
   * needed so it stays fully inside the viewport.
   */
  placement?: Placement;
  /**
   * Override the popover's max-width cap (px). Defaults to 260px, which
   * suits short glossary blurbs. Pass `null` to disable the cap entirely
   * when `content` is a self-sizing element such as a card preview.
   */
  maxWidthPx?: number | null;
  /**
   * The DOM element type for the trigger wrapper. Defaults to `"span"` for
   * inline use within text. Pass `"div"` for block-level triggers.
   */
  triggerAs?: "span" | "div";
  /** Additional class name for the trigger wrapper. */
  className?: string;
  /** Additional inline style for the trigger wrapper. */
  style?: CSSProperties;
}

const DEFAULT_DELAY_MS = 500;
const POPOVER_DEFAULT_MAX_WIDTH_PX = 260;

/**
 * Shared delay (ms) before a full-card preview portals in over a compact
 * card row. Used by the draft deck panel, shop offers, dreamsign offerings,
 * and the deck viewer so the hand-feel is identical across screens.
 *
 * Tighter than the glossary-tooltip default (500ms) because players are
 * scanning a compact list and want quick previews while moving down a rail.
 */
export const CARD_HOVER_PREVIEW_DELAY_MS = 300;

/**
 * Shared width (px) of the floating card preview rendered above (or beside)
 * a compact card row. Sized to read full card art and rules text
 * comfortably; matches the width of a draft card.
 */
export const CARD_HOVER_PREVIEW_WIDTH_PX = 240;

interface ShownState {
  /** Anchor (trigger) rect captured when the popover became visible. */
  anchorRect: DOMRect;
}

interface ResolvedPlacement {
  left: number;
  top: number;
  side: PopoverPlacementSide;
}

export function HoverPopover({
  children,
  content,
  delayMs = DEFAULT_DELAY_MS,
  placement = "top",
  maxWidthPx,
  triggerAs = "span",
  className,
  style,
}: HoverPopoverProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shown, setShown] = useState<ShownState | null>(null);
  const [resolved, setResolved] = useState<ResolvedPlacement | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      const trigger = triggerRef.current;
      if (trigger === null) {
        return;
      }
      const anchorRect = trigger.getBoundingClientRect();
      // Reset any previous resolved placement so the first render is at the
      // off-screen sentinel position. The layout effect below measures the
      // freshly-mounted popover and replaces this with the real placement.
      setResolved(null);
      setShown({ anchorRect });
    }, delayMs);
  }, [clearTimer, delayMs]);

  const hide = useCallback(() => {
    clearTimer();
    setShown(null);
    setResolved(null);
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Measure the rendered popover and compute viewport-aware placement.
  // Runs after the popover is mounted off-screen on the first frame, then
  // commits the final position before the browser paints. Using
  // `useLayoutEffect` avoids the visual flash that `useEffect` would
  // produce between mount and the second render.
  useLayoutEffect(() => {
    if (shown === null) {
      return;
    }
    const popover = popoverRef.current;
    if (popover === null) {
      return;
    }
    const popoverRect = popover.getBoundingClientRect();
    const viewportWidth =
      typeof window === "undefined" ? 0 : window.innerWidth;
    const viewportHeight =
      typeof window === "undefined" ? 0 : window.innerHeight;
    const next = computePopoverPlacement({
      anchor: shown.anchorRect,
      popoverWidth: popoverRect.width,
      popoverHeight: popoverRect.height,
      viewportWidth,
      viewportHeight,
      preferred: placement,
    });
    setResolved(next);
  }, [shown, placement]);

  const popoverStyle: CSSProperties = (() => {
    if (resolved !== null) {
      return {
        left: resolved.left,
        top: resolved.top,
        transform: "none",
      };
    }
    // First render: park the popover off-screen at (0, 0) with no transform
    // so we can measure its natural size without the user seeing it. We
    // intentionally do not use `display: none` because that would zero the
    // measured rect.
    return {
      left: 0,
      top: 0,
      transform: "none",
      visibility: "hidden",
    };
  })();
  if (maxWidthPx !== null) {
    popoverStyle.maxWidth = maxWidthPx ?? POPOVER_DEFAULT_MAX_WIDTH_PX;
  }

  let contentNode: ReactNode;
  if (typeof content === "function" && shown !== null) {
    contentNode = content({
      anchorRect: shown.anchorRect,
      side: resolved?.side ?? (placement === "left" ? "left" : "top"),
    });
  } else if (typeof content === "function") {
    contentNode = null;
  } else {
    contentNode = content;
  }

  const triggerProps = {
    ref: (element: HTMLElement | null) => {
      triggerRef.current = element;
    },
    className,
    style,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  } as const;

  return (
    <>
      {triggerAs === "div" ? (
        <div {...triggerProps}>{children}</div>
      ) : (
        <span {...triggerProps}>{children}</span>
      )}
      {shown !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            className="pointer-events-none fixed z-[1000]"
            style={popoverStyle}
            role="tooltip"
            data-popover-side={resolved?.side ?? "pending"}
          >
            {contentNode}
          </div>,
          document.body,
        )}
    </>
  );
}
