import type { GlossaryCatalogEntry } from "../../../data/glossary";
import {
  extractContextualGlossaryTerms,
  type RulesTextGlossaryOwner,
} from "../../../data/glossary-terms";
import type { InfoCardProps, InfoCardTextProps } from "../overlay/InfoCard";

/**
 * Build the compact glossary card shared by semantic rules-text sources. Each
 * definition remains a distinct reading-order row, but the rows share one
 * InfoCard shell so rules copy with several terms stays coherent and compact.
 * The glossary body is monochrome so definitions read as one reference block
 * without competing with the source card's semantic rules-text colors.
 */
export function glossaryDefinitionsCardModel(
  entries: readonly GlossaryCatalogEntry[],
  excludedIds: readonly string[] = [],
): InfoCardTextProps | null {
  const excluded = new Set(excludedIds);
  const visibleEntries = entries.filter((entry) => !excluded.has(entry.id));
  if (visibleEntries.length === 0) {
    return null;
  }
  return {
    variant: "text",
    body: {
      kind: "definitions",
      entries: visibleEntries.map((entry) => ({
        term: entry.term,
        definition: entry.definition,
        symbol: entry.definitionSymbol,
        termPresentation: entry.termPresentation,
      })),
    },
  };
}

/**
 * Build the secondary-card projection expected by the reveal coordinator.
 * GameCard, DreamAvatar, and Dreamsign reveals all use this path, so every
 * rules-text owner presents its definitions in one shared glossary card.
 */
export function rulesTextDefinitionCards(
  text: string,
  owner: RulesTextGlossaryOwner = "card",
  excludedIds: readonly string[] = [],
): Readonly<InfoCardProps>[] {
  const card = glossaryDefinitionsCardModel(
    extractContextualGlossaryTerms(text, owner),
    excludedIds,
  );
  return card === null ? [] : [card];
}
