import type { GlossaryEntry } from "../../../data/glossary";
import { extractGlossaryTerms } from "../../../data/glossary-terms";
import type {
  InfoCardProps,
  InfoCardTextProps,
} from "../overlay/InfoCard";
import { richText } from "./rich-text";

/**
 * Build the compact glossary card shared by semantic rules-text sources. Each
 * definition remains a distinct reading-order row, but the rows share one
 * InfoCard shell so rules copy with several terms stays coherent and compact.
 * The glossary body is monochrome so definitions read as one reference block
 * without competing with the source card's semantic rules-text colors.
 */
export function glossaryDefinitionsCardModel(
  entries: readonly GlossaryEntry[],
): InfoCardTextProps | null {
  if (entries.length === 0) {
    return null;
  }
  return {
    variant: "text",
    body: richText.definitions(entries),
  };
}

/**
 * Build the secondary-card projection expected by the reveal coordinator.
 * GameCard, Dreamcaller, and Dreamsign reveals all use this path, so every
 * rules-text owner presents its definitions in one shared glossary card.
 */
export function rulesTextDefinitionCards(
  text: string,
): Readonly<InfoCardProps>[] {
  const card = glossaryDefinitionsCardModel(extractGlossaryTerms(text));
  return card === null ? [] : [card];
}
