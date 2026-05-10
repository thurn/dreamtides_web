import type { CardData } from "../types/cards";

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
 */
export type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "symbol"; symbol: SymbolType; char: string }
  | { kind: "nobreak"; segments: TextSegment[] };

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

/** Parses rules text into segments of plain text and special symbols. */
export function tokenizeRulesText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let buffer = "";

  function flushBuffer() {
    if (buffer.length > 0) {
      segments.push({ kind: "text", value: buffer });
      buffer = "";
    }
  }

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    if (char === TRIGGER_CHAR) {
      const rest = text.slice(i);
      const match = TRIGGER_GROUP_RE.exec(rest);
      if (match) {
        flushBuffer();
        const tail = match[2] ?? "";
        segments.push({
          kind: "nobreak",
          segments: [
            { kind: "symbol", symbol: "trigger", char: TRIGGER_CHAR },
            { kind: "text", value: ` ${match[1]}${tail}` },
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
        flushBuffer();
        segments.push({
          kind: "nobreak",
          segments: [
            { kind: "symbol", symbol: "fast", char: FAST_CHAR },
            { kind: "text", value: match[1] },
          ],
        });
        i += match[0].length;
        continue;
      }
    }

    const symbolType = char !== undefined ? SYMBOL_MAP[char] : undefined;
    if (symbolType !== undefined && char !== undefined) {
      flushBuffer();
      segments.push({ kind: "symbol", symbol: symbolType, char });
      i += 1;
      continue;
    }

    buffer += char;
    i += 1;
  }
  flushBuffer();
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
