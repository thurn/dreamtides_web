import type { GlossaryEntry } from "../../../data/glossary";
import { InfoCard } from "../overlay/InfoCard";
import { richText } from "./rich-text";

/**
 * The one keyword-definition tile: a single glossary entry rendered as an
 * {@link InfoCard} (text variant) whose headline is the keyword and whose body
 * is the keyword's rules text. No overline — the reveal beside a keyword is
 * self-evidently a keyword, so it carries the name and the rules text and
 * nothing else.
 *
 * Every surface that reveals what a keyword means renders this one tile, so the
 * definition reads in the same vocabulary as every other reveal (the object
 * card it sits beside, the tide pill, the site disc) — one glass shell, one
 * radius, one type scale:
 *   * `CardTermDefinitions` stacks one per gameplay term in the hover-help
 *     panel beside a card (full cards, compact-row previews, dreamsign and
 *     Dreamcaller ability reveals, and the battle card preview).
 *   * `JourneyHoverCard` lists the terms referenced by a journey tooltip.
 *
 * The tile establishes its own `.cumulus` token scope so it renders correctly on
 * any surface, including popovers portalled outside a Cumulus subtree. The body is
 * `richText.rules` so resource glyphs and keyword emphasis inside a definition
 * render the same inline marks shown in card rules text.
 */
export function GlossaryDefinitionCard({
  entry,
}: {
  entry: GlossaryEntry;
}) {
  return (
    // `.cumulus` re-establishes the design-system token scope so the InfoCard
    // shell's glass, radius, and type tokens resolve wherever this tile is
    // dropped — including a hover popover portalled into `document.body`, which
    // is not under a `.cumulus` ancestor. `data-glossary-term` exposes the keyword
    // for surfaces and tests without reaching into the InfoCard's markup.
    <div className="cumulus" data-glossary-term={entry.term}>
      <InfoCard
        variant="text"
        title={entry.term}
        body={richText.rules(entry.definition)}
      />
    </div>
  );
}
