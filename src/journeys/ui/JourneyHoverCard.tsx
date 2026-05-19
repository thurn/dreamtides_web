/**
 * Popover that fades in next to a `JourneyOptionCircle` while the player hovers
 * the option. Shows the dream-name heading, the option's full rendered text,
 * and, when the effect text references glossary terms, a stacked column of
 * `GlossaryDefinitionCard` panels beneath the prose so the player can read
 * cost/reward terminology without leaving the screen.
 *
 * Positioning is handled by the caller: `JourneyOptionCircle` renders the card
 * inside an `absolute`-positioned wrapper anchored above or below the circle
 * depending on which side has more room. The card itself is a `motion.div`
 * with a tooltip-style purple gradient panel; the glossary stack sits below
 * it as siblings inside a column-flex container.
 *
 * Glossary panels reuse `GlossaryDefinitionCard` so the visual treatment
 * matches every other glossary surface (rules-text hover, glossary popup).
 * The term extraction runs through the reusable
 * `extractGlossaryTerms` helper so the same logic can power future hover
 * surfaces (dreamsign offers, draft offers, ...).
 *
 * Isolation: imports React + framer-motion, the shared
 * `GlossaryDefinitionCard`, and the reusable glossary-term extractor.
 */

import { motion } from "framer-motion";

import { GlossaryDefinitionCard } from "../../components/GlossaryDefinitionCard";
import { extractGlossaryTerms } from "../../data/glossary-terms";

/** Props for `JourneyHoverCard`. */
export interface JourneyHoverCardProps {
  /** Dream name shown as the popover heading. */
  readonly dreamName: string;
  /** Full rendered option text (cost + reward + flavor). */
  readonly text: string;
}

/**
 * Fade-in popover with dream name heading + option text + glossary-term
 * definition panels.
 *
 * The prose panel and glossary stack live as sibling blocks so the prose
 * panel keeps its fixed width and the definition stack flows beneath it
 * without affecting the prose layout. The stack is visually lighter (smaller
 * font + thinner border via `GlossaryDefinitionCard`) than the journey
 * tooltip so the player's attention stays on the dream prose first.
 */
export function JourneyHoverCard({ dreamName, text }: JourneyHoverCardProps) {
  const terms = extractGlossaryTerms(text);

  return (
    <motion.div
      role="tooltip"
      className="pointer-events-none flex w-64 flex-col gap-2"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18 }}
    >
      <div
        className="rounded-xl px-4 py-3"
        style={{
          background:
            "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
          border: "1px solid rgba(168, 85, 247, 0.4)",
          boxShadow: "0 0 20px rgba(168, 85, 247, 0.25)",
          color: "#e2e8f0",
        }}
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
      </div>
      {terms.length > 0 && (
        <div
          data-testid="journey-hover-glossary-stack"
          className="flex flex-col gap-1"
        >
          {terms.map((entry) => (
            <GlossaryDefinitionCard key={entry.term} entry={entry} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
