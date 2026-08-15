import {
  extractProjectedGlossaryTerms,
  type ProjectedGlossaryCatalogEntry,
  type RulesTextGlossaryOwner,
} from "../../../data/glossary-terms";
import type { InfoCardProps, InfoCardTextProps } from "../overlay/InfoCard";
import type { LocalizedString } from "@trox/runtime";
import type { GlossaryEntryId } from "../../../types/identifiers";
import {
  localizedSourceText,
  resolveSource,
} from "../../../runtime/localization/runtime";

/**
 * Build the compact glossary card shared by semantic rules-text sources. Each
 * definition remains a distinct reading-order row, but the rows share one
 * InfoCard shell so rules copy with several terms stays coherent and compact.
 * The glossary body is monochrome so definitions read as one reference block
 * without competing with the source card's semantic rules-text colors.
 */
export function glossaryDefinitionsCardModel(
  entries: readonly (
    | ProjectedGlossaryCatalogEntry
    | import("../../../data/glossary").GlossaryCatalogEntry
  )[],
  excludedIds: readonly GlossaryEntryId[] = [],
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
        term:
          "localizedTerm" in entry
            ? entry.localizedTerm
            : localizedSourceText(entry.term),
        definition:
          "localizedDefinition" in entry
            ? entry.localizedDefinition
            : localizedSourceText(entry.definition),
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
  text: LocalizedString,
  owner: RulesTextGlossaryOwner = "card",
  excludedIds: readonly GlossaryEntryId[] = [],
): Readonly<InfoCardProps>[] {
  const card = glossaryDefinitionsCardModel(
    extractProjectedGlossaryTerms(resolveSource(text), owner),
    excludedIds,
  );
  return card === null ? [] : [card];
}
