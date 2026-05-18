/**
 * One journey option as it appears on `JourneyScreen`: a circular dream-art
 * image with a dream-name caption and an Enter Dream button below.
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
  /** Dream name shown as the caption and the hover-card heading. */
  readonly dreamName: string;
  /** Full rendered option text passed through to the hover card. */
  readonly text: string;
  /**
   * When true, the Enter Dream button is disabled. The hover card and circle
   * remain interactive so the player can still read the locked option's text.
   */
  readonly locked: boolean;
  /** True when this option is the one currently being hovered. */
  readonly hovered: boolean;
  /** Fired when the pointer enters the circle. */
  readonly onMouseEnter: () => void;
  /** Fired when the pointer leaves the circle. */
  readonly onMouseLeave: () => void;
  /** Fired when the Enter Dream button is clicked. */
  readonly onEnterDream: () => void;
}

/** Circular dream-art image + caption + Enter Dream button. */
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
  return (
    <div className="relative flex w-72 flex-col items-center gap-3">
      <div
        className="relative flex h-64 w-64 items-center justify-center overflow-hidden rounded-full text-3xl"
        style={{
          background: "#0d0814",
          border: "2px solid rgba(168, 85, 247, 0.45)",
          boxShadow: "0 0 18px rgba(168, 85, 247, 0.18)",
          cursor: "default",
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <img
          src={imageUrl}
          alt={dreamName}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>

      <h3
        className="text-center text-base font-bold"
        style={{ color: "#c084fc" }}
      >
        {dreamName}
      </h3>

      <button
        type="button"
        disabled={locked}
        onClick={locked ? undefined : onEnterDream}
        className="w-full rounded-lg px-5 py-2.5 font-bold text-white transition-opacity"
        style={{
          backgroundColor: "#7c3aed",
          opacity: locked ? 0.4 : 1,
          cursor: locked ? "not-allowed" : "pointer",
        }}
      >
        Enter Dream
      </button>

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
