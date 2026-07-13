import { extractGlossaryTerms } from "../../../data/glossary-terms";
import { GlossaryDefinitionCard } from "./GlossaryDefinitionCard";
import { token } from "../../primitives/tokens";

/**
 * Vertical stack of glossary definitions for every gameplay term that appears in
 * a stretch of rules text, in reading order with duplicates collapsed. Each term
 * renders as a {@link GlossaryDefinitionCard} — the one keyword-definition tile,
 * an {@link InfoCard} carrying the keyword name and its rules text — so the
 * definitions read in the same vocabulary as every other reveal (the object card
 * they sit beside, the tide pill, the site disc): one shell, one radius, one
 * type scale.
 *
 * Rendered beside a card / dreamsign / ability so the player can read what
 * every highlighted keyword means without inline tooltips. Shared by the card
 * shared entity reveal coordinator, the dreamsign
 * reveal (`DreamsignInfoCard`), and the Dreamcaller ability reveal.
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
    // `.cumulus` so the container's own `--space-*` gap token resolves even when
    // this stack is portalled outside a Cumulus subtree (e.g. the card hover-help
    // popover into `document.body`). Each `GlossaryDefinitionCard` re-scopes its
    // own tokens too, so the tiles render correctly regardless.
    <div
      className="cumulus"
      data-testid={testId}
      data-definition-side={side}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: token("--space-3"),
        // Keep the stack itself visually inert. Each definition owns its glass
        // shell; the wrapper must not create a scroll track or clipped backdrop
        // behind multiple keyword cards.
        overflow: "visible",
      }}
    >
      {terms.map((entry) => (
        <GlossaryDefinitionCard key={entry.term} entry={entry} />
      ))}
    </div>
  );
}
