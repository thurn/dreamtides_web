import type { CardData } from "../../../types/cards";
import {
  lookupGlossaryTerm,
  type GlossaryCatalogEntry,
} from "../../../data/glossary";

/** Symbol types recognized in card rules text. */
export type SymbolType =
  "energy" | "spark" | "trigger" | "points" | "lunar" | "store";

/**
 * A parsed segment of rules text.
 *
 * - `text` is a plain string run.
 * - `symbol` is a recognized glyph rendered with its own styling. Most are
 *   swapped for an icon-font mark by the renderer: energy → flame, spark →
 *   sparkle, points `⍟` → star-circle, lunar `☪` → moon, and store `⧗` →
 *   brain. The trigger `▸` remains a Unicode text character.
 * - `nobreak` groups inner segments that must render on the same line. The
 *   renderer wraps them in a `white-space: nowrap` span. A post-tokenization
 *   pass (`bindIconsToText`) wraps every inline icon together with the text it
 *   reads with so an icon never wraps to a line by itself.
 * - `term` is a glossary-recognized word that should render with a hover
 *   popover showing its definition. Carries the matched word as written
 *   (with its original capitalization and trailing punctuation) plus the
 *   resolved glossary entry.
 * - `sparkPip` represents the spark glyph followed immediately by an integer
 *   (e.g. `⍏2`). The renderer draws this as a circled-number `PipBadge` so
 *   inline references match the spark stat badge on character cards.
 * - `bolt` represents the fast marker `❖` (and the interrupt marker `❖❖`).
 *   The renderer draws `count` filled lightning bolts, the same mark shown
 *   before the card name in the title bar — one bolt for fast, two
 *   almost-touching bolts for an interrupt.
 * - `essence` represents the essence currency. `amount` carries the number
 *   written in front of it (`"50"` for `50 essence`) or is `null` for a bare
 *   reference (`the essence you gain`). The renderer draws the amount glued
 *   directly to the crypto glyph; the word "essence" itself is dropped.
 * - `siteName` is the name of a journey site (`draft`, `shop`, `dream journey`,
 *   …) written immediately before the word "site"/"sites". The renderer tints
 *   it so the site reads at a glance; the trailing "site"/"sites" stays plain.
 */
export type TextSegment =
  | { kind: "text"; value: string }
  | {
      kind: "symbol";
      symbol: SymbolType;
      char: string;
      /** Optional glossary entry owned by this authored symbol. */
      entry?: GlossaryCatalogEntry;
    }
  | { kind: "nobreak"; segments: TextSegment[] }
  | { kind: "term"; word: string; entry: GlossaryCatalogEntry }
  | { kind: "sparkPip"; value: string }
  | { kind: "bolt"; count: number }
  | { kind: "essence"; amount: string | null }
  | { kind: "siteName"; value: string };

/** Maps special Unicode characters to their symbol type. */
const SYMBOL_MAP: Readonly<Record<string, SymbolType>> = {
  "●": "energy",
  // Both the APL `⍏` (used by the inline `⍏N` pip form) and the four-point
  // star `✦` (the inline resource glyph authored in card text, e.g. `+1✦`)
  // are the spark symbol; the renderer draws either as the sparkle mark.
  "⍏": "spark",
  "✦": "spark",
  "▸": "trigger",
  // Points scored toward winning (rendered as the filled star-circle).
  "⍟": "points",
  // The lunar activation cost (rendered as the filled moon).
  "☪": "lunar",
  // Memories stored on cards (rendered as the filled brain).
  "⧗": "store",
};

const TRIGGER_CHAR = "▸";
const SPARK_CHAR = "⍏";

/**
 * Ability timing marker. A single `❖` identifies a fast ability; two `❖❖`
 * identify an interrupt. The renderer collapses a run of these into a single
 * `bolt` segment carrying the count so it can draw one or two filled lightning
 * bolts (the same mark the title bar shows before the card name).
 */
const ACTIVATED_CHAR = "❖";

/**
 * Matches the spark glyph followed immediately by one or more digits, e.g.
 * `⍏2`, `⍏10`. The renderer collapses this to a single circled-number pip
 * badge so inline references read as the same visual unit as the spark
 * stat badge on character cards.
 */
const SPARK_PIP_RE = /^⍏(\d+)/;

