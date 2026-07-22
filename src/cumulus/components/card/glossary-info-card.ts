import { requireGlossaryEntry } from "../../../data/glossary";
import type { Glyph } from "../../primitives/glyph";
import type { Tide } from "../hud/tide-spec";
import type { InfoCardProps } from "../overlay/InfoCard";
import { richText } from "./rich-text";

type GlossaryCardPresentation =
  | { readonly variant?: "text" }
  | { readonly variant: "icon"; readonly glyph: Glyph }
  | { readonly variant: "tide"; readonly tide: Tide };

/** Build a strict Info Card from one stable TOML glossary id. */
export function glossaryInfoCard(
  id: string,
  presentation: GlossaryCardPresentation = { variant: "text" },
): InfoCardProps {
  const entry = requireGlossaryEntry(id);
  const body = entry.matchesRulesText
    ? richText.rules(entry.definition)
    : richText.plain(entry.definition);
  if (presentation.variant === "icon") {
    return {
      variant: "icon",
      glyph: presentation.glyph,
      title: entry.term,
      body,
    };
  }
  if (presentation.variant === "tide") {
    return {
      variant: "tide",
      tide: presentation.tide,
      title: entry.term,
      body,
    };
  }
  return { variant: "text", title: entry.term, body };
}
