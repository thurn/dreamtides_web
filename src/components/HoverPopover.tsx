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
 * Renders `children` inline (typically a span of text). On `mouseenter` (or
 * keyboard focus), waits `delayMs` and then portals the `content` node into
 * the document body, positioned just above and centered on the trigger
 * element. Hides immediately on `mouseleave` or blur.
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
 * rules text.
 */

interface HoverPopoverProps {
  /** The element that triggers the popover on hover. */
  children: ReactNode;
  /** The popover body. Rendered into a portal when visible. */
  content: ReactNode;
  /** Delay before showing the popover (ms). Defaults to 500ms. */
  delayMs?: number;
  /** Additional class name for the inline trigger wrapper. */
  className?: string;
  /** Additional inline style for the inline trigger wrapper. */
  style?: CSSProperties;
}

const DEFAULT_DELAY_MS = 500;
const POPOVER_GAP_PX = 8;
const POPOVER_MAX_WIDTH_PX = 260;

export function HoverPopover({
  children,
  content,
  delayMs = DEFAULT_DELAY_MS,
  className,
  style,
}: HoverPopoverProps) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null,
  );

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
    const centerX = rect.left + rect.width / 2;
    return {
      left: centerX,
      top: rect.top - POPOVER_GAP_PX,
    };
  }, []);

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

  return (
    <>
      <span
        ref={triggerRef}
        className={className}
        style={style}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {position !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[1000]"
            style={{
              left: position.left,
              top: position.top,
              transform: "translate(-50%, -100%)",
              maxWidth: POPOVER_MAX_WIDTH_PX,
            }}
            role="tooltip"
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
