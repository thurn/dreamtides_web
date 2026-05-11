import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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
 * common).
 *
 * The trigger element receives `pointer-events: auto` styling so it remains
 * clickable. The popover itself uses `pointer-events: none` so it never
 * intercepts clicks on what's underneath it.
 *
 * Used for glossary term definitions on card / Dreamcaller / Dreamsign
 * rules text, and for full-card previews on compact deck rows.
 */

type Placement = "top" | "left";

interface HoverPopoverProps {
  /** The element that triggers the popover on hover. */
  children: ReactNode;
  /** The popover body. Rendered into a portal when visible. */
  content: ReactNode;
  /** Delay before showing the popover (ms). Defaults to 500ms. */
  delayMs?: number;
  /**
   * Where to anchor the popover relative to the trigger.
   * - `"top"` (default) centers the popover above the trigger.
   * - `"left"` anchors the popover to the left of the trigger, vertically
   *   centered. Useful for triggers on the right edge of the viewport
   *   (e.g. the right-side deck sidebar) where a top-anchored popover
   *   would clip or feel disconnected from the row.
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
const POPOVER_GAP_PX = 8;
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    transform: string;
  } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger === null) {
      return null;
    }
    const rect = trigger.getBoundingClientRect();
    if (placement === "left") {
      return {
        left: rect.left - POPOVER_GAP_PX,
        top: rect.top + rect.height / 2,
        transform: "translate(-100%, -50%)",
      };
    }
    // "top" placement: anchor above the trigger. When the trigger is so
    // close to the viewport top that the popover would clip off-screen,
    // flip to anchor below the trigger instead. This keeps the preview
    // visible for grid cells in the top row of a screen (e.g. the shop).
    const viewportHeight =
      typeof window === "undefined" ? 0 : window.innerHeight;
    const estimatedPopoverHeight = trigger.offsetHeight * 1.5;
    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;
    const flipToBottom =
      spaceAbove < estimatedPopoverHeight && spaceBelow > spaceAbove;
    if (flipToBottom) {
      return {
        left: rect.left + rect.width / 2,
        top: rect.bottom + POPOVER_GAP_PX,
        transform: "translate(-50%, 0)",
      };
    }
    return {
      left: rect.left + rect.width / 2,
      top: rect.top - POPOVER_GAP_PX,
      transform: "translate(-50%, -100%)",
    };
  }, [placement]);

  const show = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      const next = computePosition();
      if (next !== null) {
        setPosition(next);
      }
    }, delayMs);
  }, [clearTimer, computePosition, delayMs]);

  const hide = useCallback(() => {
    clearTimer();
    setPosition(null);
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const popoverStyle: CSSProperties = {
    left: position?.left ?? 0,
    top: position?.top ?? 0,
    transform: position?.transform ?? "translate(-50%, -100%)",
  };
  if (maxWidthPx !== null) {
    popoverStyle.maxWidth = maxWidthPx ?? POPOVER_DEFAULT_MAX_WIDTH_PX;
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
      {position !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[1000]"
            style={popoverStyle}
            role="tooltip"
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
