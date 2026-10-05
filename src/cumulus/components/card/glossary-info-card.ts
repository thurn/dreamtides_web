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
import type { GlossaryEntryId } from "../../../types/identifiers";

type GlossaryCardPresentation =
  | { readonly variant?: "text" }
  | { readonly variant: "icon"; readonly glyph: Glyph }
  | { readonly variant: "tide"; readonly tide: Tide };

/** Build a strict Info Card from one stable Glossary UUID. */
export function glossaryInfoCard(
  id: GlossaryEntryId,
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
      ? undefined
      : glossaryDefinitionUsesRulesText(entry)
        ? richText.rules(entry.definition)
        : richText.plain(entry.definition);
  const titleText =
    entry === undefined ? undefined : glossaryEntryDisplayTitle(entry);
  const baseTitle = titleText === undefined ? undefined : titleText;
  const title: string | undefined =
    baseTitle === undefined || entry?.definitionSymbol === undefined
      ? baseTitle
      : `${richTextDefinitionSymbolText(entry.definitionSymbol)} ${baseTitle}`;
  if (presentation.variant === "icon") {
    return {
      variant: "icon",
      glyph: presentation.glyph,
      ...(entry === undefined
        ? {
            title: "Rule definition unavailable",
            body: richText.plain(
              "This rule's definition is temporarily unavailable.",
            ),
          }
        : { title, body }),
    };
  }
  if (presentation.variant === "tide") {
    return {
      variant: "tide",
      tide: presentation.tide,
      ...(entry === undefined
        ? {
            title: "Rule definition unavailable",
            body: richText.plain(
              "This rule's definition is temporarily unavailable.",
            ),
          }
        : { title, body }),
    };
  }
  return {
    variant: "text",
    ...(entry === undefined
      ? {
          title: "Rule definition unavailable",
          body: richText.plain(
            "This rule's definition is temporarily unavailable.",
          ),
        }
      : { title, body }),
  };
}
