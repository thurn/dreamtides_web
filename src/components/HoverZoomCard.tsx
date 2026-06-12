import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { logEventOnce } from "../logging";

/**
 * Wraps a medium-size card so that hovering it grows the card itself in place
 * instead of opening a separate floating preview.
 *
 * Behaviour:
 *
 * - On hover the card scales up, centered on its original position, until its
 *   rules text reaches a comfortably legible size (see {@link TARGET_WIDTH_PX}).
 * - The enlarged card "pops" out of the surrounding layout: the grown image is
 *   portaled to `document.body` and positioned over the original footprint, so
 *   it floats above neighbouring cards and escapes any ancestor
 *   `overflow: hidden` / scroll clipping. The original card stays exactly where
 *   it was, so nothing else in the layout shifts.
 * - The card shrinks again as soon as the pointer leaves the card's *original*
 *   borders. The grown copy is purely visual (`pointer-events: none`) and the
 *   hover region is tracked against the original rect, never the enlarged
 *   bounds. That is what lets a row of cards each pop up in turn: the currently
 *   enlarged card never swallows the hover of the neighbour underneath its
 *   overhang.
 *
 * The original card underneath keeps all of its interactivity (clicks, drag,
 * term popovers) within its original footprint; the floating copy only mirrors
 * its appearance.
 */

/**
 * On-screen width (px) the card grows to on hover. Card rules text renders at
 * roughly `width * 0.042` px (see `RULES_FONT_RATIO` in `CardView.tsx`), so
 * 340px lands rules text around 14px — a comfortable reading size that clears
 * common body-text legibility guidance for condensed UI type.
 */
export const TARGET_WIDTH_PX = 340;

/** Fraction of the viewport the enlarged card is allowed to occupy. */
const MAX_VIEWPORT_WIDTH_FRACTION = 0.94;
const MAX_VIEWPORT_HEIGHT_FRACTION = 0.92;

/** Don't bother growing a card that is already nearly this large. */
const MIN_USEFUL_SCALE = 1.02;

/** Grow / shrink transition duration (ms). Kept in sync with the CSS below. */
const TRANSITION_MS = 170;

interface HoverZoomCardProps {
  /** The card to render (e.g. a `<CardDisplay />`). */
  children: ReactNode;
  /**
   * When false the wrapper is an inert pass-through that renders `children`
   * with no hover behaviour. Used to opt compact / tiny card surfaces out.
   */
  enabled?: boolean;
  /** Width (px) the card grows to. Defaults to {@link TARGET_WIDTH_PX}. */
  targetWidthPx?: number;
  /** Extra class for the slot element that holds the layout footprint. */
  className?: string;
  /** Extra style for the slot element. */
  style?: CSSProperties;
  /** Test id applied to the slot element. */
  "data-testid"?: string;
  /**
   * Optional label recorded with the `card_hover_zoom` log event so behaviour
   * can be reconstructed per surface (deck viewer, shop, battle hand, ...).
   */
  logSurface?: string;
}

/** Gap (px) kept between the enlarged card and the viewport edges. */
const VIEWPORT_MARGIN_PX = 8;

/**
 * Returns the translation (px) needed along one axis to keep an enlarged span
 * of `size` starting at `start` within `[margin, viewport - margin]`. When the
 * span is larger than the available room it is centered in the viewport
 * instead. Returns 0 when the centered span already fits.
 */
function clampOffset(start: number, size: number, viewport: number): number {
  const available = viewport - VIEWPORT_MARGIN_PX * 2;
  if (size >= available) {
    const centered = (viewport - size) / 2;
    return centered - start;
  }
  const min = VIEWPORT_MARGIN_PX;
  const max = viewport - VIEWPORT_MARGIN_PX - size;
  if (start < min) {
    return min - start;
  }
  if (start > max) {
    return max - start;
  }
  return 0;
}

interface ZoomState {
  /** Original on-screen footprint captured when the hover began. */
  rect: DOMRect;
  /** Scale factor applied to reach the target legible width. */
  scale: number;
  /**
   * Translation (px) nudging the grown card back inside the viewport when a
   * purely centered enlargement would spill past an edge (most visibly for the
   * bottom-anchored battle hand). Zero for interior cards, which grow centered
   * on their original position exactly.
   */
  dx: number;
  dy: number;
}

