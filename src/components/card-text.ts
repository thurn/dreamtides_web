import type { CardData } from "../types/cards";
import { lookupGlossaryTerm, type GlossaryEntry } from "../data/glossary";

/** Symbol types recognized in card rules text. */
export type SymbolType = "energy" | "spark" | "trigger" | "fast";

/**
 * A parsed segment of rules text.
 *
 * - `text` is a plain string run.
 * - `symbol` is a recognized glyph rendered with its own styling (and, for
 *   energy, swapped for the Boxicons flame).
 * - `nobreak` groups inner segments that must render on the same line. The
 *   renderer wraps them in a `white-space: nowrap` span. Used to keep the
 *   trigger arrow `▸` glued to its keyword (e.g. `▸ Judgment:`) and the fast
 *   bolt `↯` glued to its trailing keyword (e.g. `↯fast`).
 * - `term` is a glossary-recognized word that should render with a hover
 *   popover showing its definition. Carries the matched word as written
 *   (with its original capitalization and trailing punctuation) plus the
 *   resolved glossary entry.
 */
export type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "symbol"; symbol: SymbolType; char: string }
  | { kind: "nobreak"; segments: TextSegment[] }
  | { kind: "term"; word: string; entry: GlossaryEntry };

/** Maps special Unicode characters to their symbol type. */
const SYMBOL_MAP: Readonly<Record<string, SymbolType>> = {
  "●": "energy",
  "⍏": "spark",
  "▸": "trigger",
  "↯": "fast",
};

const TRIGGER_CHAR = "▸";
const FAST_CHAR = "↯";

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
  return segments;
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
