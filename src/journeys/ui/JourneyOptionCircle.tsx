/**
 * One journey option as it appears on `JourneyScreen`: a circular dream-art
 * image control with stable space beneath the circle for hover-card anchoring.
 *
 * Hovering the circle reveals a `JourneyHoverCard` showing the option's full
 * rendered text plus a vertical stack of `GlossaryDefinitionCard` panels for
 * every glossary term the effect text references. Hover state is owned by the
 * caller (`JourneyScreen`), so multiple circles share a single "which option
 * is hovered" piece of state and never light up two cards simultaneously.
 *
 * `imageUrl` and `dreamName` are required: every rendered option has a
 * resolved dream-art assignment. Missing art is an invariant violation handled
 * upstream by `JourneyScreen` via the error fallback, so this component never
 * needs a placeholder path.
 *
 * Viewport awareness: the hover wrapper measures its rendered height after
 * mount and flips above the circle when the natural below-circle position
 * would clip off the bottom of the viewport. This keeps the full prose +
 * glossary stack on-screen even on short viewports or when the player hovers
 * an option that sits low on the page.
 *
 * Isolation: imports React, framer-motion, and the sibling `JourneyHoverCard`.
 */

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence } from "framer-motion";

import { JourneyHoverCard } from "./JourneyHoverCard";

/** Props for `JourneyOptionCircle`. */
export interface JourneyOptionCircleProps {
  /** Resolved dream-art URL (e.g. `/journeys/123.jpg`). */
  readonly imageUrl: string;
  /** Dream name used by the image control label and hover-card heading. */
  readonly dreamName: string;
  /** Full rendered option text passed through to the hover card. */
  readonly text: string;
  /**
   * When true, the image control is unavailable. Preview interactions remain
   * active so the player can still read the locked option's text.
   */
  readonly locked: boolean;
  /** True when this option is the one currently being hovered. */
  readonly hovered: boolean;
  /** Fired when the pointer enters the circle. */
  readonly onMouseEnter: () => void;
  /** Fired when the pointer leaves the circle. */
  readonly onMouseLeave: () => void;
  /** Fired when the dream image control is clicked. */
  readonly onEnterDream: () => void;
}

/** Gap (px) between the circle and the hover card. Matches `0.5rem`. */
const HOVER_GAP_PX = 8;

/** Padding (px) the hover wrapper refuses to cross at the viewport edges. */
const HOVER_VIEWPORT_PADDING_PX = 6;

type HoverSide = "below" | "above";

interface HoverPlacement {
  readonly side: HoverSide;
  /**
   * Maximum height (px) the hover wrapper is allowed to use. Set when the
   * stack does not fit cleanly on either side; the wrapper switches on
   * vertical scrolling so the prose tooltip and the topmost glossary
   * panels stay readable instead of clipping off the viewport edge.
   * `null` lets the wrapper grow to its natural height.
   */
  readonly maxHeightPx: number | null;
}

function buildHoverWrapperStyle(placement: HoverPlacement): CSSProperties {
  const base: CSSProperties =
    placement.side === "below"
      ? { top: `calc(100% + ${String(HOVER_GAP_PX)}px)` }
      : { bottom: `calc(100% + ${String(HOVER_GAP_PX)}px)` };
  if (placement.maxHeightPx === null) {
    return base;
  }
  return {
    ...base,
    maxHeight: placement.maxHeightPx,
    overflowY: "auto",
    pointerEvents: "auto",
  };
}

