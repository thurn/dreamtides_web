import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { CardData } from "../../types/cards";
import { CardView } from "../../tango/components/CardView";
import { JOURNEY_SHADOW_IDLE } from "./journeyTheme";
import type { JourneyCardObject } from "./offerPresentation";

interface JourneyCardProps {
  object: JourneyCardObject;
  /** Rendered card width in design-space px (height follows the 2:3 aspect). */
  widthPx: number;
  /** Full `box-shadow` for the card box — selection ring + glow, or idle shadow. */
  ringShadow?: string;
  /** Idle float animation shorthand (e.g. "dj-float-y 4.8s ease-in-out infinite"). */
  floatAnimation?: string;
  /** Lower opacity / desaturate for an unselected candidate. */
  dim?: boolean;
  /** When true, render the card's `previewCard` (the transfigured "after"). */
  usePreview?: boolean;
  /** Render this exact card instead of the object's card (the "now" original). */
  cardOverride?: CardData;
  /** Extra CSS filter on the card box (e.g. the purge desaturation). */
  imageFilter?: string;
  onClick?: () => void;
  /** Absolutely-positioned overlay (CHOSEN pill, ×2 badge, check) — shares the float. */
  overlay?: ReactNode;
  /**
   * Grow the card in place on hover (the deck-viewer treatment). Defaults to
   * true. When false the card never zooms (e.g. the tiny duplicate-stack faces).
   */
  hoverPreview?: boolean;
  selected?: boolean;
  testId?: string;
  ariaLabel?: string;
}

/** On-screen width (px) the card grows toward on hover. */
const ZOOM_TARGET_WIDTH_PX = 340;
/** Hard cap on the zoom factor so a tiny card never balloons absurdly. */
const ZOOM_MAX_SCALE = 3;
/** Below this growth there is nothing to gain — leave the card alone. */
const ZOOM_MIN_USEFUL_SCALE = 1.04;
/** Fraction of the viewport the zoomed card may occupy. */
const ZOOM_MAX_VIEWPORT_W = 0.94;
const ZOOM_MAX_VIEWPORT_H = 0.92;
/** Gap (px) kept between the zoomed card and the viewport edges. */
const ZOOM_VIEWPORT_MARGIN_PX = 8;

interface ZoomBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** The original on-screen footprint, used to detect when the pointer leaves. */
  origin: DOMRect;
}

/** Clamp a zoomed span of `size` starting at `start` inside the viewport. */
function clampStart(start: number, size: number, viewport: number): number {
  if (size >= viewport - ZOOM_VIEWPORT_MARGIN_PX * 2) {
    return (viewport - size) / 2;
  }
  const min = ZOOM_VIEWPORT_MARGIN_PX;
  const max = viewport - ZOOM_VIEWPORT_MARGIN_PX - size;
  return Math.max(min, Math.min(start, max));
}

/**
 * One offer card rendered as its full `CardView` art with a ~9px radius, a soft
 * shadow, and a per-state selection ring + glow. The float animation lives on
 * the outer wrapper so the ring and any `overlay` (CHOSEN / ×2 / check) ride
 * along with the card's idle drift and never detach from it.
 *
 * Hovering grows the card in place — a full-size `CardView` copy is portaled to
 * `document.body` over the card's footprint and shrinks back the instant the
 * pointer leaves — the same treatment the deck viewer uses, with no separate
 * preview popup. The grown copy is purely visual (`pointer-events: none`); the
 * original card keeps its click target and never shifts the layout. Because the
 * Dream Journey stage renders inside a CSS scale transform, the copy is sized in
 * real screen pixels rather than by transforming the down-scaled original.
 */
export function JourneyCard({
  object,
  widthPx,
  ringShadow,
  floatAnimation,
  dim = false,
  usePreview = false,
  cardOverride,
  imageFilter,
  onClick,
  overlay,
  hoverPreview = true,
  selected,
  testId,
  ariaLabel,
}: JourneyCardProps) {
  const card =
    cardOverride ??
    (usePreview && object.objectType === "deckCard" && object.previewCard
      ? object.previewCard
      : object.card);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<ZoomBox | null>(null);
  const collapse = useCallback(() => {
    setZoom(null);
  }, []);

  const handleEnter = useCallback(() => {
    if (!hoverPreview || typeof window === "undefined") return;
    const box = boxRef.current;
    if (box === null) return;
    const rect = box.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scale = Math.min(
      ZOOM_MAX_SCALE,
      ZOOM_TARGET_WIDTH_PX / rect.width,
      (window.innerWidth * ZOOM_MAX_VIEWPORT_W) / rect.width,
      (window.innerHeight * ZOOM_MAX_VIEWPORT_H) / rect.height,
    );
    if (scale <= ZOOM_MIN_USEFUL_SCALE) return;
    const width = rect.width * scale;
    const height = rect.height * scale;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    setZoom({
      left: clampStart(centerX - width / 2, width, window.innerWidth),
      top: clampStart(centerY - height / 2, height, window.innerHeight),
      width,
      height,
      origin: rect,
    });
  }, [hoverPreview]);

  // Shrink the moment the pointer leaves the card's ORIGINAL footprint, so a row
  // of cards each pop in turn rather than the grown copy swallowing neighbours.
  useEffect(() => {
    if (zoom === null) return undefined;
    const { origin } = zoom;
    function handleMove(event: MouseEvent) {
      if (
        event.clientX < origin.left ||
        event.clientX > origin.right ||
        event.clientY < origin.top ||
        event.clientY > origin.bottom
      ) {
        collapse();
      }
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("scroll", collapse, true);
    window.addEventListener("blur", collapse);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("scroll", collapse, true);
      window.removeEventListener("blur", collapse);
    };
  }, [zoom, collapse]);

  const wrapperStyle: CSSProperties = {
    position: "relative",
    width: widthPx,
    ...(floatAnimation === undefined ? {} : { animation: floatAnimation }),
  };

  const boxStyle: CSSProperties = {
    borderRadius: 9,
    boxShadow: ringShadow ?? JOURNEY_SHADOW_IDLE,
    opacity: dim ? 0.9 : 1,
    filter: imageFilter ?? (dim ? "saturate(.85)" : undefined),
    cursor: onClick ? "pointer" : undefined,
  };

  return (
    <div className="dj-anim-card" style={wrapperStyle}>
      <div
        ref={boxRef}
        style={boxStyle}
        onClick={onClick}
        onMouseEnter={handleEnter}
        role={onClick ? "button" : undefined}
        aria-pressed={onClick ? selected : undefined}
        aria-label={ariaLabel}
        data-testid={testId}
        data-card-uuid={object.cardUuid}
        data-card-number={object.cardNumber}
        data-selected={selected ? "true" : undefined}
        data-hover-zoomed={zoom !== null ? "true" : undefined}
      >
        <CardView
          card={card}
          suppressHoverHelp
          transfiguration={usePreview ? object.transfiguration : undefined}
          className="block w-full overflow-hidden rounded-[9px]"
        />
      </div>
      {overlay}
      {zoom !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            aria-hidden="true"
            data-journey-card-zoom=""
            data-card-uuid={object.cardUuid}
            className="pointer-events-none fixed z-[1000]"
            style={{
              left: zoom.left,
              top: zoom.top,
              width: zoom.width,
              filter: "drop-shadow(0 18px 40px rgba(0,0,0,.55))",
            }}
          >
            <CardView
              card={card}
              suppressHoverHelp
              transfiguration={usePreview ? object.transfiguration : undefined}
              className="block w-full overflow-hidden rounded-[12px]"
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
