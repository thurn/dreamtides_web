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
import { extractGlossaryTerms } from "../data/glossary-terms";
import { GlossaryDefinitionCard } from "./GlossaryDefinitionCard";

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
 * Hard cap on how much bigger the card may get, as a multiple of its original
 * on-screen size. This is the primary knob for "how much does the card zoom":
 * lower it to grow cards less, raise it to grow them more. The effective scale
 * is the smaller of this cap, the {@link TARGET_WIDTH_PX} target, and the
 * viewport-fit limits, so small cards no longer balloon to 2–2.5x.
 */
export const MAX_SCALE = 1.5;

/**
 * On-screen width (px) the card would grow to on hover before {@link MAX_SCALE}
 * and the viewport limits are applied. Card rules text renders at roughly
 * `width * 0.042` px (see `RULES_FONT_RATIO` in `CardView.tsx`), so 340px lands
 * rules text around 14px — a comfortable reading size. {@link MAX_SCALE} caps
 * the growth for cards that start small enough to exceed it.
 */
export const TARGET_WIDTH_PX = 340;

/** Fraction of the viewport the enlarged card is allowed to occupy. */
const MAX_VIEWPORT_WIDTH_FRACTION = 0.94;
const MAX_VIEWPORT_HEIGHT_FRACTION = 0.92;

/** Don't bother growing a card that is already nearly this large. */
const MIN_USEFUL_SCALE = 1.02;

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
  /**
   * The card's rendered rules text. When provided, the glossary definitions
   * for any gameplay terms in the text are shown in a stack beside the
   * enlarged card while it is zoomed — the same hover-help the old floating
   * preview carried. The wrapped card should suppress its own inline term
   * popover (`suppressHoverHelp`) so the definitions appear only here, aligned
   * with the enlarged card rather than the small original underneath.
   */
  glossaryText?: string;
}

/** Gap (px) kept between the enlarged card and the viewport edges. */
const VIEWPORT_MARGIN_PX = 8;

/** Width (px) of the glossary definition stack shown beside a zoomed card. */
const GLOSSARY_STACK_WIDTH_PX = 224;

/** Gap (px) between the enlarged card and its glossary stack. */
const GLOSSARY_STACK_GAP_PX = 10;

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

/**
 * Renders the glossary definition stack for a zoomed card's rules text,
 * positioned just outside the enlarged card on whichever side has room (right
 * by default, flipping left near the viewport edge) and pinned within the
 * viewport vertically. Returns null when there is no text or no gameplay terms
 * to define. The stack is part of the pointer-events-none overlay, mirroring
 * the hover-help the floating preview used to carry.
 */
function renderGlossaryStack(
  zoom: ZoomState,
  glossaryText: string | undefined,
): ReactNode {
  if (glossaryText === undefined || typeof window === "undefined") {
    return null;
  }
  const terms = extractGlossaryTerms(glossaryText);
  if (terms.length === 0) {
    return null;
  }
  const scaledWidth = zoom.rect.width * zoom.scale;
  const scaledHeight = zoom.rect.height * zoom.scale;
  const centerX = zoom.rect.left + zoom.rect.width / 2;
  const centerY = zoom.rect.top + zoom.rect.height / 2;
  const finalLeft = centerX - scaledWidth / 2 + zoom.dx;
  const finalTop = centerY - scaledHeight / 2 + zoom.dy;
  const finalRight = finalLeft + scaledWidth;

  const fitsRight = finalRight + GLOSSARY_STACK_GAP_PX +
    GLOSSARY_STACK_WIDTH_PX + VIEWPORT_MARGIN_PX <= window.innerWidth;
  const rawLeft = fitsRight
    ? finalRight + GLOSSARY_STACK_GAP_PX
    : finalLeft - GLOSSARY_STACK_GAP_PX - GLOSSARY_STACK_WIDTH_PX;
  const left = Math.max(
    VIEWPORT_MARGIN_PX,
    Math.min(
      rawLeft,
      window.innerWidth - GLOSSARY_STACK_WIDTH_PX - VIEWPORT_MARGIN_PX,
    ),
  );
  const top = Math.max(
    VIEWPORT_MARGIN_PX,
    Math.min(finalTop, window.innerHeight - 120),
  );
  const maxHeight = window.innerHeight - top - VIEWPORT_MARGIN_PX;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-[1000] flex flex-col gap-1 overflow-hidden"
      style={{ left, top, width: GLOSSARY_STACK_WIDTH_PX, maxHeight }}
      data-hover-zoom-glossary=""
    >
      {terms.map((entry) => (
        <GlossaryDefinitionCard key={entry.term} entry={entry} />
      ))}
    </div>
  );
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
  glossaryText,
}: HoverZoomCardProps) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  // The card snaps straight to its target size on hover and snaps back the
  // instant the pointer leaves: the copy is simply mounted at full scale and
  // unmounted, with no transition.
  const [zoom, setZoom] = useState<ZoomState | null>(null);

  const collapse = useCallback(() => {
    setZoom(null);
  }, []);

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
      MAX_SCALE,
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
    setZoom({ rect, scale, dx, dy });
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
  }, [enabled, logSurface, targetWidthPx]);

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

  if (!enabled) {
    return (
      <div className={className} style={style} data-testid={dataTestId}>
        {children}
      </div>
    );
  }

  const overlay = zoom !== null && typeof document !== "undefined"
    ? createPortal(
      <>
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[1000]"
          style={{
            left: zoom.rect.left,
            top: zoom.rect.top,
            width: zoom.rect.width,
            height: zoom.rect.height,
            // Snap straight to the target size — no transition.
            transform:
              `translate(${zoom.dx}px, ${zoom.dy}px) scale(${zoom.scale})`,
            transformOrigin: "center center",
            filter: "drop-shadow(0 18px 40px rgba(0, 0, 0, 0.55))",
          }}
          data-hover-zoom-overlay=""
        >
          {children}
        </div>
        {renderGlossaryStack(zoom, glossaryText)}
      </>,
      document.body,
    )
    : null;

  return (
    <div
      ref={slotRef}
      className={className}
      style={{ position: "relative", ...style }}
      onMouseEnter={handleEnter}
      // Pressing the card to begin a drag snaps it back to its real size at
      // once, so the player drags the card's actual footprint rather than
      // aiming through the enlarged copy floating above it.
      onMouseDown={collapse}
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
