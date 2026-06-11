import { type CSSProperties, type ReactNode } from "react";
import { tokenizeRulesText, type TextSegment } from "./card-text";
import {
  TRANSFIGURE_MARK_END,
  TRANSFIGURE_MARK_START,
} from "../transfiguration/transfiguration-logic";
import { PipBadge } from "./PipBadge";
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
 *   - the points `⍟`, lunar `☪`, store `⧗`, and trigger `▸` glyphs swapped
 *     for their filled marks (star-circle, moon, hourglass, caret), the
 *     trigger keeping its muted slate
 *   - the fast `↯` glyph colored
 *   - glossary terms (Materialized, Judgment, Reclaim, Foresee, void,
 *     spark, ally, fast, etc.) as plain prose; a few keyword effects (e.g.
 *     `Prevent`) carry a spark-amber emphasis so the eye catches them. The
 *     plain-language definitions for every term on a card surface beside it
 *     in the card's hover-help panel (see `CardTermDefinitions`).
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

/**
 * Symbol types that render as an inline Boxicons mark sized to the surrounding
 * text. Energy and spark keep their dedicated branches below (each pins a
 * resource hue with a matching corner stat); these are the remaining glyphs
 * swapped for a filled icon. The trigger caret keeps the muted slate it has
 * always used so it reads as a typographic guide rather than a UI alert; the
 * rest inherit the rules-text color.
 */
const SYMBOL_ICON_CLASSES: Readonly<
  Record<string, { className: string; color?: string; label: string }>
> = {
  trigger: {
    className: "bxf bx-caret-right",
    color: SYMBOL_COLORS.trigger,
    label: "trigger",
  },
  points: { className: "bxf bx-star-circle", label: "points" },
  lunar: { className: "bxf bx-moon", label: "lunar" },
  store: { className: "bxf bx-hourglass", label: "stored time" },
};

/**
 * Glossary terms that render in the spark amber color wherever they appear in
 * rules text. These are keyword effects worth drawing the eye to (e.g.
 * `Prevent`). Matched against `GlossaryEntry.term` so every authored variant
 * (`prevent`, `prevented`) picks up the same emphasis.
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
   * When set, runs of text wrapped in transfigure markers (see
   * `TRANSFIGURE_MARK_START` / `TRANSFIGURE_MARK_END`) are painted in this color
   * and given a slightly heavier weight, so only the transfigured span of a
   * card's rules text is tinted. Text outside the markers renders normally.
   */
  highlightColor?: string;
}

/** One run of a paragraph, flagged for whether it is a transfigured span. */
interface MarkerChunk {
  text: string;
  highlighted: boolean;
}

/**
 * Splits a paragraph on the transfigure marker characters into alternating
 * plain and highlighted runs. Markers are placed at clause/word boundaries by
 * `buildTransfigurationDisplay`, so each run tokenizes cleanly on its own.
 */
function splitOnMarkers(paragraph: string): MarkerChunk[] {
  const chunks: MarkerChunk[] = [];
  let buffer = "";
  let highlighted = false;
  for (const ch of paragraph) {
    if (ch === TRANSFIGURE_MARK_START || ch === TRANSFIGURE_MARK_END) {
      if (buffer.length > 0) {
        chunks.push({ text: buffer, highlighted });
        buffer = "";
      }
      highlighted = ch === TRANSFIGURE_MARK_START;
      continue;
    }
    buffer += ch;
  }
  if (buffer.length > 0) {
    chunks.push({ text: buffer, highlighted });
  }
  return chunks;
}

/** Strips any stray transfigure markers from a string. */
function stripMarkers(text: string): string {
  return text
    .split(TRANSFIGURE_MARK_START)
    .join("")
    .split(TRANSFIGURE_MARK_END)
    .join("");
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
    // Glossary terms read as plain prose; their definitions surface beside the
    // card in its hover-help panel rather than as per-word tooltips. A few
    // keyword effects keep a spark-amber emphasis so the eye still catches them.
    const emphasis = EMPHASIZED_TERMS.has(segment.entry.term)
      ? EMPHASIZED_TERM_STYLE
      : undefined;
    return (
      <span key={key} style={emphasis}>
        {segment.word}
      </span>
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
    // oversized box. The sparkle's mass sits a touch low in its em box, so a
    // small upward nudge centers it on the adjacent number and text.
    return (
      <i
        key={key}
        aria-label="spark"
        className={`${SPARK_INLINE_ICON_CLASS} align-middle`}
        style={{ color: SPARK_ICON_COLOR, transform: "translateY(-0.09em)" }}
      />
    );
  }
  const iconSpec = SYMBOL_ICON_CLASSES[segment.symbol];
  if (iconSpec !== undefined) {
    // The glyph renders as a filled Boxicons mark flowing inline with the text.
    // The marks' mass sits low in their em box, so a small upward nudge centers
    // them on the line instead of riding the baseline.
    return (
      <i
        key={key}
        aria-label={iconSpec.label}
        className={`${iconSpec.className} align-middle`}
        style={{ color: iconSpec.color, transform: "translateY(-0.06em)" }}
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
 * Cards in `data/tabula/cards_v2.toml` separate distinct abilities with
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
    const style: CSSProperties = p === 0 ? {} : { marginTop: PARAGRAPH_GAP };
    return (
      <div key={p} data-rules-text-paragraph="" style={style}>
        {renderParagraph(paragraph, p, options)}
      </div>
    );
  });
}

/**
 * Renders one ability paragraph. With a `highlightColor` set, the paragraph is
 * split on transfigure markers so each transfigured run is tokenized on its own
 * and wrapped in a tinted, slightly heavier span; runs outside the markers
 * render normally. Without a highlight color any stray markers are stripped and
 * the paragraph tokenizes as a single run.
 */
function renderParagraph(
  paragraph: string,
  p: number,
  options: RenderRulesTextOptions,
): ReactNode[] {
  if (options.highlightColor === undefined) {
    const segments = tokenizeRulesText(stripMarkers(paragraph));
    return segments.map((segment, i) =>
      renderSegment(segment, `${p}-${i}`, options),
    );
  }
  const chunks = splitOnMarkers(paragraph);
  return chunks.map((chunk, c) => {
    const segments = tokenizeRulesText(chunk.text);
    const nodes = segments.map((segment, i) =>
      renderSegment(segment, `${p}-${c}-${i}`, options),
    );
    if (!chunk.highlighted) {
      return <span key={`${p}-${c}`}>{nodes}</span>;
    }
    return (
      <span
        key={`${p}-${c}`}
        data-transfigured=""
        style={{ color: options.highlightColor, fontWeight: 600 }}
      >
        {nodes}
      </span>
    );
  });
}

/**
 * Renders rules text inline.
 *
 * Use as a drop-in for any place that prints `card.renderedText`,
 * `dreamcaller.renderedText`, or `dreamsign.effectDescription` raw — the
 * tokenizer handles the symbol substitution and glossary-term emphasis.
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
