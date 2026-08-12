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
import { tx } from "@trox/runtime";

type GlossaryCardPresentation =
  | { readonly variant?: "text" }
  | { readonly variant: "icon"; readonly glyph: Glyph }
  | { readonly variant: "tide"; readonly tide: Tide };

/** Build a strict Info Card from one stable Glossary UUID. */
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
      ? undefined
      : glossaryDefinitionUsesRulesText(entry)
        ? richText.rules(entry.definition)
        : richText.plain(entry.definition);
  const titleText =
    entry === undefined ? undefined : glossaryEntryDisplayTitle(entry);
  const title =
    titleText === undefined || entry?.definitionSymbol === undefined
      ? titleText
      : `${richTextDefinitionSymbolText(entry.definitionSymbol)} ${titleText}`;
  if (presentation.variant === "icon") {
    return {
      variant: "icon",
      glyph: presentation.glyph,
      ...(entry === undefined
        ? {
            titleMessage: tx(
              "Rule definition unavailable",
              "Missing glossary copy shown in the player reveal card when a requested authored glossary entry cannot be resolved. This visible fallback contains no variables and must not expose the glossary id.",
            ),
            bodyMessage: tx(
              "This rule's definition is temporarily unavailable.",
              "Player-facing message for the glossary definition unavailable body interface state.",
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
            titleMessage: tx(
              "Rule definition unavailable",
              "Missing glossary copy shown in the player reveal card when a requested authored glossary entry cannot be resolved. This visible fallback contains no variables and must not expose the glossary id.",
            ),
            bodyMessage: tx(
              "This rule's definition is temporarily unavailable.",
              "Player-facing message for the glossary definition unavailable body interface state.",
            ),
          }
        : { title, body }),
    };
  }
  return {
    variant: "text",
    ...(entry === undefined
      ? {
          titleMessage: tx(
            "Rule definition unavailable",
            "Missing glossary copy shown in the player reveal card when a requested authored glossary entry cannot be resolved. This visible fallback contains no variables and must not expose the glossary id.",
          ),
          bodyMessage: tx(
            "This rule's definition is temporarily unavailable.",
            "Player-facing message for the glossary definition unavailable body interface state.",
          ),
        }
      : { title, body }),
  };
}
