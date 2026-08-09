import {
  GLOSSARY,
  glossaryRulesTextForms,
  lookupGlossaryTerm,
  type GlossaryCatalogEntry,
  type GlossaryProjection,
} from "./glossary";

/** The semantic owner whose rules text is being explained. */
export type RulesTextGlossaryOwner = "card" | "dreamAvatar" | "dreamsign";

/**
 * Reusable utility that scans a string for glossary terms and returns the
 * matched glossary entries.
 *
 * Tokenization rules:
 *   * Words are runs of ASCII letters (`[A-Za-z]+`), optionally led by the
 *     trigger arrow `▸` when it is glued to the word (e.g. `▸Materialized`).
 *     The single-bolt fast marker `❖`, double-bolt interrupt marker `❖❖`, and
 *     exhaust-cost `☾` glyph are also glossary tokens. Other punctuation,
 *     numbers, and symbols split runs apart, so `bane,` and `bane.` both yield
 *     the bare word `bane`. An arrow-prefixed token resolves to an
 *     arrow-specific glossary entry when one exists (`▸Materialized`),
 *     otherwise to the bare keyword (`▸Dawn` → `Dawn`). `▸Night` resolves to
 *     its symbol-only Night definition without treating prose uses of “night”
 *     as the trigger.
 *   * Matching is case-insensitive. The glossary's variant list also covers
 *     simple plural / past-tense forms (e.g. `banes`, `transfigured`), so
 *     prose like "Nightmares are banes" matches the `Bane` entry.
 *
 * Output rules:
 *   * Each entry appears at most once in the returned array — duplicates are
 *     deduplicated by glossary entry identity so repeated mentions of Nightmare's
 *     `Bane` keyword collapse to one panel.
 *   * Entries retain their first-occurrence order in `text`.
 *   * Empty input or input with no recognized terms returns an empty array.
 *
 * Consumers use the returned entries to build glossary Info Cards in reading
 * order. Other surfaces that show free-form prose with glossary references
 * (dreamsign offers, card draft offers, future tooltip pop-ups) can use this
 * same helper instead of re-implementing extraction.
 */

/**
 * Non-word rules-text forms come from glossary.toml. Sorting longest-first
 * keeps overlapping forms such as the double-bolt interrupt ahead of the
 * single-bolt fast marker.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const SPECIAL_RULES_TEXT_FORMS = GLOSSARY.flatMap((entry) =>
  glossaryRulesTextForms(entry),
)
  .filter((form) => !/^▸?[A-Za-z]+$/u.test(form))
  .sort((left, right) => right.length - left.length);

const GLOSSARY_FORM_RE = new RegExp(
  [...SPECIAL_RULES_TEXT_FORMS.map(escapeRegExp), "▸?[A-Za-z]+"].join("|"),
  "gu",
);

function projectionMatches(
  projection: GlossaryProjection,
  text: string,
  owner: RulesTextGlossaryOwner,
): readonly string[] | undefined {
  if (projection.owner !== undefined && projection.owner !== owner) {
    return undefined;
  }
  if (projection.pattern === undefined) {
    return [""];
  }
  return new RegExp(projection.pattern, "iu").exec(text) ?? undefined;
}

function renderProjectionTemplate(
  template: string,
  entry: GlossaryCatalogEntry,
  match: readonly string[],
): string {
  return template.replace(/\{(term|\d+)\}/gu, (_, key: string) => {
    if (key === "term") return entry.term;
    return match[Number.parseInt(key, 10)] ?? "";
  });
}

/**
 * Adapt one canonical glossary entry to the sentence that references it.
 *
 * Canonical glossary data remains the fallback for standalone glossary cards.
 * Rules-text reveals use this projection so numeric actions and granted
 * abilities explain the exact instance the player is reading.
 */
export function projectGlossaryEntry(
  entry: GlossaryCatalogEntry,
  text: string,
  owner: RulesTextGlossaryOwner = "card",
): GlossaryCatalogEntry {
  for (const projection of entry.projections ?? []) {
    const match = projectionMatches(projection, text, owner);
    if (match === undefined) continue;
    return {
      ...entry,
      term:
        projection.term === undefined
          ? entry.term
          : renderProjectionTemplate(projection.term, entry, match),
      definition:
        projection.definition === undefined
          ? entry.definition
          : renderProjectionTemplate(projection.definition, entry, match),
    };
  }
  return entry;
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

/**
 * Returns the glossary entries referenced in `text`, projected into the
 * sentence and semantic owner used by a rendered definition card.
 */
export function extractProjectedGlossaryTerms(
  text: string,
  owner: RulesTextGlossaryOwner = "card",
): GlossaryCatalogEntry[] {
  return extractGlossaryTerms(text).map((entry) =>
    projectGlossaryEntry(entry, text, owner),
  );
}
