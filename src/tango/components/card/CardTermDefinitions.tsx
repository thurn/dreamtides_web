import { extractGlossaryTerms } from "../../../data/glossary-terms";
import { InfoCard } from "../overlay/InfoCard";
import { richText } from "./rich-text";
import { token } from "../../primitives/tokens";

/**
 * Vertical stack of glossary definitions for every gameplay term that appears in
 * a stretch of rules text, in reading order with duplicates collapsed. Each term
 * renders as its own {@link InfoCard} tile, so the definitions read in the same
 * vocabulary as every other reveal (the object card they sit beside, the tide
 * pill, the site disc) — one shell, one radius, one type scale.
 *
 * Rendered beside or beneath a card / dreamsign / ability so the player can read
 * what every highlighted keyword means without inline tooltips. Shared by the
 * card hover-help panel (`useCardTermPopover` → `CardView`/`GameCard`), the
 * dreamsign reveal (`DreamsignInfoCard`), and the Dreamcaller ability reveal.
 *
 * Returns `null` when the text references no glossary terms, so callers place it
 * unconditionally and it renders nothing for plain text.
 */
export function CardTermDefinitions({
  text,
  testId,
  side,
}: {
  /** The rules text to scan for glossary terms. */
  text: string;
  /** Optional test id for the stack container. */
  testId?: string;
  /** Which side of the card the panel sits on, exposed for layout/tests. */
  side?: "left" | "right";
}) {
  const terms = extractGlossaryTerms(text);
  if (terms.length === 0) {
    return null;
  }
  return (
    <div
      data-testid={testId}
      data-definition-side={side}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: token("--space-3"),
        // Box measures (content-driven layout): cap height and scroll a long
        // list, matching the prior panel behavior.
        maxHeight: "min(70vh, 360px)",
        overflowY: "auto",
      }}
    >
      {terms.map((entry) => (
        <InfoCard
          key={entry.term}
          variant="text"
          meta="Keyword"
          title={entry.term}
          // `rules` so resource glyphs / keyword emphasis inside a definition
          // render the same marks shown in card rules text.
          body={richText.rules(entry.definition)}
        />
      ))}
    </div>
  );
}
