import type { CardData } from "../types/cards";
import { lookupGlossaryTerm, type GlossaryEntry } from "../data/glossary";

/** Symbol types recognized in card rules text. */
export type SymbolType =
  | "energy"
  | "spark"
  | "trigger"
  | "fast"
  | "points"
  | "lunar"
  | "store";

/**
 * A parsed segment of rules text.
 *
 * - `text` is a plain string run.
 * - `symbol` is a recognized glyph rendered with its own styling. Most are
 *   swapped for a Boxicons mark by the renderer: energy → flame, spark →
 *   sparkle, points `⍟` → star-circle, lunar `☪` → moon, store `⧗` →
 *   hourglass, trigger `▸` → caret. The fast bolt `↯` renders as a colored
 *   character.
 * - `nobreak` groups inner segments that must render on the same line. The
 *   renderer wraps them in a `white-space: nowrap` span. Used to keep the
 *   trigger arrow `▸` glued to its keyword (e.g. `▸ Judgment:`) and the fast
 *   bolt `↯` glued to its trailing keyword (e.g. `↯fast`).
 * - `term` is a glossary-recognized word that should render with a hover
 *   popover showing its definition. Carries the matched word as written
 *   (with its original capitalization and trailing punctuation) plus the
 *   resolved glossary entry.
 * - `sparkPip` represents the spark glyph followed immediately by an integer
 *   (e.g. `⍏2`). The renderer draws this as a circled-number `PipBadge` so
 *   inline references match the spark stat badge on character cards.
 * - `bolt` represents the activated-ability marker `❖` (and the interrupt
 *   marker `❖❖`). The renderer draws `count` filled lightning bolts, the same
 *   mark shown before the card name in the title bar — one bolt for a normal
 *   activated ability, two almost-touching bolts for an interrupt.
 */
export type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "symbol"; symbol: SymbolType; char: string }
  | { kind: "nobreak"; segments: TextSegment[] }
  | { kind: "term"; word: string; entry: GlossaryEntry }
  | { kind: "sparkPip"; value: string }
  | { kind: "bolt"; count: number };

/** Maps special Unicode characters to their symbol type. */
const SYMBOL_MAP: Readonly<Record<string, SymbolType>> = {
  "●": "energy",
  // Both the APL `⍏` (used by the inline `⍏N` pip form) and the four-point
  // star `✦` (the inline resource glyph authored in card text, e.g. `+1✦`)
  // are the spark symbol; the renderer draws either as the sparkle mark.
  "⍏": "spark",
  "✦": "spark",
  "▸": "trigger",
  "↯": "fast",
  // Points scored toward winning (rendered as the filled star-circle).
  "⍟": "points",
  // The lunar activation cost (rendered as the filled moon).
  "☪": "lunar",
  // Stored-time counters (rendered as the filled hourglass).
  "⧗": "store",
};

const TRIGGER_CHAR = "▸";
const FAST_CHAR = "↯";
const SPARK_CHAR = "⍏";

/**
 * Activated-ability marker. A single `❖` opens a normal activated ability; two
 * `❖❖` open an interrupt. The renderer collapses a run of these into a single
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
 * Matches a trigger group at the start of a string: the `▸` arrow
 * followed by a single space, a capitalized word, and an optional trailing
 * `:` or `,` (the common separators after `Judgment`, `Materialized`,
 * `Dissolved`, `Banished`, etc.). The whole match is kept on one line by the
 * renderer.
 */
const TRIGGER_GROUP_RE = /^▸ ([A-Z][A-Za-z]*)([:,])?/;

/**
 * Matches a fast keyword group: the `↯` bolt directly attached to a
 * lowercase word (e.g. `↯fast`). The whole match is kept on one line.
 */
const FAST_GROUP_RE = /^↯([a-z]+)/;

/**
 * Matches the next "word" at position 0 of the slice — a run of ASCII
 * letters. Consumed lazily; the loop only consults this when looking for a
 * glossary term.
 */
const WORD_RE = /^[A-Za-z]+/;

