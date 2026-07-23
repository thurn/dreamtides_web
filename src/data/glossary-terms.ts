import { lookupGlossaryTerm, type GlossaryEntry } from "./glossary";

/**
 * Reusable utility that scans a string for glossary terms and returns the
 * matched glossary entries.
 *
 * Tokenization rules:
 *   * Words are runs of ASCII letters (`[A-Za-z]+`), optionally led by the
 *     trigger arrow `▸` when it is glued to the word (e.g. `▸Materialized`).
 *     The fast `↯`, interrupt `❖❖`, and exhaust-cost `☪` glyphs are also
 *     glossary tokens. A single activated-ability `❖` is not an interrupt.
 *     Other punctuation, numbers, and symbols split runs apart, so `bane,` and
 *     `bane.` both yield the bare word `bane`. An arrow-prefixed token resolves
 *     to an arrow-specific glossary entry when one exists (`▸Materialized`),
 *     otherwise to the bare keyword (`▸Dawn` → `Dawn`).
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
 * Rules-text forms that can own glossary definitions. Match the double-bolt
 * interrupt before scanning words; a lone `❖` deliberately remains invisible
 * to the glossary.
 */
const GLOSSARY_FORM_RE = /❖❖|↯|☪|▸?[A-Za-z]+/g;

/**
 * Returns the glossary entries referenced in `text`, in first-occurrence
 * order, deduplicated.
 */
export function extractGlossaryTerms(text: string): GlossaryEntry[] {
  if (text.length === 0) {
    return [];
  }
  const seen = new Set<GlossaryEntry>();
  const ordered: GlossaryEntry[] = [];
  for (const match of text.matchAll(GLOSSARY_FORM_RE)) {
    const entry = lookupGlossaryTerm(match[0]);
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
