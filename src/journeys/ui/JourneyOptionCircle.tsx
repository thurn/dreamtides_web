/**
 * One journey option as it appears on `JourneyScreen`: a circular dream-art
 * image control with stable space beneath the circle for hover-card anchoring.
 *
 * Hovering the circle reveals a `JourneyHoverCard` showing the option's full
 * rendered text. Hover state is owned by the caller (`JourneyScreen`), so
 * multiple circles share a single "which option is hovered" piece of state and
 * never light up two cards simultaneously.
 *
 * `imageUrl` and `dreamName` are required: every rendered option has a
 * resolved dream-art assignment. Missing art is an invariant violation handled
 * upstream by `JourneyScreen` via the error fallback, so this component never
 * needs a placeholder path.
 *
 * Isolation: imports React, framer-motion, and the sibling `JourneyHoverCard`.
 */

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

  return (
    <div className="relative flex w-72 flex-col items-center gap-3">
      <button
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
            className="absolute left-1/2 z-10 -translate-x-1/2"
            style={{ top: "calc(100% + 0.5rem)" }}
          >
            <JourneyHoverCard dreamName={dreamName} text={text} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