/**
 * Splits the contents of a `nobreak` keyword text fragment (e.g. ` Judgment:`
 * or ` Judgment` or `fast`) into a leading whitespace prefix, the bare word,
 * and a trailing punctuation suffix. Used so the keyword itself can be
 * tokenized as a glossary `term` while keeping the surrounding whitespace
 * and punctuation intact.
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
 */
function maybeWrapKeyword(value: string): TextSegment[] {
  const { prefix, word, suffix } = splitKeywordFragment(value);
  if (word === "") {
    return [{ kind: "text", value }];
  }
  const entry = lookupGlossaryTerm(word);
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
 * Matches a trailing number followed by whitespace at the end of a text run,
 * e.g. the `2 ` in `costs 2 `. The whitespace is required: it is the only
 * line-break opportunity between the number and the symbol that follows, so a
 * number butted directly against its symbol (`2●`) needs no grouping. The
 * leading group captures everything before the number so it can stay its own
 * text segment.
 */
const TRAILING_NUMBER_RE = /^([\s\S]*?)(\d+\s+)$/;

/**
 * Keeps a number glued to the resource symbol that immediately follows it.
 *
 * The number and the symbol's icon render as separate inline elements, so the
 * whitespace between them (e.g. the space in `costs 2 ●`) is a line-break
 * opportunity — the layout can leave the `2` at the end of one line and drop
 * the icon to the next. This pass detects a text run ending in a number and
 * whitespace directly before a symbol segment, peels that number (with its
 * trailing whitespace) off the text run, and wraps it together with the symbol
 * in a `nobreak` group so they always render on the same line. The trigger and
 * fast keyword groups already carry their own `nobreak`, so their symbols are
 * never bare here.
 */
function bindNumbersToSymbols(segments: TextSegment[]): TextSegment[] {
  const result: TextSegment[] = [];
  for (const segment of segments) {
    if (segment.kind !== "symbol") {
      result.push(segment);
      continue;
    }
    const prev = result[result.length - 1];
    if (prev === undefined || prev.kind !== "text") {
      result.push(segment);
      continue;
    }
    const match = TRAILING_NUMBER_RE.exec(prev.value);
    if (match === null) {
      result.push(segment);
      continue;
    }
    result.pop();
    if (match[1] !== "") {
      result.push({ kind: "text", value: match[1] });
    }
    result.push({
      kind: "nobreak",
      segments: [{ kind: "text", value: match[2] }, segment],
    });
  }
  return result;
}

/** Parses rules text into segments of plain text, symbols, and glossary terms. */
export function tokenizeRulesText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let buffer = "";

  function flushBufferAndExtractTerms() {
    if (buffer.length === 0) {
      return;
    }
    const chunk = buffer;
    buffer = "";
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
      const entry = lookupGlossaryTerm(word);
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
            ...maybeWrapKeyword(` ${match[1]}${tail}`),
          ],
        });
        i += match[0].length;
        continue;
      }
    }

    if (char === FAST_CHAR) {
      const rest = text.slice(i);
      const match = FAST_GROUP_RE.exec(rest);
      if (match) {
        flushBufferAndExtractTerms();
        segments.push({
          kind: "nobreak",
          segments: [
            { kind: "symbol", symbol: "fast", char: FAST_CHAR },
            ...maybeWrapKeyword(match[1]),
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
      // single marker draws one bolt and the interrupt marker `❖❖` draws two.
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
      segments.push({ kind: "symbol", symbol: symbolType, char });
      i += 1;
      continue;
    }

    buffer += char;
    i += 1;
  }
  flushBufferAndExtractTerms();
  return bindNumbersToSymbols(segments);
}

/** Format the card type and subtype line. */
export function formatTypeLine(card: Pick<CardData, "cardType" | "subtype">): string {
  if (card.cardType === "Character") {
    if (card.subtype && card.subtype !== "" && card.subtype !== "*") {
      return card.subtype;
    }
    return "";
  }

  if (card.subtype && card.subtype !== "" && card.subtype !== "*") {
    return `${card.cardType} — ${card.subtype}`;
  }
  return card.cardType;
}