/** Circular dream-art image control. */
export function JourneyOptionCircle({
  imageUrl,
  dreamName,
  text,
  locked,
  hovered,
  onMouseEnter,
  onMouseLeave,
  onEnterDream,
}: JourneyOptionCircleProps) {
  const controlLabel = locked
    ? `Locked dream: ${dreamName}`
    : `Enter dream: ${dreamName}`;

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const hoverRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<HoverPlacement>({
    side: "below",
    maxHeightPx: null,
  });

  // Measure the rendered hover wrapper after each show and decide whether to
  // anchor below or above the circle plus whether the wrapper needs an
  // internal scroll cap to keep its content fully on-screen. Re-runs whenever
  // the hover toggles or the wrapper's content changes height (e.g. a
  // different option's glossary stack).
  useLayoutEffect(() => {
    if (!hovered) {
      // Reset to the default placement when hidden so the next show starts
      // from the preferred below-circle position with no scroll cap.
      setPlacement({ side: "below", maxHeightPx: null });
      return;
    }
    const button = buttonRef.current;
    const hover = hoverRef.current;
    if (button === null || hover === null) {
      return;
    }
    const buttonRect = button.getBoundingClientRect();
    const hoverRect = hover.getBoundingClientRect();
    const viewportHeight =
      typeof window === "undefined" ? 0 : window.innerHeight;
    const spaceBelow =
      viewportHeight -
      buttonRect.bottom -
      HOVER_GAP_PX -
      HOVER_VIEWPORT_PADDING_PX;
    const spaceAbove =
      buttonRect.top - HOVER_GAP_PX - HOVER_VIEWPORT_PADDING_PX;
    const fitsBelow = hoverRect.height <= spaceBelow;
    const fitsAbove = hoverRect.height <= spaceAbove;

    let nextSide: HoverSide;
    let nextMaxHeight: number | null = null;
    if (fitsBelow) {
      nextSide = "below";
    } else if (fitsAbove) {
      nextSide = "above";
    } else {
      // Neither side fits cleanly. Pick whichever has more room and cap the
      // wrapper's height so the prose tooltip plus as many glossary panels
      // as fit stay on-screen; the remainder becomes vertically scrollable
      // instead of clipping off the viewport edge.
      nextSide = spaceBelow >= spaceAbove ? "below" : "above";
      nextMaxHeight = Math.max(
        spaceBelow,
        spaceAbove,
        // Always allow at least the prose tooltip itself to render — well
        // below the typical option-text height so cards never collapse to a
        // zero-height strip.
        160,
      );
    }
    setPlacement({ side: nextSide, maxHeightPx: nextMaxHeight });
  }, [hovered, text]);

  return (
    <div className="relative flex w-72 flex-col items-center gap-3">
      <button
        ref={buttonRef}
        type="button"
        aria-disabled={locked ? "true" : undefined}
        aria-label={controlLabel}
        className="relative flex h-64 w-64 items-center justify-center overflow-hidden rounded-full border-0 p-0 text-3xl transition duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-fuchsia-300/70"
        style={{
          background: "#0d0814",
          border: locked
            ? "2px solid rgba(148, 163, 184, 0.45)"
            : "2px solid rgba(168, 85, 247, 0.72)",
          boxShadow: locked
            ? "0 0 12px rgba(148, 163, 184, 0.12)"
            : "0 0 22px rgba(168, 85, 247, 0.24)",
          cursor: locked ? "not-allowed" : "pointer",
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onMouseEnter}
        onBlur={onMouseLeave}
        onClick={() => {
          if (!locked) onEnterDream();
        }}
      >
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover transition duration-150"
          style={{
            filter: locked ? "grayscale(0.7)" : "none",
            opacity: locked ? 0.52 : 1,
          }}
          draggable={false}
        />
        {locked && (
          <span
            aria-hidden="true"
            className="absolute h-1 w-40 rotate-45 rounded-full bg-slate-100/80"
          />
        )}
      </button>

      <div aria-hidden="true" className="h-6" />

      <AnimatePresence>
        {hovered && (
          <div
            ref={hoverRef}
            data-side={placement.side}
            className="absolute left-1/2 z-10 -translate-x-1/2"
            style={buildHoverWrapperStyle(placement)}
          >
            <JourneyHoverCard dreamName={dreamName} text={text} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