/**
 * Matches a trigger group at the start of a string: the `▸` arrow, optional
 * legacy horizontal whitespace, a capitalized word, and an optional trailing
 * `:` or `,` (the common separators after `Judgment`, `Materialized`,
 * `Dissolved`, `Banished`, etc.). The renderer drops that legacy whitespace so
 * every trigger reads in the compact `▸Dawn:` form and keeps the group on one
 * line.
 */
const TRIGGER_GROUP_RE = /^▸[ \t]*([A-Z][A-Za-z]*)([:,])?/;

/**
 * Matches the next "word" at position 0 of the slice — a run of ASCII
 * letters. Consumed lazily; the loop only consults this when looking for a
 * glossary term.
 */
const WORD_RE = /^[A-Za-z]+/;

/**
 * Matches the essence currency in three forms, in priority order:
 *   1. `<number> essence` (`50 essence`) — the amount is captured in group 1.
 *   2. `essence site` / `essence sites` — the journey site type, NOT the
 *      currency. Matched only so it is *skipped* and left as ordinary words.
 *   3. a bare `essence` reference (`the essence you gain`).
 * Case-insensitive so `Essence` matches too.
 */
const ESSENCE_RE = /(\d+)\s+essence\b|\bessence\s+sites?\b|\bessence\b/gi;

/**
 * Splits text into plain-text runs and `essence` segments. A `<number> essence`
 * run becomes an essence segment carrying the amount; a bare `essence` becomes
 * an essence segment with no amount; `essence site(s)` is left untouched inside
 * the surrounding text because it names a journey site type rather than the
 * currency.
 */
function splitEssence(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(ESSENCE_RE)) {
    const index = match.index ?? 0;
    // The site form ("Essence site(s)") carries no captured amount and includes
    // the word "site"; leave it in the surrounding prose unchanged.
    if (match[1] === undefined && /site/i.test(match[0])) {
      continue;
    }
    if (index > last) {
      out.push({ kind: "text", value: text.slice(last, index) });
    }
    out.push({ kind: "essence", amount: match[1] ?? null });
    last = index + match[0].length;
  }
  if (last < text.length) {
    out.push({ kind: "text", value: text.slice(last) });
  }
  return out;
}

/**
 * Journey site names that are tinted when they appear directly before the word
 * "site"/"sites". Multi-word names are listed before any shorter name they
 * share a first word with so the regex prefers the longer match. Battle is
 * intentionally excluded. The trailing "site"/"sites" is matched by a lookahead
 * so only the name is captured and the word "site" itself stays plain.
 */
const SITE_NAME_RE =
  /\b(?:specialty shop|dreamsign offering|dreamsign draft|dream journey|dream bazaar|shop|draft|essence|transfiguration|duplication|reward|purge|cleanse|rest)(?=\s+sites?\b)/gi;

/**
 * Splits text into plain-text runs and `siteName` segments, tinting the name of
 * a journey site written in front of "site"/"sites". The "site"/"sites" word
 * itself is left in the surrounding text.
 */
function splitSiteNames(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(SITE_NAME_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      out.push({ kind: "text", value: text.slice(last, index) });
    }
    out.push({ kind: "siteName", value: match[0] });
    last = index + match[0].length;
  }
  if (last < text.length) {
    out.push({ kind: "text", value: text.slice(last) });
  }
  return out;
}

/**
 * Splits the contents of a `nobreak` keyword text fragment (e.g. ` Judgment:`
 * or ` Judgment`) into a leading whitespace prefix, the bare word, and a
 * trailing punctuation suffix. Used so the keyword itself can be tokenized as
 * a glossary `term` while keeping the surrounding whitespace and punctuation
 * intact.
 */
function splitKeywordFragment(fragment: string): {
  prefix: string;
  word: string;
  suffix: string;
} {
  const match = /^(\s*)([A-Za-z]+)(.*)$/.exec(fragment);
  if (match === null) {
    return { prefix: fragment, word: "", suffix: "" };
  }
  return { prefix: match[1], word: match[2], suffix: match[3] };
}

/**
 * Wraps the keyword inside a nobreak fragment in a `term` segment if the
 * keyword is in the glossary, otherwise returns the original text segment.
 *
 * When `arrowPrefixed` is set, the keyword follows a trigger arrow (`▸`), so
 * the glossary lookup includes the arrow — this lets arrow-gated entries such
 * as `▸Materialized` resolve while keeping the displayed word bare.
 */
