import {
  glossaryEntry,
  GLOSSARY_IDS,
  lookupGlossaryTerm,
  type GlossaryCatalogEntry,
} from "./glossary";

/**
 * Reusable utility that scans a string for glossary terms and returns the
 * matched glossary entries.
 *
 * Tokenization rules:
 *   * Words are runs of ASCII letters (`[A-Za-z]+`), optionally led by the
 *     trigger arrow `▸` when it is glued to the word (e.g. `▸Materialized`).
 *     The single-bolt fast marker `❖`, double-bolt interrupt marker `❖❖`, and
 *     exhaust-cost `☪` glyph are also glossary tokens. Other punctuation,
 *     numbers, and symbols split runs apart, so `bane,` and `bane.` both yield
 *     the bare word `bane`. An arrow-prefixed token resolves to an
 *     arrow-specific glossary entry when one exists (`▸Materialized`),
 *     otherwise to the bare keyword (`▸Dawn` → `Dawn`). `▸Night` resolves to
 *     its symbol-only Night definition without treating prose uses of “night”
 *     as the trigger.
 *   * Matching is case-insensitive. The glossary's variant list also covers
 *     simple plural / past-tense forms (e.g. `banes`, `transfigured`), so
 *     casual prose like "transfigure your banes" matches the `Transfigure`
 *     and `Bane` entries.
 *
 * Output rules:
 *   * Each entry appears at most once in the returned array — duplicates are
 *     deduplicated by glossary entry identity so two mentions of `bane` and
 *     `banes` collapse to one panel.
 *   * The order matches first-occurrence order in `text`, which lets the
 *     UI render definition panels in reading order.
 *   * Empty input or input with no recognized terms returns an empty array.
 *
 * Consumers: the journey hover stack auto-renders one
 * `GlossaryDefinitionCard` per returned entry beneath the journey tooltip.
 * Other surfaces that show free-form prose with glossary references
 * (dreamsign offers, card draft offers, future tooltip pop-ups) can use
 * this same helper instead of re-implementing extraction.
 */

/**
 * Rules-text forms that can own glossary definitions. The double-bolt
 * interrupt must match before the single-bolt fast marker.
 */
const GLOSSARY_FORM_RE = /❖❖|❖|☪|▸?[A-Za-z]+/g;

const SYMBOL_ENTRY_IDS: Readonly<Record<string, string>> = {
  "❖": GLOSSARY_IDS.fast,
  "❖❖": GLOSSARY_IDS.interrupt,
  "☪": GLOSSARY_IDS.exhaustCost,
  "▸night": GLOSSARY_IDS.nightTrigger,
};

function entryForForm(form: string): GlossaryCatalogEntry | undefined {
  const symbolEntryId = SYMBOL_ENTRY_IDS[form.toLocaleLowerCase()];
  if (symbolEntryId !== undefined) {
    return glossaryEntry(symbolEntryId);
  }
  return lookupGlossaryTerm(form);
}

/**
 * Returns the glossary entries referenced in `text`, in first-occurrence
 * order, deduplicated.
 */
export function extractGlossaryTerms(text: string): GlossaryCatalogEntry[] {
  if (text.length === 0) {
    return [];
  }
  const seen = new Set<GlossaryCatalogEntry>();
  const ordered: GlossaryCatalogEntry[] = [];
  for (const match of text.matchAll(GLOSSARY_FORM_RE)) {
    const entry = entryForForm(match[0]);
    if (entry === undefined) {
      continue;
    }
    if (seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    ordered.push(entry);
  }
  return ordered;
}
