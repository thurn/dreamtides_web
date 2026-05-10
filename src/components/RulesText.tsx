import { type CSSProperties, type ReactNode } from "react";
import {
  tokenizeRulesText,
  type TextSegment,
} from "./card-text";
import { HoverPopover } from "./HoverPopover";
import { PipBadge } from "./PipBadge";
import type { GlossaryEntry } from "../data/glossary";

/**
 * Renders rules text with:
 *   - the energy `●` glyph swapped for the Boxicons `bxs-flame`
 *   - the spark `⍏`, trigger `▸`, and fast `↯` glyphs colored
 *   - glossary terms (Materialized, Judgment, Reclaim, Foresee, void,
 *     spark, ally, fast, etc.) wrapped in an underlined hover popover
 *     showing their plain-language definition
 *
 * Used by `CardDisplay`, `DreamcallerPopover`, and the dreamsign cards on
 * `DreamsignDraftScreen` / `DreamsignOfferingScreen`. Single source of
 * truth for rules-text rendering. New surfaces should call this rather
 * than duplicate the JSX.
 */

/**
 * Color used for each symbol type when rendering rules text.
 *
 * The trigger arrow `▸` uses the muted slate (`#94a3b8`, slate-400) shared
 * with secondary text elsewhere (Dreamcaller subtitle, room-gate hints). It
 * marks the start of a triggered ability without competing for attention
 * with the actual rules text or the glossary keyword that follows. Using
 * the same accent orange as the draft selection ring or HUD warnings made
 * the arrow read as a UI alert rather than a typographic guide.
 */
const SYMBOL_COLORS: Readonly<Record<string, string>> = {
  energy: "#fbbf24",
  spark: "#c084fc",
  trigger: "#94a3b8",
  fast: "#facc15",
};

/** Boxicons class used to render the energy symbol. */
const ENERGY_ICON_CLASS = "bx bxs-flame";

/** Inline-block trigger styling so the underline stays close to the word. */
const TERM_STYLE: CSSProperties = {
  textDecoration: "underline dotted",
  textUnderlineOffset: 2,
  cursor: "help",
  pointerEvents: "auto",
};

interface RulesTextProps {
  /** The rules text to render. */
  text: string;
  /** Optional override color for plain text. */
  color?: string;
}

function GlossaryDefinitionCard({
  entry,
}: {
  entry: GlossaryEntry;
}) {
  return (
    <div
      className="rounded-md px-3 py-2 text-xs leading-snug shadow-lg"
      style={{
        background: "rgba(15, 10, 24, 0.96)",
        border: "1px solid rgba(168, 85, 247, 0.55)",
        color: "#e2e8f0",
        boxShadow: "0 8px 22px rgba(0, 0, 0, 0.55)",
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: "#c4b5fd" }}
      >
        {entry.term}
      </p>
      <p className="mt-1" style={{ color: "#f8fafc" }}>
        {entry.definition}
      </p>
    </div>
  );
}

function renderSegment(segment: TextSegment, key: number | string): ReactNode {
  if (segment.kind === "text") {
    return <span key={key}>{segment.value}</span>;
  }
  if (segment.kind === "nobreak") {
    return (
      <span key={key} style={{ whiteSpace: "nowrap" }}>
        {segment.segments.map((inner, j) => renderSegment(inner, `${key}-${j}`))}
      </span>
    );
  }
  if (segment.kind === "term") {
    return (
      <HoverPopover
        key={key}
        style={TERM_STYLE}
        content={<GlossaryDefinitionCard entry={segment.entry} />}
      >
        {segment.word}
      </HoverPopover>
    );
  }
  if (segment.kind === "sparkPip") {
    return (
      <span key={key} className="inline-flex align-middle">
        <PipBadge variant="spark" value={segment.value} size="sm" />
      </span>
    );
  }
  if (segment.symbol === "energy") {
    return (
      <i
        key={key}
        aria-label="energy"
        className={`${ENERGY_ICON_CLASS} align-middle`}
        style={{ color: SYMBOL_COLORS.energy }}
      />
    );
  }
  return (
    <span
      key={key}
      className="font-bold"
      style={{ color: SYMBOL_COLORS[segment.symbol] }}
    >
      {segment.char}
    </span>
  );
}

/**
 * Splits rules text into ability paragraphs.
 *
 * Cards in `data/tabula/rendered-cards.toml` separate distinct abilities with
 * a blank line (`\n\n`). Each chunk between blank lines is one ability and
 * renders as its own paragraph block so the player can tell adjacent
 * abilities apart. A single-ability card produces exactly one paragraph and
 * no inter-ability gap. See backlog task 029.
 *
 * Surrounding whitespace and stray empty strings are trimmed so a leading
 * newline (some TOML entries open with `"""\n`) does not produce an empty
 * paragraph.
 */
function splitRulesTextIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

/**
 * Top margin applied to every ability paragraph after the first. Expressed
 * in `em` so the gap scales with the surrounding font size — small card
 * chrome (`text-[10px]`) gets a proportionally smaller gap than the large
 * card or popover surfaces (`text-base`). The visual goal is "list items",
 * not "essay paragraphs": generous-but-restrained spacing. See backlog
 * task 029.
 */
const PARAGRAPH_GAP_EM = 0.5;

/** Renders the parsed rules text segments to React nodes. */
export function renderRulesText(text: string): ReactNode[] {
  const paragraphs = splitRulesTextIntoParagraphs(text);
  return paragraphs.map((paragraph, p) => {
    const segments = tokenizeRulesText(paragraph);
    const style: CSSProperties =
      p === 0 ? {} : { marginTop: `${String(PARAGRAPH_GAP_EM)}em` };
    return (
      <div
        key={p}
        data-rules-text-paragraph=""
        style={style}
      >
        {segments.map((segment, i) => renderSegment(segment, `${p}-${i}`))}
      </div>
    );
  });
}

/**
 * Renders rules text inline.
 *
 * Use as a drop-in for any place that prints `card.renderedText`,
 * `dreamcaller.renderedText`, or `dreamsign.effectDescription` raw — the
 * tokenizer handles the symbol substitution and the glossary tooltip
 * lookup.
 */
export function RulesText({ text, color }: RulesTextProps) {
  if (color !== undefined) {
    // The renderer produces `<div>` paragraph blocks (see `renderRulesText`),
    // so the color wrapper is also a `<div>` to keep block-in-block HTML
    // nesting valid.
    return <div style={{ color }}>{renderRulesText(text)}</div>;
  }
  return <>{renderRulesText(text)}</>;
}
