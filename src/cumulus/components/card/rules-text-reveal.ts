import {
  GLOSSARY_IDS,
  type GlossaryCatalogEntry,
} from "../../../data/glossary";
import {
  extractContextualGlossaryTerms,
  type RulesTextGlossaryOwner,
} from "../../../data/glossary-terms";
import type { InfoCardProps, InfoCardTextProps } from "../overlay/InfoCard";
import { richText, type RichTextDefinitionSymbol } from "./rich-text";

const DEFINITION_SYMBOL_BY_ID: Readonly<
  Partial<Record<string, RichTextDefinitionSymbol>>
> = {
  [GLOSSARY_IDS.fast]: "fast",
  [GLOSSARY_IDS.interrupt]: "interrupt",
  [GLOSSARY_IDS.exhaustCost]: "exhaust",
  [GLOSSARY_IDS.nightTrigger]: "trigger",
};

/**
 * Build the compact glossary card shared by semantic rules-text sources. Each
 * definition remains a distinct reading-order row, but the rows share one
 * InfoCard shell so rules copy with several terms stays coherent and compact.
 * The glossary body is monochrome so definitions read as one reference block
 * without competing with the source card's semantic rules-text colors.
 */
export function glossaryDefinitionsCardModel(
  entries: readonly GlossaryCatalogEntry[],
): InfoCardTextProps | null {
  if (entries.length === 0) {
    return null;
  }
  return {
    variant: "text",
    body: richText.definitions(
      entries.map((entry) => ({
        term: entry.term,
        definition: entry.definition,
        symbol: DEFINITION_SYMBOL_BY_ID[entry.id],
        termPresentation:
          entry.id === GLOSSARY_IDS.exhaustCost ? "symbolOnly" : undefined,
      })),
    ),
  };
}

/**
 * Build the secondary-card projection expected by the reveal coordinator.
 * GameCard, Dreamcaller, and Dreamsign reveals all use this path, so every
 * rules-text owner presents its definitions in one shared glossary card.
 */
export function rulesTextDefinitionCards(
  text: string,
  owner: RulesTextGlossaryOwner = "card",
): Readonly<InfoCardProps>[] {
  const card = glossaryDefinitionsCardModel(
    extractContextualGlossaryTerms(text, owner),
  );
  return card === null ? [] : [card];
}
