/**
 * Popover that fades in next to a `JourneyOptionCircle` while the player
 * hovers the option. Shows the dream-name heading, the option's full rendered
 * text, glossary definition panels, and adjacent card previews for specific
 * cards named in quoted journey text.
 *
 * Positioning is handled by the caller: `JourneyOptionCircle` renders the
 * card inside an `absolute`-positioned wrapper anchored above or below the
 * circle depending on which side has more room. The prose/glossary column
 * keeps a fixed readable width, and the referenced-card stack sits beside it
 * at viewports with enough horizontal room.
 *
 * Glossary panels reuse `GlossaryDefinitionCard`, and card previews reuse
 * `CardDisplay`, so both pieces match the app's other inspection surfaces.
 * The term extraction runs through the reusable `extractGlossaryTerms` helper
 * so the same logic can power future hover surfaces (dreamsign offers, draft
 * offers, ...).
 */

import { motion } from "framer-motion";

import { CardDisplay } from "../../components/CardDisplay";
import { GlossaryDefinitionCard } from "../../components/GlossaryDefinitionCard";
import { extractGlossaryTerms } from "../../data/glossary-terms";
import type { CardData } from "../../types/cards";

/** Props for `JourneyHoverCard`. */
export interface JourneyHoverCardProps {
  /** Dream name shown as the popover heading. */
  readonly dreamName: string;
  /** Full rendered option text (cost + reward + flavor). */
  readonly text: string;
  /** Cards named by the option text, in first-reference order. */
  readonly referencedCards?: readonly CardData[];
}

/**
 * Fade-in popover with dream name heading, option text, glossary-term
 * definition panels, and referenced-card previews.
 *
 * The prose panel and glossary stack live in the left column so the prose
 * panel keeps its fixed width and the definition stack flows beneath it
 * without affecting the prose layout. Card previews render as a separate
 * right-side surface where there is horizontal room.
 */
export function JourneyHoverCard({
  dreamName,
  text,
  referencedCards = [],
}: JourneyHoverCardProps) {
  const terms = extractGlossaryTerms(text);

  return (
    <motion.div
      role="tooltip"
      className="pointer-events-none flex max-w-[calc(100vw-1rem)] flex-col items-start gap-3 sm:flex-row"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18 }}
    >
      <div className="flex w-64 shrink-0 flex-col gap-2">
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
      </div>
      {referencedCards.length > 0 && (
        <div
          data-testid="journey-hover-card-preview-stack"
          className="flex max-w-40 shrink-0 flex-col gap-2 rounded-xl p-2"
          style={{
            background:
              "linear-gradient(145deg, rgba(26, 16, 37, 0.98) 0%, rgba(13, 8, 20, 0.98) 100%)",
            border: "1px solid rgba(250, 204, 21, 0.38)",
            boxShadow: "0 0 20px rgba(250, 204, 21, 0.16)",
          }}
        >
          {referencedCards.map((card) => (
            <CardDisplay
              key={card.id}
              card={card}
              className="w-36"
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