export function HoverZoomCard({
  children,
  enabled = true,
  targetWidthPx = TARGET_WIDTH_PX,
  className,
  style,
  "data-testid": dataTestId,
  logSurface,
}: HoverZoomCardProps) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  // `active` drives the grow/shrink transition: the copy mounts at the
  // original size, flips to `active` on the next frame to animate up, and
  // flips back to inactive to animate down before unmounting.
  const [active, setActive] = useState(false);
  const rafRef = useRef<number | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (collapseTimerRef.current !== null) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const collapse = useCallback(() => {
    clearPending();
    setActive(false);
    collapseTimerRef.current = setTimeout(() => {
      setZoom(null);
      collapseTimerRef.current = null;
    }, TRANSITION_MS + 30);
  }, [clearPending]);

  const handleEnter = useCallback(() => {
    if (!enabled) {
      return;
    }
    const slot = slotRef.current;
    if (slot === null || typeof window === "undefined") {
      return;
    }
    const rect = slot.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const widthLimited = (window.innerWidth * MAX_VIEWPORT_WIDTH_FRACTION) /
      rect.width;
    const heightLimited = (window.innerHeight * MAX_VIEWPORT_HEIGHT_FRACTION) /
      rect.height;
    const scale = Math.min(
      targetWidthPx / rect.width,
      widthLimited,
      heightLimited,
    );
    if (scale <= MIN_USEFUL_SCALE) {
      // Already large enough on screen — leave it alone.
      return;
    }
    // Grow centered on the card's own position, then nudge back inside the
    // viewport if a centered enlargement would clip past an edge.
    const scaledWidth = rect.width * scale;
    const scaledHeight = rect.height * scale;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const scaledLeft = centerX - scaledWidth / 2;
    const scaledTop = centerY - scaledHeight / 2;
    const dx = clampOffset(scaledLeft, scaledWidth, window.innerWidth);
    const dy = clampOffset(scaledTop, scaledHeight, window.innerHeight);
    clearPending();
    setZoom({ rect, scale, dx, dy });
    setActive(false);
    if (logSurface !== undefined) {
      // Recorded once per surface per session: enough to confirm the in-place
      // zoom engaged on a given screen without flooding the log with an entry
      // for every individual card the player sweeps the pointer across.
      logEventOnce(`card_hover_zoom:${logSurface}`, "card_hover_zoom", {
        surface: logSurface,
        originalWidthPx: Math.round(rect.width),
        scale: Number(scale.toFixed(3)),
        targetWidthPx,
      });
    }
    // Two frames: the first commits the mounted-at-original-size copy, the
    // second flips `active` so the browser animates the grow.
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        setActive(true);
      });
    });
  }, [clearPending, enabled, logSurface, targetWidthPx]);

  // While a card is grown, shrink it the moment the pointer leaves the
  // *original* footprint. Tracking the stored rect (rather than the enlarged
  // copy's own hover state) is what keeps neighbouring cards hoverable.
  useEffect(() => {
    if (zoom === null) {
      return undefined;
    }
    const { rect } = zoom;
    function handleMove(event: MouseEvent) {
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        collapse();
      }
    }
    function handleDismiss() {
      collapse();
    }
    window.addEventListener("mousemove", handleMove);
    // The footprint is captured in viewport coordinates, so any scroll
    // invalidates it — collapse rather than drift out of place.
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("blur", handleDismiss);
    document.addEventListener("mouseleave", handleDismiss);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("blur", handleDismiss);
      document.removeEventListener("mouseleave", handleDismiss);
    };
  }, [zoom, collapse]);

  useEffect(() => clearPending, [clearPending]);

  if (!enabled) {
    return (
      <div className={className} style={style} data-testid={dataTestId}>
        {children}
      </div>
    );
  }

  const overlay = zoom !== null && typeof document !== "undefined"
    ? createPortal(
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-[1000]"
        style={{
          left: zoom.rect.left,
          top: zoom.rect.top,
          width: zoom.rect.width,
          height: zoom.rect.height,
          transform: active
            ? `translate(${zoom.dx}px, ${zoom.dy}px) scale(${zoom.scale})`
            : "scale(1)",
          transformOrigin: "center center",
          transition: `transform ${TRANSITION_MS}ms ease`,
          willChange: "transform",
          filter: active
            ? "drop-shadow(0 18px 40px rgba(0, 0, 0, 0.55))"
            : undefined,
        }}
        data-hover-zoom-overlay=""
      >
        {children}
      </div>,
      document.body,
    )
    : null;

  return (
    <div
      ref={slotRef}
      className={className}
      style={{ position: "relative", ...style }}
      onMouseEnter={handleEnter}
      data-testid={dataTestId}
      data-hover-zoomed={zoom !== null ? "true" : undefined}
    >
      {/* The original card keeps its layout slot and full interactivity. The
          grown copy is opaque and fully occludes this card within its
          footprint, so the two never visibly double-expose; because the copy
          is pointer-events-none, clicks / drags within the original borders
          still land on this card underneath. */}
      {children}
      {overlay}
    </div>
  );
}
