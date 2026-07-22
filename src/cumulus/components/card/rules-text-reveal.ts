import { extractGlossaryTerms } from "../../../data/glossary-terms";
import type { InfoCardProps } from "../overlay/InfoCard";
import { richText } from "./rich-text";

/**
 * Build the ordered, de-duplicated glossary cards that accompany a semantic
 * rules-text source. GameCard, Dreamcaller, and Dreamsign reveals all use this
 * projection so a stretch of rules copy has one definition-card contract.
 */
export function rulesTextDefinitionCards(
  text: string,
): Readonly<InfoCardProps>[] {
  return extractGlossaryTerms(text).map((entry) => ({
    variant: "text",
    title: entry.term,
    body: richText.rules(entry.definition),
  }));
}
