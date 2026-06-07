import { type CSSProperties, type ReactNode } from "react";
import {
  tokenizeRulesText,
  type TextSegment,
} from "./card-text";
import { HoverPopover } from "./HoverPopover";
import { PipBadge } from "./PipBadge";
import { GlossaryDefinitionCard } from "./GlossaryDefinitionCard";
import {
  BOLT_ICON_CLASS,
  ENERGY_ICON_CLASS,
  ENERGY_ICON_COLOR,
  SPARK_ICON_COLOR,
  SPARK_INLINE_ICON_CLASS,
} from "./GlowIcon";

/**
 * Renders rules text with:
 *   - the energy `●` glyph swapped for the blue flame (`bxf bx-fire-alt`)
 *   - the spark `✦` glyph swapped for the amber-gold sparkle mark
 *   - the activated-ability marker `❖` (and interrupt `❖❖`) swapped for the
 *     filled lightning bolt(s) shown before the card name in the title bar
 *   - the trigger `▸` and fast `↯` glyphs colored
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
  trigger: "#94a3b8",
  fast: "#facc15",
};

/**
 * White fill for the inline activated-ability bolt, matching the filled bolt
 * the title bar shows before the card name so the two read as the same mark.
 */
const BOLT_ICON_COLOR = "#ffffff";

/** Inline-block trigger styling so the underline stays close to the word. */
const TERM_STYLE: CSSProperties = {
  textDecoration: "underline dotted",
  textUnderlineOffset: 2,
  cursor: "help",
  pointerEvents: "auto",
};

/**
 * Glossary terms that render in the spark amber color wherever they appear in
 * rules text, on top of the usual glossary underline/popover. These are
 * keyword effects worth drawing the eye to (e.g. `Prevent`). Matched against
 * `GlossaryEntry.term` so every authored variant (`prevent`, `prevented`)
 * picks up the same emphasis.
 */
const EMPHASIZED_TERMS: ReadonlySet<string> = new Set(["Prevent"]);

/** Spark-amber emphasis layered onto an emphasized glossary term. */
const EMPHASIZED_TERM_STYLE: CSSProperties = {
  color: SPARK_ICON_COLOR,
};

interface RulesTextProps {
  /** The rules text to render. */
  text: string;
  /** Optional override color for plain text. */
  color?: string;
  /** Optional scale for inline resource pips on small card surfaces. */
  pipScale?: number;
}

interface RenderRulesTextOptions {
  pipScale?: number;
  /**
   * When true, glossary terms render as plain text instead of underlined hover
   * popovers. Surfaces that present many cards at once (e.g. the card editor)
   * use this to keep the rules text calm and non-distracting.
   */
  disableGlossary?: boolean;
}

