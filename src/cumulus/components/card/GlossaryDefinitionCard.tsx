import {
  glossaryEntryDisplayTitle,
  type GlossaryEntry,
} from "../../../data/glossary";
import { InfoCard } from "../overlay/InfoCard";
import { richText } from "./rich-text";

/**
 * The one keyword-definition tile: a single glossary entry rendered as an
 * {@link InfoCard} (text variant) whose body is the keyword's rules text.
 * Entries carry their canonical headline by default; definition-only entries
 * present their complete explanatory sentence without a headline.
 *
 * The signature-deck inspector uses this renderable tile in normal document
 * flow.
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
        title={glossaryEntryDisplayTitle(entry)}
        body={richText.rules(entry.definition)}
      />
    </div>
  );
}
