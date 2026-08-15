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
import { opaque, tx, txa, type LocalizedString } from "@trox/runtime";
import { localizedSourceText } from "../../../runtime/localization/runtime";
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
        ? richText.rules(localizedSourceText(entry.definition))
        : richText.plain(localizedSourceText(entry.definition));
  const titleText =
    entry === undefined ? undefined : glossaryEntryDisplayTitle(entry);
  const baseTitle =
    titleText === undefined ? undefined : localizedSourceText(titleText);
  const title: LocalizedString | undefined =
    baseTitle === undefined || entry?.definitionSymbol === undefined
      ? baseTitle
      : txa(
          "{definition_symbol} {definition_title}",
          {
            definition_symbol: richTextDefinitionSymbolText(
              entry.definitionSymbol,
            ),
            definition_title: opaque(baseTitle),
          },
          "[ui] Glossary reveal title prefixed by its canonical rules symbol. definition_symbol is an untranslated single glyph or compact glyph sequence; definition_title is the complete localized glossary title.",
        );
  if (presentation.variant === "icon") {
    return {
      variant: "icon",
      glyph: presentation.glyph,
      ...(entry === undefined
        ? {
            title: tx(
              "Rule definition unavailable",
              "[ui] Missing glossary copy shown in the player reveal card when a requested authored glossary entry cannot be resolved. This visible fallback contains no variables and must not expose the glossary id.",
            ),
            body: richText.plain(
              tx(
                "This rule's definition is temporarily unavailable.",
                "[ui] Glossary definition unavailable body.",
              ),
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
            title: tx(
              "Rule definition unavailable",
              "[ui] Missing glossary copy shown in the player reveal card when a requested authored glossary entry cannot be resolved. This visible fallback contains no variables and must not expose the glossary id.",
            ),
            body: richText.plain(
              tx(
                "This rule's definition is temporarily unavailable.",
                "[ui] Glossary definition unavailable body.",
              ),
            ),
          }
        : { title, body }),
    };
  }
  return {
    variant: "text",
    ...(entry === undefined
      ? {
          title: tx(
            "Rule definition unavailable",
            "[ui] Missing glossary copy shown in the player reveal card when a requested authored glossary entry cannot be resolved. This visible fallback contains no variables and must not expose the glossary id.",
          ),
          body: richText.plain(
            tx(
              "This rule's definition is temporarily unavailable.",
              "[ui] Glossary definition unavailable body.",
            ),
          ),
        }
      : { title, body }),
  };
}
