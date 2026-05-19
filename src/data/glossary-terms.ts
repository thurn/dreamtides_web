import { lookupGlossaryTerm, type GlossaryEntry } from "./glossary";

/**
 * Reusable utility that scans a string for glossary terms and returns the
 * matched glossary entries.
 *
 * Tokenization rules:
 *   * Words are runs of ASCII letters (`[A-Za-z]+`). Punctuation, numbers,
 *     and other symbols split runs apart, so `bane,` and `bane.` both yield
 *     the bare word `bane`.
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

/** Word run; ASCII-letter tokens only. */
const WORD_RE = /[A-Za-z]+/g;

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
  for (const match of text.matchAll(WORD_RE)) {
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
