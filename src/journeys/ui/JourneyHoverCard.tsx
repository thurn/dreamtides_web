/**
 * Popover that fades in next to a `JourneyOptionCircle` while the player hovers
 * the option. Shows the dream-name heading and the option's full rendered text
 * so the player can read costs/rewards without committing.
 *
 * Positioning is handled by the caller: `JourneyOptionCircle` renders the card
 * inside an `absolute`-positioned wrapper anchored to the circle. The card
 * itself is a `motion.div` with a tooltip-style purple gradient panel.
 *
 * Isolation: imports React + framer-motion only.
 */

import { motion } from "framer-motion";

/** Props for `JourneyHoverCard`. */
export interface JourneyHoverCardProps {
  /** Dream name shown as the popover heading. */
  readonly dreamName: string;
  /** Full rendered option text (cost + reward + flavor). */
  readonly text: string;
}

/** Fade-in popover with dream name heading + option text. */
export function JourneyHoverCard({ dreamName, text }: JourneyHoverCardProps) {
  return (
    <motion.div
      role="tooltip"
      className="pointer-events-none w-64 rounded-xl px-4 py-3"
      style={{
        background:
          "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
        border: "1px solid rgba(168, 85, 247, 0.4)",
        boxShadow: "0 0 20px rgba(168, 85, 247, 0.25)",
        color: "#e2e8f0",
      }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18 }}
    >
      <h4
        className="mb-1 text-sm font-bold tracking-wide"
        style={{ color: "#c084fc" }}
      >
        {dreamName}
      </h4>
      <p
        className="whitespace-pre-line text-xs leading-relaxed"
        style={{ color: "#e2e8f0" }}
      >
        {text}
      </p>
    </motion.div>
  );
}
