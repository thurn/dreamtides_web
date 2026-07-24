import { extractContextualGlossaryTerms } from "../../../data/glossary-terms";
import { InfoCard } from "../overlay/InfoCard";
import { glossaryDefinitionsCardModel } from "./rules-text-reveal";

/**
 * One compact glossary card for every gameplay term that appears in a stretch of
 * rules text, in glossary-priority order with duplicates collapsed. Each term
 * keeps its own definition row inside a shared {@link InfoCard}, avoiding repeated shell,
 * title, and padding space when several terms appear together.
 *
 * The catalog marks this stack as incubating. Named card, Dreamsign, and
 * Dreamcaller surfaces currently carry glossary definitions in their shared
 * reveal specifications; this component is the equivalent normal-flow surface
 * for definitions placed beside or beneath rules text.
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
  const terms = extractContextualGlossaryTerms(text);
  const card = glossaryDefinitionsCardModel(terms);
  if (card === null) {
    return null;
  }
  return (
    // `.cumulus` so the container's own `--space-*` gap token resolves even when
    // this stack is portalled outside a Cumulus subtree (e.g. the card hover-help
    // popover into `document.body`). Each `GlossaryDefinitionCard` re-scopes its
    // own tokens too, so the tiles render correctly regardless.
    <div
      className="cumulus"
      data-testid={testId}
      data-definition-side={side}
      data-definition-count={terms.length}
      style={{
        // Keep the wrapper visually inert so the shared InfoCard remains the
        // only surface and its backdrop is never clipped.
        overflow: "visible",
      }}
    >
      <InfoCard
        variant="text"
        title={card.title}
        body={card.body}
      />
    </div>
  );
}
