import { extractGlossaryTerms } from "../../../data/glossary-terms";
import { GlossaryDefinitionCard } from "./GlossaryDefinitionCard";

/**
 * Vertical stack of glossary definition tiles for every gameplay term that
 * appears in a stretch of rules text, in reading order with duplicates
 * collapsed.
 *
 * Rendered immediately beside a card so the player can read what every term
 * means without the card text itself carrying inline tooltips. Shared by the
 * full-card hover help (`CardView`), the compact-row card preview
 * (`CardHoverPreview`), and the battle card preview
 * (`BattleCardHoverPreview`) so all three present an identical panel.
 *
 * Returns `null` when the text references no glossary terms, so callers can
 * place it unconditionally and it renders nothing for plain cards.
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
      className="flex max-h-[min(70vh,360px)] w-56 flex-col gap-1 overflow-y-auto"
    >
      {terms.map((entry) => (
        <GlossaryDefinitionCard key={entry.term} entry={entry} />
      ))}
    </div>
  );
}