function renderSegment(
  segment: TextSegment,
  key: number | string,
  options: RenderRulesTextOptions,
): ReactNode {
  if (segment.kind === "text") {
    return <span key={key}>{segment.value}</span>;
  }
  if (segment.kind === "nobreak") {
    return (
      <span key={key} style={{ whiteSpace: "nowrap" }}>
        {segment.segments.map((inner, j) =>
          renderSegment(inner, `${key}-${j}`, options),
        )}
      </span>
    );
  }
  if (segment.kind === "term") {
    const emphasis = EMPHASIZED_TERMS.has(segment.entry.term)
      ? EMPHASIZED_TERM_STYLE
      : undefined;
    if (options.disableGlossary === true) {
      return (
        <span key={key} style={emphasis}>
          {segment.word}
        </span>
      );
    }
    return (
      <HoverPopover
        key={key}
        style={{ ...TERM_STYLE, ...emphasis }}
        content={<GlossaryDefinitionCard entry={segment.entry} />}
      >
        {segment.word}
      </HoverPopover>
    );
  }
  if (segment.kind === "sparkPip") {
    return (
      <span key={key} className="inline-flex align-middle">
        <PipBadge
          variant="spark"
          value={segment.value}
          size="sm"
          scale={options.pipScale}
        />
      </span>
    );
  }
  if (segment.kind === "bolt") {
    // The activated-ability marker renders as the filled lightning bolt — the
    // same white mark the title bar shows before the card name. A single bolt
    // opens a normal activated ability; an interrupt draws two bolts pulled
    // together so they almost touch (matching the title-bar treatment). The
    // bolt's mass sits low in its em box, so a small upward nudge centers it on
    // the text. The whole group stays on one line.
    return (
      <span
        key={key}
        aria-label={segment.count >= 2 ? "interrupt" : "activated ability"}
        style={{ color: BOLT_ICON_COLOR, whiteSpace: "nowrap" }}
      >
        {Array.from({ length: segment.count }, (_, index) => (
          <i
            key={index}
            className={`${BOLT_ICON_CLASS} align-middle`}
            style={{
              transform: "translateY(-0.05em)",
              // Pull each bolt after the first inward so an interrupt's two
              // bolts almost touch.
              marginLeft: index === 0 ? undefined : "-0.35em",
            }}
            aria-hidden="true"
          />
        ))}
      </span>
    );
  }
  if (segment.symbol === "energy") {
    // The inline energy glyph renders as the blue flame mark, so a `●3` reads as
    // the same resource as the corner energy stat. Rendered as a plain inline
    // `<i>` (sized to the surrounding text) so it flows like a character rather
    // than reserving a square box. The flame's mass sits low in its em box, so a
    // small upward nudge centers it on the text instead of sitting below the
    // line.
    return (
      <i
        key={key}
        aria-label="energy"
        className={`${ENERGY_ICON_CLASS} align-middle`}
        style={{
          color: ENERGY_ICON_COLOR,
          transform: "translateY(-0.08em)",
        }}
      />
    );
  }
  if (segment.symbol === "spark") {
    // The inline spark glyph renders as the amber-gold single-sparkle mark, so a
    // `1✦` reads as the same resource as the corner spark stat (which uses the
    // busier multi-star glyph at its larger size). Like the energy flame it is a
    // plain inline `<i>` so it flows with the text instead of sitting in an
    // oversized box.
    return (
      <i
        key={key}
        aria-label="spark"
        className={`${SPARK_INLINE_ICON_CLASS} align-middle`}
        style={{ color: SPARK_ICON_COLOR }}
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
 * Top margin applied to every ability paragraph after the first, sizing the
 * blank line that separates two abilities to a slim fraction of a full blank
 * line. The margin sits on top of each line's leading, so even a small value
 * reads as a clear break between abilities; keeping it tight packs more
 * abilities into the fixed text box (and lets more cards hold the rules-text
 * cap before the font shrinks) while still reading as separate "list items"
 * rather than "essay paragraphs".
 *
 * The actual size lives in the `--cv-paragraph-gap` design token (see
 * `index.css`) so it can be tuned alongside the other card-view spacing
 * variables. It is expressed in `em` there so it scales with the surrounding
 * (possibly auto-shrunk) font size. The literal fallback keeps the gap sane on
 * any surface that renders rules text without the card-view token in scope.
 * See backlog task 029.
 */
const PARAGRAPH_GAP = "var(--cv-paragraph-gap, 0.22em)";

/** Renders the parsed rules text segments to React nodes. */
export function renderRulesText(
  text: string,
  options: RenderRulesTextOptions = {},
): ReactNode[] {
  const paragraphs = splitRulesTextIntoParagraphs(text);
  return paragraphs.map((paragraph, p) => {
    const segments = tokenizeRulesText(paragraph);
    const style: CSSProperties =
      p === 0 ? {} : { marginTop: PARAGRAPH_GAP };
    return (
      <div
        key={p}
        data-rules-text-paragraph=""
        style={style}
      >
        {segments.map((segment, i) =>
          renderSegment(segment, `${p}-${i}`, options),
        )}
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
export function RulesText({ text, color, pipScale }: RulesTextProps) {
  if (color !== undefined) {
    // The renderer produces `<div>` paragraph blocks (see `renderRulesText`),
    // so the color wrapper is also a `<div>` to keep block-in-block HTML
    // nesting valid.
    return <div style={{ color }}>{renderRulesText(text, { pipScale })}</div>;
  }
  return <>{renderRulesText(text, { pipScale })}</>;
}