function maybeWrapKeyword(
  value: string,
  arrowPrefixed: boolean,
): TextSegment[] {
  const { prefix, word, suffix } = splitKeywordFragment(value);
  if (word === "") {
    return [{ kind: "text", value }];
  }
  const entry = lookupGlossaryTerm((arrowPrefixed ? TRIGGER_CHAR : "") + word);
  const segments: TextSegment[] = [];
  if (prefix !== "") {
    segments.push({ kind: "text", value: prefix });
  }
  if (entry !== undefined) {
    segments.push({ kind: "term", word, entry });
  } else {
    segments.push({ kind: "text", value: word });
  }
  if (suffix !== "") {
    segments.push({ kind: "text", value: suffix });
  }
  return segments;
}

/**
 * An intermediate token used by `bindIconsToText` when regrouping segments so
 * inline icons never wrap away from the text they belong to. A `space` is a run
 * of whitespace (a potential line-break point); a `unit` is everything else — a
 * word of plain text, a glossary term, or an icon (`symbol`/`sparkPip`/`bolt`).
 * Each unit carries the segment to render plus the bare `word` used to decide
 * whether it reads as a numeric value.
 */
type Atom =
  | { kind: "space"; value: string }
  | { kind: "unit"; segment: TextSegment; word: string; icon: boolean };

/**
 * True when a unit reads as a numeric value that pairs with a resource symbol —
 * a run containing a digit (covering `2`, `+1`, `≤3`) or the variable `X`. The
 * word in front of such a value is glued to it so e.g. `gains +2✦` never breaks
 * after `gains`.
 */
function isValueWord(word: string): boolean {
  return /\d/.test(word) || word === "X";
}

/** Returns the bare word of a unit atom, or `undefined` for spaces/missing. */
function unitWord(atom: Atom | undefined): string | undefined {
  return atom !== undefined && atom.kind === "unit" ? atom.word : undefined;
}

/** True when the atom at this position is a whitespace run. */
function isSpace(atom: Atom | undefined): boolean {
  return atom !== undefined && atom.kind === "space";
}

/** Splits a flat segment list into atoms (words, spaces, and icons). */
function toAtoms(segments: TextSegment[]): Atom[] {
  const atoms: Atom[] = [];
  for (const segment of segments) {
    if (segment.kind === "text") {
      // Split into alternating whitespace and non-whitespace runs.
      for (const part of segment.value.split(/(\s+)/)) {
        if (part === "") {
          continue;
        }
        if (/\s/.test(part)) {
          atoms.push({ kind: "space", value: part });
        } else {
          atoms.push({
            kind: "unit",
            segment: { kind: "text", value: part },
            word: part,
            icon: false,
          });
        }
      }
      continue;
    }
    const icon =
      segment.kind === "symbol" ||
      segment.kind === "sparkPip" ||
      segment.kind === "bolt" ||
      segment.kind === "essence";
    atoms.push({
      kind: "unit",
      segment,
      word: segment.kind === "term" ? segment.word : "",
      icon,
    });
  }
  return atoms;
}

/**
 * Marks the spaces (by atom index) that must not break so every inline icon
 * stays glued to the text it reads with.
 *
 * Each icon renders as its own inline element, so a line break can land on
 * either side of one — even where the source writes no space (e.g.
 * `▸Materialized`, `2●`). No-space adjacencies need no marking here, because
 * `groupAtoms` keeps touching atoms in the same run regardless; this only has
 * to protect the spaces:
 *   - between a value written a space away from its icon (`2 ●`);
 *   - in front of a value (the word that introduces it), so `gains +2✦` and
 *     `costs 2 ●` stay whole.
 */
function protectedSpaces(atoms: Atom[]): Set<number> {
  const result = new Set<number>();
  for (let i = 0; i < atoms.length; i += 1) {
    const atom = atoms[i];
    if (atom.kind !== "unit" || !atom.icon) {
      continue;
    }
    // Essence carries its amount inside the segment, so glue the word
    // immediately in front of it (`gain 50◆`) — a line must never break right
    // before the number.
    if (
      atom.segment.kind === "essence" &&
      isSpace(atoms[i - 1]) &&
      atoms[i - 2]?.kind === "unit"
    ) {
      result.add(i - 1);
    }
    // A value sits directly against the icon (`+2✦`, `2●`): glue the word in
    // front of the value.
    const attached = unitWord(atoms[i - 1]);
    if (
      attached !== undefined &&
      isValueWord(attached) &&
      isSpace(atoms[i - 2]) &&
      unitWord(atoms[i - 3]) !== undefined
    ) {
      result.add(i - 2);
    }
    // The value is written a space away from the icon (`2 ●`): glue the value,
    // and the word in front of it.
    if (isSpace(atoms[i - 1])) {
      const spaced = unitWord(atoms[i - 2]);
      if (spaced !== undefined && isValueWord(spaced)) {
        result.add(i - 1);
        if (isSpace(atoms[i - 3]) && unitWord(atoms[i - 4]) !== undefined) {
          result.add(i - 3);
        }
      }
    }
  }
  return result;
}

