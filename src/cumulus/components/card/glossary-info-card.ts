import {
  glossaryDefinitionUsesRulesText,
  glossaryEntryDisplayTitle,
  glossaryEntry,
} from "../../../data/glossary";
import { logEventOnce } from "../../../logging";
import type { Glyph } from "../../primitives/glyph";
import type { Tide } from "../hud/tide-spec";
import type { InfoCardProps } from "../overlay/InfoCard";
import { richText, richTextDefinitionSymbolText } from "./rich-text";

type GlossaryCardPresentation =
  | { readonly variant?: "text" }
  | { readonly variant: "icon"; readonly glyph: Glyph }
  | { readonly variant: "tide"; readonly tide: Tide };

/** Build a strict Info Card from one stable TOML glossary id. */
export function glossaryInfoCard(
  id: string,
  presentation: GlossaryCardPresentation = { variant: "text" },
): InfoCardProps {
  const entry = glossaryEntry(id);
  if (entry === undefined) {
    logEventOnce(`missing-glossary-entry:${id}`, "glossary_entry_missing", {
      glossaryId: id,
    });
  }
  const body =
    entry === undefined
      ? richText.plain("This rule's definition is temporarily unavailable.")
      : glossaryDefinitionUsesRulesText(entry)
        ? richText.rules(entry.definition)
        : richText.plain(entry.definition);
  const titleText =
    entry === undefined
      ? "Rule definition unavailable"
      : glossaryEntryDisplayTitle(entry);
  const title =
    titleText === undefined || entry?.definitionSymbol === undefined
      ? titleText
      : `${richTextDefinitionSymbolText(entry.definitionSymbol)} ${titleText}`;
  if (presentation.variant === "icon") {
    return {
      variant: "icon",
      glyph: presentation.glyph,
      title,
      body,
    };
  }
  if (presentation.variant === "tide") {
    return {
      variant: "tide",
      tide: presentation.tide,
      title,
      body,
    };
  }
  return {
    variant: "text",
    title,
    body,
  };
}