/** Appends a segment, coalescing consecutive plain-text runs into one. */
function pushSegment(list: TextSegment[], segment: TextSegment): void {
  const last = list[list.length - 1];
  if (segment.kind === "text" && last !== undefined && last.kind === "text") {
    list[list.length - 1] = { kind: "text", value: last.value + segment.value };
  } else {
    list.push(segment);
  }
}

/** Maps a cluster of atoms back to segments, coalescing adjacent text runs. */
function clusterSegments(cluster: Atom[]): TextSegment[] {
  const segments: TextSegment[] = [];
  for (const atom of cluster) {
    pushSegment(
      segments,
      atom.kind === "space"
        ? { kind: "text", value: atom.value }
        : atom.segment,
    );
  }
  return segments;
}

/**
 * Regroups atoms into segments, wrapping each run that contains an icon in a
 * `nobreak` group so it renders on one line. Atoms join the same run across
 * no-space adjacencies and across the spaces marked by `protectedSpaces`; an
 * unmarked space ends the current run and renders as an ordinary breakable
 * space.
 */
function groupAtoms(atoms: Atom[], protectedSet: Set<number>): TextSegment[] {
  const out: TextSegment[] = [];
  let cluster: Atom[] = [];
  const flush = () => {
    if (cluster.length === 0) {
      return;
    }
    const hasIcon = cluster.some((a) => a.kind === "unit" && a.icon);
    if (hasIcon && cluster.length > 1) {
      out.push({ kind: "nobreak", segments: clusterSegments(cluster) });
    } else {
      for (const segment of clusterSegments(cluster)) {
        pushSegment(out, segment);
      }
    }
    cluster = [];
  };
  atoms.forEach((atom, i) => {
    if (atom.kind === "space" && !protectedSet.has(i)) {
      flush();
      pushSegment(out, { kind: "text", value: atom.value });
    } else {
      cluster.push(atom);
    }
  });
  flush();
  return out;
}

/**
 * Keeps every inline icon glued to the text it reads with so it never wraps to
 * a line by itself. See `protectedSpaces` for which spaces are held and
 * `groupAtoms` for how runs become `nobreak` segments. Existing `nobreak`
 * trigger groups pass through untouched.
 */
function bindIconsToText(segments: TextSegment[]): TextSegment[] {
  const atoms = toAtoms(segments);
  return groupAtoms(atoms, protectedSpaces(atoms));
}

/**
 * Scans a run of text (with no essence references — those are extracted first by
 * `tokenizeRulesText`) into a flat segment list of plain text, symbols, and
 * glossary terms. The icon-binding pass is applied by the caller across the
 * whole list so it can glue text to essence segments too.
 */
function scanSegments(
  text: string,
  glossaryTerms: boolean = true,
): TextSegment[] {
  const segments: TextSegment[] = [];
  let buffer = "";

  function flushBufferAndExtractTerms() {
    if (buffer.length === 0) {
      return;
    }
    const chunk = buffer;
    buffer = "";
    if (!glossaryTerms) {
      segments.push({ kind: "text", value: chunk });
      return;
    }
    // The common authored trigger form `▸Materialized` (no space) reaches here
    // as a bare keyword after the arrow has been emitted as its own symbol
    // segment. When this chunk's first word sits directly against that arrow,
    // look it up arrow-prefixed so arrow-gated entries (`▸Materialized`)
    // resolve.
    const previous = segments[segments.length - 1];
    const afterTriggerArrow =
      previous !== undefined &&
      previous.kind === "symbol" &&
      previous.symbol === "trigger";
    let cursor = 0;
    let pending = "";
    while (cursor < chunk.length) {
      const tail = chunk.slice(cursor);
      const wordMatch = WORD_RE.exec(tail);
      if (wordMatch === null) {
        pending += chunk[cursor];
        cursor += 1;
        continue;
      }
      const word = wordMatch[0];
      const arrowPrefixed = afterTriggerArrow && cursor === 0;
      const entry = lookupGlossaryTerm(
        (arrowPrefixed ? TRIGGER_CHAR : "") + word,
      );
      if (entry !== undefined) {
        if (pending.length > 0) {
          segments.push({ kind: "text", value: pending });
          pending = "";
        }
        segments.push({ kind: "term", word, entry });
        cursor += word.length;
        continue;
      }
      pending += word;
      cursor += word.length;
    }
    if (pending.length > 0) {
      segments.push({ kind: "text", value: pending });
    }
  }

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    if (char === TRIGGER_CHAR) {
      const rest = text.slice(i);
      const match = TRIGGER_GROUP_RE.exec(rest);
      if (match) {
        flushBufferAndExtractTerms();
        const tail = match[2] ?? "";
        segments.push({
          kind: "nobreak",
          segments: [
            { kind: "symbol", symbol: "trigger", char: TRIGGER_CHAR },
            ...(glossaryTerms
              ? maybeWrapKeyword(`${match[1]}${tail}`, true)
              : [
                  {
                    kind: "text" as const,
                    value: `${match[1]}${tail}`,
                  },
                ]),
          ],
        });
        i += match[0].length;
        continue;
      }
    }

    if (char === SPARK_CHAR) {
      const rest = text.slice(i);
      const match = SPARK_PIP_RE.exec(rest);
      if (match) {
        flushBufferAndExtractTerms();
        segments.push({ kind: "sparkPip", value: match[1] });
        i += match[0].length;
        continue;
      }
    }

    if (char === ACTIVATED_CHAR) {
      // Collapse a run of `❖` into one bolt segment carrying the count, so a
      // single fast marker draws one bolt and the interrupt marker `❖❖` draws
      // two.
      flushBufferAndExtractTerms();
      let count = 0;
      while (text[i] === ACTIVATED_CHAR) {
        count += 1;
        i += 1;
      }
      segments.push({ kind: "bolt", count });
      continue;
    }

    const symbolType = char !== undefined ? SYMBOL_MAP[char] : undefined;
    if (symbolType !== undefined && char !== undefined) {
      flushBufferAndExtractTerms();
      const entry = lookupGlossaryTerm(char);
      segments.push({
        kind: "symbol",
        symbol: symbolType,
        char,
        ...(entry === undefined ? {} : { entry }),
      });
      i += 1;
      if (symbolType === "trigger") {
        while (text[i] === " " || text[i] === "\t") {
          i += 1;
        }
      }
      continue;
    }

    buffer += char;
    i += 1;
  }
  flushBufferAndExtractTerms();
  return segments;
}

/**
 * Parses rules text into segments of plain text, symbols, glossary terms,
 * essence currency values, and journey site names.
 *
 * Essence references are pulled out first (see `splitEssence`) so the amount in
 * front of the word is captured and the word itself dropped; journey site names
 * are then tinted (see `splitSiteNames`); the remaining text runs are scanned
 * for symbols and glossary terms. The icon-binding pass runs once over the
 * combined list so the word in front of an essence amount stays glued to it.
 */
export function tokenizeRulesText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  for (const piece of splitEssence(text)) {
    if (piece.kind !== "text") {
      segments.push(piece);
      continue;
    }
    // Tint site names ("draft site") before scanning the remaining text for
    // symbols and glossary terms.
    for (const sub of splitSiteNames(piece.value)) {
      if (sub.kind === "text") {
        segments.push(...scanSegments(sub.value));
      } else {
        segments.push(sub);
      }
    }
  }
  return bindIconsToText(segments);
}

/**
 * Parses only authored rules symbols while leaving ordinary prose untouched.
 *
 * InfoCard uses this projection for titles, metadata, subtitles, and non-rules
 * RichText fields: the shared symbol map, pip/bolt handling, and no-break
 * binding stay canonical without applying glossary emphasis, site-name color,
 * or textual essence-currency expansion to prose.
 */
export function tokenizeRulesSymbols(text: string): TextSegment[] {
  return bindIconsToText(scanSegments(text, false));
}

/** Format the card type and subtype line. */
export function formatTypeLine(
  card: Pick<CardData, "cardType" | "subtype">,
): string {
  if (card.cardType === "Character") {
    if (card.subtype) {
      return card.subtype;
    }
    return "";
  }

  if (card.subtype) {
    return `${card.cardType} — ${card.subtype}`;
  }
  return card.cardType;
}
